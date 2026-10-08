import type { Finding } from '@gyde/contracts';

import type { AnalysisJob, ParsedProject } from '../types';

/** AbstractProduct A: extracts the dependencies of a project, locally. */
export interface DependencyParser {
  parseDependencies(): Promise<ParsedProject>;
}

export type VulnerabilitySource = 'osv' | 'nvd';

/**
 * AbstractProduct B: the client-side adapter to the vulnerability stage of a remote analysis.
 * It never queries NVD/OSV directly: only the Pipeline de Normalización talks to external
 * sources (architecture decision, see docs/adr/).
 */
export interface VulnerabilityFetcher {
  /** Knowledge source this fetcher represents; used to keep the matching evidence. */
  readonly source: VulnerabilitySource;
  fetchVulnerabilities(job: AnalysisJob): Promise<Finding[]>;
}

/**
 * ABSTRACT FACTORY: creates a family of related tools that must be used together, so a Unity
 * project can never be analyzed with the C++ parser. Adding an engine (Godot) means adding one
 * factory, without touching the pipeline.
 */
export interface AnalysisToolchainFactory {
  createDependencyParser(): DependencyParser;
  createVulnerabilityFetcher(): VulnerabilityFetcher;
}
