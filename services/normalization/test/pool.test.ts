import { describe, expect, it, vi } from 'vitest';

import { createPool } from '../src/infrastructure/db/database';

describe('createPool', () => {
  it('survives a connection the server cut while idle (a restart of PostgreSQL)', async () => {
    const onError = vi.fn();
    const pool = createPool('postgres://user:secret@localhost:1/db', onError);
    const cut = Object.assign(new Error('terminating connection due to administrator command'), {
      code: '57P01',
    });

    // Without a listener, emitting "error" throws: that is what used to crash the process.
    expect(() => pool.emit('error', cut, undefined)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(cut);
    await pool.end();
  });

  it('survives it even when nobody asked to be told', async () => {
    const pool = createPool('postgres://user:secret@localhost:1/db');
    expect(() => pool.emit('error', new Error('connection lost'), undefined)).not.toThrow();
    await pool.end();
  });
});
