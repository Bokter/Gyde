import type { InstanceInfo, ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, type ServiceResolver } from '@gyde/discovery';
import { describe, expect, it } from 'vitest';

import { ServiceLocator } from '../src/infrastructure/service-locator';

const instance = (baseUrl: string): InstanceInfo => ({
  instanceId: 'i-1',
  serviceName: 'reports',
  baseUrl,
  version: '1.0.0',
  healthy: true,
  registeredAt: '2026-10-01T12:00:00Z',
  lastHeartbeatAt: '2026-10-01T12:00:00Z',
});

const resolverReturning = (baseUrl: string): ServiceResolver => ({
  resolve: async () => [instance(baseUrl)],
  pick: async () => instance(baseUrl),
});

const failingResolver = (service: ServiceName): ServiceResolver => ({
  resolve: async () => [],
  pick: async () => {
    throw new NoHealthyInstanceError(service);
  },
});

describe('ServiceLocator', () => {
  const staticUrls = { reports: 'http://static-reports:4500' };

  it('prefers a healthy instance from discovery over the static URL', async () => {
    const locator = new ServiceLocator({
      resolver: resolverReturning('http://discovered:4500'),
      staticUrls,
    });
    expect(await locator.baseUrl('reports')).toBe('http://discovered:4500');
  });

  it('falls back to the static URL when discovery has no healthy instance', async () => {
    const locator = new ServiceLocator({ resolver: failingResolver('reports'), staticUrls });
    expect(await locator.baseUrl('reports')).toBe('http://static-reports:4500');
  });

  it('falls back to the static URL when the registry itself cannot be reached', async () => {
    const down: ServiceResolver = {
      resolve: async () => Promise.reject(new TypeError('fetch failed')),
      pick: async () => Promise.reject(new TypeError('fetch failed')),
    };
    const locator = new ServiceLocator({ resolver: down, staticUrls });
    expect(await locator.baseUrl('reports')).toBe('http://static-reports:4500');
  });

  it('uses the static URL when there is no registry client yet (local development)', async () => {
    expect(await new ServiceLocator({ staticUrls }).baseUrl('reports')).toBe(
      'http://static-reports:4500',
    );
  });

  it('throws NoHealthyInstanceError when neither discovery nor a static URL can answer', async () => {
    const locator = new ServiceLocator({ resolver: failingResolver('llm-analysis'), staticUrls });
    await expect(locator.baseUrl('llm-analysis')).rejects.toBeInstanceOf(NoHealthyInstanceError);
  });
});
