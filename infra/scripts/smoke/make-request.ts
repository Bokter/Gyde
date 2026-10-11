// Prints the body of POST /internal/retrieve for the shared sample project (the one the fixtures
// are written for). Run inside the dev image: it reads @gyde/contracts from the sources.
import { PLAN_CATALOG } from '../../../packages/contracts/src/index';
import { sampleAnalysisRequest } from '../../../packages/contracts/src/samples';

const analysisId = process.argv[2] ?? 'smoke-1';

console.log(
  JSON.stringify({
    analysisId,
    tenantId: 'tenant-smoke',
    entitlements: PLAN_CATALOG.pro,
    // No AI: the deterministic result is what the smoke test checks.
    request: { ...sampleAnalysisRequest, options: { includeAi: false } },
  }),
);
