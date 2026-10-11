import type { ServiceRegistration } from '@gyde/contracts';
import { RegistryClient } from '@gyde/discovery';
import { Controller, Get, Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logger';
import { createService } from '../src/bootstrap';
import { startService } from '../src/start';

@Controller()
class SampleController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [SampleController] })
class SampleModule {}

describe('startService auto-registration', () => {
  it('registers in service registry on ready and deregisters on shutdown', async () => {
    const registrations: ServiceRegistration[] = [];
    const deregisteredIds: string[] = [];

    const fakeFetch: typeof fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';

      if (url.includes('/v1/instances') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as ServiceRegistration;
        registrations.push(body);
        return new Response(JSON.stringify(body), { status: 201 });
      }
      if (url.includes('/heartbeat') && method === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop()!;
        deregisteredIds.push(id);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://fake-registry:4100',
      internalToken: 'secret',
      fetch: fakeFetch,
    });

    const app = await createService(SampleModule, {
      name: 'reports',
      version: '1.0.0',
      logger: createLogger({ name: 'test', level: 'silent' }),
    });

    let onReadyCalled = false;

    await startService(app, {
      port: 0, // dynamic ephemeral port
      registration: {
        serviceName: 'reports',
        instanceId: 'reports-test-1',
        baseUrl: 'http://reports:4500',
        version: '1.0.0',
        heartbeatIntervalMs: 60_000,
        client,
      },
      onReady: async () => {
        onReadyCalled = true;
      },
    });

    expect(onReadyCalled).toBe(true);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toEqual({
      serviceName: 'reports',
      instanceId: 'reports-test-1',
      baseUrl: 'http://reports:4500',
      version: '1.0.0',
      metadata: {},
    });

    await app.close();
  });

  it('skips registration when registration is explicitly false', async () => {
    const app = await createService(SampleModule, {
      name: 'reports',
      logger: createLogger({ name: 'test', level: 'silent' }),
    });

    let onReadyCalled = false;

    await startService(app, {
      port: 0, // dynamic ephemeral port
      registration: false,
      onReady: async () => {
        onReadyCalled = true;
      },
    });

    expect(onReadyCalled).toBe(true);

    await app.close();
  });
});
