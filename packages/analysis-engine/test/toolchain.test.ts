import { describe, expect, it } from 'vitest';

import {
  CppDependencyParser,
  CsharpDependencyParser,
  NvdVulnerabilityFetcher,
  OsvVulnerabilityFetcher,
  UnityToolchainFactory,
  UnrealToolchainFactory,
  createToolchainFactory,
  type AnalysisGateway,
} from '../src';

const gateway = {} as AnalysisGateway;

describe('createToolchainFactory (Abstract Factory)', () => {
  it('Unity builds the C# parser together with the OSV fetcher', () => {
    const factory = createToolchainFactory('unity', { projectRoot: '/game', gateway });

    expect(factory).toBeInstanceOf(UnityToolchainFactory);
    expect(factory.createDependencyParser()).toBeInstanceOf(CsharpDependencyParser);
    const fetcher = factory.createVulnerabilityFetcher();
    expect(fetcher).toBeInstanceOf(OsvVulnerabilityFetcher);
    expect(fetcher.source).toBe('osv');
  });

  it('Unreal builds the C++ parser together with the NVD fetcher', () => {
    const factory = createToolchainFactory('unreal', { projectRoot: '/game', gateway });

    expect(factory).toBeInstanceOf(UnrealToolchainFactory);
    expect(factory.createDependencyParser()).toBeInstanceOf(CppDependencyParser);
    const fetcher = factory.createVulnerabilityFetcher();
    expect(fetcher).toBeInstanceOf(NvdVulnerabilityFetcher);
    expect(fetcher.source).toBe('nvd');
  });
});
