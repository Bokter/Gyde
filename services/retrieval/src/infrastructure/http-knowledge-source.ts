import { createHash } from 'node:crypto';

import { type KnowledgeQuery, KnowledgeQueryResult, ROUTES } from '@gyde/contracts';
import type { FallbackCache } from '@gyde/resilience';

import { KnowledgeUnavailableError } from '../application/errors';
import type { KnowledgeAnswer, KnowledgeSource } from '../application/ports/knowledge-source';
import { type InternalHttpClient, ServiceUnavailableError } from './internal-http-client';

/**
 * Asks the normalization service for knowledge. When it cannot answer, the last answer for the
 * same question is served from the local cache (marked `partial`); with nothing cached the call
 * fails with `KnowledgeUnavailableError` and the use case carries on without knowledge.
 */
export class HttpKnowledgeSource implements KnowledgeSource {
  constructor(
    private readonly client: InternalHttpClient,
    private readonly cache: FallbackCache<KnowledgeQueryResult>,
  ) {}

  async query(query: KnowledgeQuery): Promise<KnowledgeAnswer> {
    const key = createHash('sha256').update(JSON.stringify(query)).digest('hex');
    try {
      const json = await this.client.postJson('normalization', ROUTES.normalization.query, query);
      const answer = KnowledgeQueryResult.parse(json);
      await this.cache.set(key, answer);
      return { objects: answer.objects, partial: false };
    } catch (error) {
      if (!(error instanceof ServiceUnavailableError)) throw error;
      const stale = await this.cache.get(key);
      if (stale) return { objects: stale.value.objects, partial: true };
      throw new KnowledgeUnavailableError(error.message);
    }
  }
}
