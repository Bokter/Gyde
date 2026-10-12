import type { AnalysisGateway } from '../../types';
import type { AnalysisToolchainFactory, DependencyParser, VulnerabilityFetcher } from '../ports';

import { CsharpDependencyParser } from './csharp-dependency-parser';
import { OsvVulnerabilityFetcher } from './osv-vulnerability-fetcher';

/** ConcreteFactory: the Unity family = C# parser + OSV vulnerability fetcher. */
export class UnityToolchainFactory implements AnalysisToolchainFactory {
  private readonly projectRoot: string;
  private readonly gateway: AnalysisGateway;

  constructor(options: { projectRoot: string; gateway: AnalysisGateway }) {
    this.projectRoot = options.projectRoot;
    this.gateway = options.gateway;
  }

  createDependencyParser(): DependencyParser {
    return new CsharpDependencyParser(this.projectRoot);
  }

  createVulnerabilityFetcher(): VulnerabilityFetcher {
    return new OsvVulnerabilityFetcher(this.gateway);
  }
}
