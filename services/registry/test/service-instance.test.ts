import { describe, expect, it } from 'vitest';

import { InstanceNotFoundError, RegistryError } from '../src/application/errors';
import { ServiceInstance } from '../src/domain/entities/service-instance.entity';

const t0 = new Date('2026-01-01T00:00:00.000Z');
const registration = {
  instanceId: 'reports-1',
  serviceName: 'reports',
  baseUrl: 'http://reports:4500',
  version: '1.0.0',
  metadata: { zone: 'a' },
} as const;

describe('ServiceInstance', () => {
  it('is created healthy with both timestamps at the given time', () => {
    const instance = ServiceInstance.create(registration, t0);
    expect(instance.healthy).toBe(true);
    expect(instance.failedProbes).toBe(0);
    expect(instance.registeredAt).toBe(t0.toISOString());
    expect(instance.lastHeartbeatAt).toBe(t0.toISOString());
  });

  it('exposes a snapshot without the metadata', () => {
    expect(ServiceInstance.create(registration, t0).snapshot()).toEqual({
      instanceId: 'reports-1',
      serviceName: 'reports',
      baseUrl: 'http://reports:4500',
      version: '1.0.0',
      healthy: true,
      registeredAt: t0.toISOString(),
      lastHeartbeatAt: t0.toISOString(),
    });
  });

  it('a heartbeat refreshes the timestamp, restores health and clears failed probes', () => {
    const instance = ServiceInstance.create(registration, t0);
    instance.recordProbeFailure();
    const later = new Date(t0.getTime() + 5_000);
    instance.touchHeartbeat(later);
    expect(instance.lastHeartbeatAt).toBe(later.toISOString());
    expect(instance.registeredAt).toBe(t0.toISOString());
    expect(instance.healthy).toBe(true);
    expect(instance.failedProbes).toBe(0);
  });

  it('each failed probe makes it unhealthy and counts; a successful probe resets both', () => {
    const instance = ServiceInstance.create(registration, t0);
    instance.recordProbeFailure();
    instance.recordProbeFailure();
    expect(instance.healthy).toBe(false);
    expect(instance.failedProbes).toBe(2);
    instance.recordProbeSuccess();
    expect(instance.healthy).toBe(true);
    expect(instance.failedProbes).toBe(0);
  });

  it('expires once the last heartbeat is at least ttl old (boundary included)', () => {
    const instance = ServiceInstance.create(registration, t0);
    const ttl = 15_000;
    expect(instance.isExpired(ttl, t0.getTime() + ttl - 1)).toBe(false);
    expect(instance.isExpired(ttl, t0.getTime() + ttl)).toBe(true);
  });

  it('is rebuilt from its stored state without touching the clock', () => {
    const instance = ServiceInstance.rehydrate({
      ...registration,
      healthy: false,
      registeredAt: t0.toISOString(),
      lastHeartbeatAt: t0.toISOString(),
      failedProbes: 2,
    });
    expect(instance.healthy).toBe(false);
    expect(instance.failedProbes).toBe(2);
  });
});

describe('InstanceNotFoundError', () => {
  it('is an application error with a stable code and the message served over http', () => {
    const error = new InstanceNotFoundError('nope');
    expect(error).toBeInstanceOf(RegistryError);
    expect(error.code).toBe('instance_not_found');
    expect(error.message).toBe('Instance "nope" is not registered');
  });
});
