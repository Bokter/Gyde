import { sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
  MODEL_CALL_POLICY,
  type ModelCallPolicy,
} from '../src/application/ports/model-call-policy';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { ResilientModelCallPolicy } from '../src/infrastructure/adapters/resilient-model-call-policy.adapter';
import { analysisPayload } from './support/fake-services';
import type { AiAnalysis } from '../src/domain/analysis';

const breakers = { failureThreshold: 2, failureRate: 2, minCalls: 5, openTimeoutMs: 60_000 };
const answer = (analysisId: string): AiAnalysis => ({ analysisId, findings: [] });
const ok = (id: string) => () => Promise.resolve(answer(id));
const boom = () => Promise.reject(new Error('provider down'));

describe('ResilientModelCallPolicy', () => {
  it('returns the value and remembers it for the same scope and findings', async () => {
    const policy = new ResilientModelCallPolicy({ breakerOptions: breakers });
    const request = analysisPayload();

    expect(await policy.run('t1:anthropic', request, ok('a-1'))).toEqual({
      status: 'ok',
      value: answer('a-1'),
    });
    expect(policy.isOpen('t1:anthropic')).toBe(false);
  });

  it('opens after the threshold, flags the failure that opened it and stops calling', async () => {
    const policy = new ResilientModelCallPolicy({ breakerOptions: breakers });
    const request = analysisPayload();
    let calls = 0;
    const failing = () => {
      calls += 1;
      return boom();
    };

    expect(await policy.run('t1:anthropic', request, failing)).toMatchObject({
      status: 'failed',
      circuitOpen: false,
    });
    expect(await policy.run('t1:anthropic', request, failing)).toMatchObject({
      status: 'failed',
      circuitOpen: true,
    });
    expect(policy.isOpen('t1:anthropic')).toBe(true);

    // The same breaker keeps answering: the call is not made again.
    expect(await policy.run('t1:anthropic', request, failing)).toEqual({
      status: 'circuit-open',
      cached: undefined,
    });
    expect(calls).toBe(2);
  });

  it('serves the last answer of the same scope and findings while the circuit is open', async () => {
    const policy = new ResilientModelCallPolicy({ breakerOptions: breakers });
    const request = analysisPayload();
    await policy.run('t1:anthropic', request, ok('a-1'));
    await policy.run('t1:anthropic', request, boom);
    await policy.run('t1:anthropic', request, boom);

    expect(await policy.run('t1:anthropic', request, ok('never'))).toEqual({
      status: 'circuit-open',
      cached: answer('a-1'),
    });
    // Other findings, or another scope, have nothing to serve.
    expect(
      await policy.run(
        't1:anthropic',
        analysisPayload({ findings: [sampleVulnerabilityFinding] }),
        ok('never'),
      ),
    ).toMatchObject({ status: 'circuit-open', cached: undefined });
    expect(await policy.run('t2:anthropic', request, ok('b-1'))).toMatchObject({ status: 'ok' });
  });

  it('keeps one breaker per scope', async () => {
    const policy = new ResilientModelCallPolicy({ breakerOptions: breakers });
    const request = analysisPayload();
    await policy.run('t1:gemini', request, boom);
    await policy.run('t1:gemini', request, boom);

    expect(policy.isOpen('t1:gemini')).toBe(true);
    expect(policy.isOpen('t1:anthropic')).toBe(false);
    expect(policy.isOpen('t2:gemini')).toBe(false);
  });

  it('expires the cached answer with the injected clock', async () => {
    const clock = { now: 0 };
    const policy = new ResilientModelCallPolicy({
      breakerOptions: breakers,
      now: () => clock.now,
    });
    const request = analysisPayload();
    await policy.run('s', request, ok('a-1'));
    await policy.run('s', request, boom);
    await policy.run('s', request, boom);

    clock.now = 300_001;
    expect(await policy.run('s', request, ok('never'))).toMatchObject({
      status: 'circuit-open',
      cached: undefined,
    });
  });
});

describe('the policy in the composition root', () => {
  const open: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).map((app) => app.close()));
  });

  it('is one instance for the life of the service, so an open circuit stays open', async () => {
    const app = await createApp({
      config: configSchema.parse({ INTERNAL_SERVICE_TOKEN: 'test-internal-token-123456' }),
      logger: createLogger({ name: 'llm-test', level: 'silent' }),
      module: { breakerOptions: breakers },
    });
    open.push(app);
    const first = app.get<ModelCallPolicy>(MODEL_CALL_POLICY);
    const second = app.get<ModelCallPolicy>(MODEL_CALL_POLICY);
    expect(first).toBe(second);

    const request = analysisPayload();
    await first.run('t1:anthropic', request, boom);
    await first.run('t1:anthropic', request, boom);
    expect(second.isOpen('t1:anthropic')).toBe(true);
    expect(await second.run('t1:anthropic', request, ok('never'))).toMatchObject({
      status: 'circuit-open',
    });
  });
});
