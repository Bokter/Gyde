import {
  type AnalyzerName,
  type BaseAnalyzer,
  compareFindings,
} from '../../domain/analyzers/base-analyzer';

import type { KnowledgeEntry } from '../../domain/model';

import type {
  AnalysisFailureDto,
  DeterministicResultDto,
  PlanFeaturesDto,
  RetrieveEvidenceDto,
} from '../dto/retrieval.dto';
import { KnowledgeUnavailableError, LlmUnavailableError } from '../errors';
import type { LlmClient, ReportsClient } from '../ports/downstream';
import type { KnowledgeSource } from '../ports/knowledge-source';

/** What the use case needs from an analyzer (every `BaseAnalyzer` satisfies it). */
export type Analyzer = Pick<BaseAnalyzer<unknown, unknown>, 'name' | 'analyze'>;

export interface RetrieveEvidenceDeps {
  knowledge: KnowledgeSource;
  reports: ReportsClient;
  llm: LlmClient;
  /** The analyzers enabled for this deployment; each one is gated by the plan's entitlements. */
  analyzers: readonly Analyzer[];
  /** Where unexpected errors go (the logger). The messages sent to Reports never carry them. */
  onError?: (error: unknown, context: { analysisId: string; step: string }) => void;
}

/** Which plan feature each analyzer needs. Vulnerabilities are part of every plan. */
const GATES: Record<AnalyzerName, (features: PlanFeaturesDto) => boolean> = {
  vulnerabilities: () => true,
  licenses: (features) => features.licenseCompliance,
  compatibility: (features) => features.compatibilityAnalysis,
};

/** Most dependencies one request can carry (the contract limit); asks for all their knowledge. */
const KNOWLEDGE_LIMIT = 5000;

/**
 * Use case: Reports asks Retrieval for the evidence of one analysis.
 *
 *  1. Ask the normalization service for the knowledge about the requested packages.
 *  2. Run the analyzers the plan allows (licenses, compatibility, vulnerabilities).
 *  3. Publish the DETERMINISTIC result to Reports. From this moment the report can be delivered,
 *     whatever happens with the AI.
 *  4. If the plan allows AI and the client asked for it, dispatch the evidence to llm-analysis.
 *  5. If step 1 or 2 fails, publish an AnalysisFailure (`retrieval-error`) instead of hanging.
 *  6. If the call to llm-analysis fails or its circuit is open (the service is down), publish an
 *     AnalysisFailure with stage `llm` and reason `llm-unavailable`: only Retrieval notices it.
 *
 * `execute` never rejects: whatever goes wrong becomes a failure published to Reports (or, if even
 * that cannot be delivered, a call to `onError`).
 */
export class RetrieveEvidenceUseCase {
  private readonly deps: RetrieveEvidenceDeps;

  constructor(deps: RetrieveEvidenceDeps) {
    this.deps = deps;
  }

  async execute(job: RetrieveEvidenceDto): Promise<void> {
    const { analysisId } = job;

    let result: DeterministicResultDto;
    try {
      result = await this.analyze(job);
    } catch (error) {
      this.deps.onError?.(error, { analysisId, step: 'analysis' });
      await this.fail({
        analysisId,
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'Retrieval could not complete the deterministic analysis.',
      });
      return;
    }

    try {
      await this.deps.reports.publishDeterministicResult(result);
    } catch (error) {
      this.deps.onError?.(error, { analysisId, step: 'publish-deterministic-result' });
      await this.fail({
        analysisId,
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'The deterministic result could not be delivered to Reports.',
      });
      return;
    }

    await this.dispatchToLlm(job, result);
  }

  private async analyze(job: RetrieveEvidenceDto): Promise<DeterministicResultDto> {
    const { dependencies, features, analysisId } = job;
    const enabled = this.deps.analyzers.filter((analyzer) => GATES[analyzer.name](features));
    const { entries, partial } = await this.fetchKnowledge(job);

    const results = enabled.map((analyzer) =>
      analyzer.analyze({ request: { dependencies }, knowledge: entries }),
    );
    // One list for the whole report: most severe first, whichever analyzer found it.
    const findings = results.flatMap((result) => result.findings).sort(compareFindings);
    const ran = (name: AnalyzerName) => enabled.some((analyzer) => analyzer.name === name);

    return {
      analysisId,
      findings,
      evidence: findings.flatMap((finding) => finding.evidence),
      coverage: {
        vulnerabilities: ran('vulnerabilities'),
        compatibility: ran('compatibility'),
        licenses: ran('licenses'),
      },
      partialSources: partial,
    };
  }

  /** Without normalization the deterministic analysis still runs on what needs no knowledge. */
  private async fetchKnowledge(
    job: RetrieveEvidenceDto,
  ): Promise<{ entries: readonly KnowledgeEntry[]; partial: boolean }> {
    const { dependencies, project } = job;
    if (dependencies.length === 0) return { entries: [], partial: false };

    const seen = new Set<string>();
    const packages = dependencies.flatMap(({ ecosystem, name, version }) => {
      const key = `${ecosystem}\u0000${name}\u0000${version}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ecosystem, name, version }];
    });

    try {
      return await this.deps.knowledge.query({
        packages,
        gameEngine: project.gameEngine,
        limit: KNOWLEDGE_LIMIT,
      });
    } catch (error) {
      if (error instanceof KnowledgeUnavailableError) {
        this.deps.onError?.(error, { analysisId: job.analysisId, step: 'knowledge' });
        return { entries: [], partial: true };
      }
      throw error;
    }
  }

  private async dispatchToLlm(
    job: RetrieveEvidenceDto,
    result: DeterministicResultDto,
  ): Promise<void> {
    const { analysisId, tenantId, features, project, includeAi } = job;
    if (!features.aiEnrichment || !includeAi) return;

    try {
      await this.deps.llm.dispatch({
        analysisId,
        tenantId,
        project,
        findings: result.findings,
        evidence: result.evidence,
      });
    } catch (error) {
      this.deps.onError?.(error, { analysisId, step: 'dispatch-to-llm' });
      const unavailable = error instanceof LlmUnavailableError;
      await this.fail({
        analysisId,
        stage: 'llm',
        reason: unavailable ? 'llm-unavailable' : 'llm-error',
        message: unavailable
          ? 'llm-analysis could not be reached; the report stays deterministic.'
          : 'llm-analysis rejected the request; the report stays deterministic.',
      });
    }
  }

  /** Best effort: if Reports cannot be told either, there is nobody left to tell. */
  private async fail(failure: AnalysisFailureDto): Promise<void> {
    try {
      await this.deps.reports.publishFailure(failure);
    } catch (error) {
      this.deps.onError?.(error, { analysisId: failure.analysisId, step: 'publish-failure' });
    }
  }
}
