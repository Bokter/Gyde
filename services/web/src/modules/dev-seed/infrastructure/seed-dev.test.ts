import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DevSeedStore, DevSeedTenant, NewDevSeed } from '../application/ports/dev-seed-store';
import { runSeedDev } from './seed-dev';

class InMemoryDevSeedStore implements DevSeedStore {
  readonly seeds: Array<NewDevSeed & { tenantId: string }> = [];

  async findTenantBySlug(slug: string): Promise<DevSeedTenant | null> {
    const seed = this.seeds.find((s) => s.tenant.slug === slug);
    return seed ? { id: seed.tenantId, slug, plan: seed.tenant.plan } : null;
  }

  async createTenantWithApiKey(seed: NewDevSeed) {
    const tenantId = crypto.randomUUID();
    this.seeds.push({ ...seed, tenantId });
    return { tenantId, apiKeyId: crypto.randomUUID() };
  }
}

function run(store: InMemoryDevSeedStore, nodeEnv: 'development' | 'production') {
  const out = { stdout: '', stderr: '', opened: 0 };
  const done = runSeedDev({
    env: { NODE_ENV: nodeEnv, WEB_DATABASE_URL: 'postgres://web@localhost/gyde' },
    stdout: (text) => (out.stdout += text),
    stderr: (text) => (out.stderr += text),
    openStore: () => {
      out.opened += 1;
      return { store, close: async () => {} };
    },
  });
  return done.then((code) => ({ code, ...out }));
}

describe('seed:dev', () => {
  it('creates a free tenant with a test key, prints the key once and stores only its hash', async () => {
    const store = new InMemoryDevSeedStore();

    const { code, stdout, stderr } = await run(store, 'development');

    expect(code).toBe(0);
    const plainKey = stdout.trim();
    expect(plainKey).toMatch(/^gyde_test_[0-9a-f]{64}$/);
    expect(stderr).not.toContain(plainKey);
    expect(store.seeds).toHaveLength(1);
    const [seed] = store.seeds;
    expect(seed!.tenant.plan).toBe('free');
    expect(seed!.apiKey.environment).toBe('test');
    expect(seed!.apiKey.keyHash).toBe(createHash('sha256').update(plainKey).digest('hex'));
    expect(JSON.stringify(seed)).not.toContain(plainKey);
  });

  it('is idempotent: a second run creates nothing and says the key cannot be printed again', async () => {
    const store = new InMemoryDevSeedStore();
    await run(store, 'development');

    const second = await run(store, 'development');

    expect(second.code).toBe(0);
    expect(store.seeds).toHaveLength(1);
    expect(second.stdout).toBe('');
    expect(second.stderr).not.toContain('gyde_test_');
    expect(second.stderr).toContain('already exists');
    expect(second.stderr).toContain('cannot be printed again');
  });

  it('refuses to run with NODE_ENV=production without opening the database', async () => {
    const store = new InMemoryDevSeedStore();

    const { code, stdout, stderr, opened } = await run(store, 'production');

    expect(code).toBe(1);
    expect(opened).toBe(0);
    expect(store.seeds).toHaveLength(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('Refused');
  });
});
