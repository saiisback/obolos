import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

// Exercise the real migration constraints in an isolated schema. This suite
// uses only TEST_DATABASE_URL; it never dispatches a payment or chain request.
describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL Hedera settlement replay protection', () => {
  const schema = `hedera_test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool | undefined;
  let pool: pg.Pool | undefined;
  let created = false;
  const nativeId = (second: number) => `0.0.456@178919${second.toString().padStart(4, '0')}.000000001`;

  beforeAll(async () => {
    admin = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL});
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool = new pg.Pool({connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 8});
    for (const name of (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort()) {
      await pool.query(await readFile(`db/migrations/${name}`, 'utf8'));
    }
  });
  beforeEach(async () => {
    await pool!.query('DELETE FROM platform_service_payments');
    await pool!.query('DELETE FROM platform_scheduled_deliveries');
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
      finally { await admin.end(); }
    }
  });

  const claim = (id: string, asset: string, offer: string | null = null, request: string | null = null) => pool!.query(
    'INSERT INTO platform_service_payments(transaction_id,provider_id,repos,amount_atomic,asset,offer_id,offer_request_key) VALUES($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING transaction_id',
    [id, 'repo-standard', '["vercel/next.js"]', 1, asset, offer, request],
  );

  it('reserves one HTS transaction under concurrent replay', async () => {
    const claims = await Promise.all(Array.from({length: 12}, () => claim(nativeId(0), '0.0.900')));
    expect(claims.reduce((total, result) => total + (result.rowCount ?? 0), 0)).toBe(1);
    expect((await pool!.query('SELECT state FROM platform_service_payments')).rows).toEqual([{state: 'pending'}]);
  });
  it('cannot reuse a native transaction for another asset', async () => {
    expect((await claim(nativeId(0), '0.0.900')).rowCount).toBe(1);
    expect((await claim(nativeId(0), '0.0.0')).rowCount).toBe(0);
    expect((await claim(nativeId(0), '0.0.999')).rowCount).toBe(0);
  });
  it('allows independent HTS purchases with nullable A2A offer keys', async () => {
    const claims = await Promise.all([claim(nativeId(0), '0.0.900'), claim(nativeId(1), '0.0.900')]);
    expect(claims.map(result => result.rowCount)).toEqual([1, 1]);
  });
  it('allows only one native settlement for the same accepted A2A offer', async () => {
    const claims = await Promise.all(Array.from({length: 12}, (_, index) => claim(nativeId(index), '0.0.0', 'offer-1', `0.0.777:req-${index}`)));
    expect(claims.reduce((total, result) => total + (result.rowCount ?? 0), 0)).toBe(1);
  });
  it('binds the original payer request to one offer while allowing another payer', async () => {
    expect((await claim(nativeId(0), '0.0.0', 'offer-1', '0.0.777:req-1')).rowCount).toBe(1);
    expect((await claim(nativeId(1), '0.0.0', 'offer-2', '0.0.777:req-1')).rowCount).toBe(0);
    expect((await claim(nativeId(2), '0.0.0', 'offer-3', '0.0.778:req-1')).rowCount).toBe(1);
  });
  it('does not return a stored receipt for a different token asset', async () => {
    await claim(nativeId(0), '0.0.900');
    const receipts = await pool!.query('SELECT transaction_id FROM platform_service_payments WHERE transaction_id=$1 AND asset=$2', [nativeId(0), '0.0.999']);
    expect(receipts.rows).toEqual([]);
  });
  it('consumes the pending settlement state only once', async () => {
    await claim(nativeId(0), '0.0.900');
    const settle = () => pool!.query('UPDATE platform_service_payments SET state=$1,settlement=$2::jsonb,evidence=$3::jsonb,settled_at=now() WHERE transaction_id=$4 AND state=$5 RETURNING state', ['settled', '{"success":true}', '[]', nativeId(0), 'pending']);
    const results = await Promise.all([settle(), settle()]);
    expect(results.reduce((total, result) => total + (result.rowCount ?? 0), 0)).toBe(1);
  });
  it('persists one delivery for a schedule even when the competing request differs', async () => {
    const deliver = (fingerprint: string) => pool!.query('INSERT INTO platform_scheduled_deliveries(schedule_id,fingerprint,state,evidence,proof) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT(schedule_id) DO NOTHING RETURNING schedule_id', ['0.0.800', fingerprint, 'delivered', '[]', '{"round":0}']);
    const results = await Promise.all([deliver('plan-round-0'), deliver('different-request')]);
    expect(results.reduce((total, result) => total + (result.rowCount ?? 0), 0)).toBe(1);
    expect((await pool!.query('SELECT count(*)::int AS count FROM platform_scheduled_deliveries')).rows[0].count).toBe(1);
  });
  it('rejects an unrecognized scheduled delivery state in PostgreSQL', async () => {
    await expect(pool!.query("INSERT INTO platform_scheduled_deliveries(schedule_id,fingerprint,state,proof) VALUES('0.0.801','bad','unknown','{}')")).rejects.toMatchObject({code: '23514'});
  });
});
