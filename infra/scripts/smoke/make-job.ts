// Prints the body of POST /internal/analyses (CreateAnalysisJob) for the shared sample project, the
// one the fixtures are written for. Run inside the dev image: it reads @gyde/contracts from the
// sources.
//
//   tsx make-job.ts <free|pro|studio> <ai|noai>
import { PLAN_CATALOG } from '../../../packages/contracts/src/index';
import { sampleAnalysisRequest } from '../../../packages/contracts/src/samples';

const plan = (process.argv[2] ?? 'free') as keyof typeof PLAN_CATALOG;
const includeAi = process.argv[3] === 'ai';

console.log(
  JSON.stringify({
    tenantId: 'tenant-smoke',
    entitlements: PLAN_CATALOG[plan],
    request: { ...sampleAnalysisRequest, options: { includeAi } },
  }),
);
