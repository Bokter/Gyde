import { sampleLicenseFinding, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  MODEL_SYSTEM_PROMPT,
  applyModelPayload,
  buildUserPrompt,
  extractJsonText,
} from '../src/domain/prompt';
import { redactSecrets, truncateMessage } from '../src/domain/redact';
import { parseModelOutput } from '../src/infrastructure/providers/model-output.parser';
import { analysisPayload } from './support/fake-services';

describe('buildUserPrompt', () => {
  it('serializes only analysisId, project, findings and evidence, in that order', () => {
    const request = analysisPayload();
    expect(buildUserPrompt(request)).toBe(
      JSON.stringify({
        analysisId: request.analysisId,
        project: request.project,
        findings: request.findings,
        evidence: request.evidence,
      }),
    );
    expect(buildUserPrompt(request)).not.toContain('tenant-1');
  });

  it('keeps the system prompt asking for one JSON object', () => {
    expect(MODEL_SYSTEM_PROMPT).toContain('Answer with ONLY one JSON object');
  });
});

describe('applyModelPayload', () => {
  const request = analysisPayload();
  const [vuln, license] = [sampleVulnerabilityFinding, sampleLicenseFinding];

  it('orders by the model, adds the explanation and never touches a fact', () => {
    const result = applyModelPayload(request, {
      summary: 'S',
      explanations: [
        { id: license.id, aiExplanation: 'L' },
        { id: vuln.id, aiExplanation: 'V' },
      ],
    });
    expect(result).toEqual({
      analysisId: request.analysisId,
      summary: 'S',
      findings: [
        { ...license, aiExplanation: 'L' },
        { ...vuln, aiExplanation: 'V' },
      ],
    });
  });

  it('keeps unexplained findings after the explained ones, in their own order', () => {
    const result = applyModelPayload(request, {
      explanations: [{ id: license.id, aiExplanation: 'L' }],
    });
    expect(result.findings.map((f) => f.id)).toEqual([license.id, vuln.id]);
    expect(result.findings[1]).toEqual(vuln);
    expect(result.summary).toBeUndefined();
  });

  it('rejects an unknown or a duplicated finding', () => {
    expect(() =>
      applyModelPayload(request, { explanations: [{ id: 'ghost', aiExplanation: 'x' }] }),
    ).toThrow('The model explained an unknown or duplicated finding "ghost"');
    expect(() =>
      applyModelPayload(request, {
        explanations: [
          { id: vuln.id, aiExplanation: 'a' },
          { id: vuln.id, aiExplanation: 'b' },
        ],
      }),
    ).toThrow(`duplicated finding "${vuln.id}"`);
  });

  it('does not mutate the request', () => {
    const before = JSON.stringify(request);
    applyModelPayload(request, { explanations: [{ id: vuln.id, aiExplanation: 'V' }] });
    expect(JSON.stringify(request)).toBe(before);
  });
});

describe('extractJsonText', () => {
  it('removes code fences and surrounding whitespace', () => {
    expect(extractJsonText('  ```json\n{"a":1}\n```  ')).toBe('{"a":1}');
    expect(extractJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseModelOutput', () => {
  it('parses a valid answer, fenced or not', () => {
    const text = JSON.stringify({ summary: 'S', explanations: [{ id: 'a', aiExplanation: 'x' }] });
    expect(parseModelOutput(text)).toEqual({
      summary: 'S',
      explanations: [{ id: 'a', aiExplanation: 'x' }],
    });
    expect(parseModelOutput(`\`\`\`json\n${text}\n\`\`\``)).toEqual(parseModelOutput(text));
  });

  it('throws SyntaxError for free text and ZodError for an invalid payload', () => {
    expect(() => parseModelOutput('upgrade everything')).toThrow(SyntaxError);
    for (const bad of [
      { explanations: [], extra: 1 },
      { explanations: [{ id: 'a', aiExplanation: '' }] },
      { explanations: [{ id: 'a', aiExplanation: 'x'.repeat(4001) }] },
      { summary: 'x'.repeat(4001), explanations: [] },
      { explanations: Array.from({ length: 501 }, () => ({ id: 'a', aiExplanation: 'x' })) },
      {},
    ]) {
      expect(() => parseModelOutput(JSON.stringify(bad))).toThrow(ZodError);
    }
  });
});

describe('redact', () => {
  it('replaces every occurrence of every known secret and ignores empty ones', () => {
    expect(redactSecrets('a SECRET b SECRET c TOKEN', ['SECRET', undefined, '', 'TOKEN'])).toBe(
      'a [REDACTED] b [REDACTED] c [REDACTED]',
    );
    expect(redactSecrets('nothing here', [undefined])).toBe('nothing here');
  });

  it('truncates to the limit with an ellipsis', () => {
    expect(truncateMessage('abc')).toBe('abc');
    expect(truncateMessage('x'.repeat(1000))).toHaveLength(1000);
    const long = truncateMessage('x'.repeat(1001));
    expect(long).toHaveLength(1000);
    expect(long.endsWith('…')).toBe(true);
    expect(truncateMessage('abcdef', 4)).toBe('abc…');
  });
});
