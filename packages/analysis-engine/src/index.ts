export { GydeApiClient, type GydeApiClientOptions } from './client/gyde-api-client';
export { AnalysisPipeline, type AnalysisPipelineDeps } from './pipeline/analysis-pipeline';
export {
  GitHubActionPipeline,
  type GitHubActionPipelineOptions,
} from './pipeline/github-action.pipeline';
export { LocalCLIPipeline, type LocalCliPipelineOptions } from './pipeline/local-cli.pipeline';
export { buildAnalysisRequest } from './privacy/build-analysis-request';
export {
  createToolchainFactory,
  detectGameEngine,
  type ToolchainOptions,
} from './toolchain/create-toolchain';
export type {
  AnalysisToolchainFactory,
  DependencyParser,
  VulnerabilityFetcher,
  VulnerabilitySource,
} from './toolchain/ports';
export { CsharpDependencyParser } from './toolchain/unity/csharp-dependency-parser';
export { OsvVulnerabilityFetcher } from './toolchain/unity/osv-vulnerability-fetcher';
export { UnityToolchainFactory } from './toolchain/unity/unity-toolchain.factory';
export { CppDependencyParser } from './toolchain/unreal/cpp-dependency-parser';
export { NvdVulnerabilityFetcher } from './toolchain/unreal/nvd-vulnerability-fetcher';
export { UnrealToolchainFactory } from './toolchain/unreal/unreal-toolchain.factory';
export type { AnalysisGateway, AnalysisJob, ParsedProject } from './types';
