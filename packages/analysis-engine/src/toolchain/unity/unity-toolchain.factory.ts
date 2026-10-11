import type { WaitOptions } from '../../pipeline/wait-for-report';
import type { AnalysisGateway } from '../../types';
import type { AnalysisToolchainFactory, DependencyParser, VulnerabilityFetcher } from '../ports';

import { CsharpDependencyParser } from './csharp-dependency-parser';
import { OsvVulnerabilityFetcher } from './osv-vulnerability-fetcher';

/** ConcreteFactory: the Unity family = C# parser + OSV vulnerability fetcher. */
export class UnityToolchainFactory implements AnalysisToolchainFactory {
  private readonly projectRoot: string;
  private readonly gateway: AnalysisGateway;
  private readonly wait: WaitOptions | undefined;

  constructor(options: { projectRoot: string; gateway: AnalysisGateway; wait?: WaitOptions }) {
    this.projectRoot = options.projectRoot;
    this.gateway = options.gateway;
    this.wait = options.wait;
  }

  createDependencyParser(): DependencyParser {
    return new CsharpDependencyParser(this.projectRoot);
  }

  createVulnerabilityFetcher(): VulnerabilityFetcher {
    return new OsvVulnerabilityFetcher(this.gateway, this.wait);
  }
}
