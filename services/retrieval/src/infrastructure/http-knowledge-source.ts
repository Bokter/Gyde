import { createHash } from 'node:crypto';

import { type KnowledgeQuery, KnowledgeQueryResult, ROUTES } from '@gyde/contracts';
import type { FallbackCache } from '@gyde/resilience';
import type { ResilientHttpClient } from '@gyde/service-kit';

import { KnowledgeUnavailableError } from '../application/errors';
import type { KnowledgeAnswer, KnowledgeSource } from '../application/ports/knowledge-source';
import { ServiceUnavailableError, toUnavailable } from './unavailable';

/**
 * Asks the normalization service for knowledge. When it cannot answer, the last answer for the
 * same question is served from the local cache (marked `partial`); with nothing cached the call
 * fails with `KnowledgeUnavailableError` and the use case carries on without knowledge.
 */
export class HttpKnowledgeSource implements KnowledgeSource {
  constructor(
    private readonly http: ResilientHttpClient,
    private readonly cache: FallbackCache<KnowledgeQueryResult>,
  ) {}

  async query(query: KnowledgeQuery): Promise<KnowledgeAnswer> {
    const key = createHash('sha256').update(JSON.stringify(query)).digest('hex');
    try {
      const json = await this.http
        .postJson('normalization', ROUTES.normalization.query, query)
        .catch((error: unknown) => {
          throw toUnavailable('normalization', error);
        });
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
