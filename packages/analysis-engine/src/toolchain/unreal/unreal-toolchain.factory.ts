import type { AnalysisGateway } from '../../types';
import type { AnalysisToolchainFactory, DependencyParser, VulnerabilityFetcher } from '../ports';

import { CppDependencyParser } from './cpp-dependency-parser';
import { NvdVulnerabilityFetcher } from './nvd-vulnerability-fetcher';

/** ConcreteFactory: the Unreal family = C++ parser + NVD vulnerability fetcher. */
export class UnrealToolchainFactory implements AnalysisToolchainFactory {
  private readonly projectRoot: string;
  private readonly gateway: AnalysisGateway;

  constructor(options: { projectRoot: string; gateway: AnalysisGateway }) {
    this.projectRoot = options.projectRoot;
    this.gateway = options.gateway;
  }

  createDependencyParser(): DependencyParser {
    return new CppDependencyParser(this.projectRoot);
  }

  createVulnerabilityFetcher(): VulnerabilityFetcher {
    return new NvdVulnerabilityFetcher(this.gateway);
  }
}
