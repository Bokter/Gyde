import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('web database schema', () => {
  it('should have drizzle config', async () => {
    const fs = await import('fs/promises');
    const config = await fs.readFile(path.join(webRoot, 'drizzle.config.ts'), 'utf-8');
    expect(config).toContain("dialect: 'postgresql'");
    expect(config).toContain('./src/lib/db/schema.ts');
  });

  it('should have schema with all required tables', async () => {
    const fs = await import('fs/promises');
    const schema = await fs.readFile(path.join(webRoot, 'src/lib/db/schema.ts'), 'utf-8');

    // Core tables
    expect(schema).toContain('users');
    expect(schema).toContain('tenants');
    expect(schema).toContain('subscriptions');
    expect(schema).toContain('api_keys');
    expect(schema).toContain('llm_configs');
    expect(schema).toContain('stripe_events');

    // Auth.js tables
    expect(schema).toContain('accounts');
    expect(schema).toContain('sessions');
    expect(schema).toContain('verificationTokens');

    // Key columns
    expect(schema).toContain('githubId');
    expect(schema).toContain('keyHash');
    expect(schema).toContain('encryptedKey');
    expect(schema).toContain('kid');
    expect(schema).toContain('iv');
    expect(schema).toContain('authTag');
  });

  it('should have drizzle client', async () => {
    const fs = await import('fs/promises');
    const client = await fs.readFile(path.join(webRoot, 'src/lib/db/client.ts'), 'utf-8');
    expect(client).toContain('drizzle');
    expect(client).toContain('Pool');
    expect(client).toContain('WEB_DATABASE_URL');
  });
});
