import {
  AnalysisAccepted,
  buildPath,
  type CreateAnalysisJob,
  HEADERS,
  Report,
  ROUTES,
} from '@gyde/contracts';
import { HttpError, type ResilientHttpClient } from '@gyde/service-kit';

import type { ReportsClient } from '../application/ports/reports-client';
import type { RequestContext } from '../application/request-context';
import { toUpstreamUnavailable } from './upstream-errors';

type Context = RequestContext & { tenantId: string };

/** Calls Reports through discovery and the circuit breaker, forwarding request and tenant ids. */
export class HttpReportsClient implements ReportsClient {
  constructor(private readonly client: ResilientHttpClient) {}

  async createAnalysis(job: CreateAnalysisJob, context: Context): Promise<AnalysisAccepted> {
    try {
      const body = await this.client.postJson<unknown>(
        'reports',
        ROUTES.reports.createAnalysis,
        job,
        {
          ...forward(context),
        },
      );
      return AnalysisAccepted.parse(body);
    } catch (error) {
      throw toUpstreamUnavailable('reports', error);
    }
  }

  async getReport(analysisId: string, context: Context): Promise<Report> {
    try {
      const body = await this.client.getJson<unknown>(
        'reports',
        pathFor('getAnalysis', analysisId),
        {
          ...forward(context),
        },
      );
      return Report.parse(body);
    } catch (error) {
      throw mapReadError(error);
    }
  }

  async getMarkdown(analysisId: string, context: Context): Promise<string> {
    try {
      const res = await this.client.fetch('reports', pathFor('getMarkdown', analysisId), {
        method: 'GET',
        ...forward(context),
      });
      if (res.status === 404) throw analysisNotFound();
      if (!res.ok) throw new Error(`reports answered ${res.status}`);
      return await res.text();
    } catch (error) {
      throw mapReadError(error);
    }
  }
}

function forward(context: Context) {
  return {
    requestId: context.requestId,
    headers: { [HEADERS.tenantId]: context.tenantId },
  };
}

/** `buildPath` encodes the id, so a hostile one cannot reach another route of Reports. */
function pathFor(route: 'getAnalysis' | 'getMarkdown', analysisId: string): string {
  return buildPath(ROUTES.reports[route], { analysisId });
}

function analysisNotFound(): HttpError {
  return new HttpError('not_found', 'Analysis not found');
}

/** Reports' 404 is the client's 404; everything else is an unavailable upstream. */
function mapReadError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error.code === 'not_found'
      ? analysisNotFound()
      : toUpstreamUnavailable('reports', error);
  }
  return toUpstreamUnavailable('reports', error);
}
