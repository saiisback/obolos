import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Add the Neon connection string to .env.local.');
  const client = new pg.Client({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:15000});
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(732980124)");
    await client.query('CREATE TABLE IF NOT EXISTS platform_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(resolve('db/migrations'))).filter(n=>/^\d+_[a-z_]+\.sql$/.test(n)).sort()) {
      const source = await readFile(resolve('db/migrations',name),'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const existing = await client.query('SELECT checksum FROM platform_migrations WHERE name=$1',[name]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);
        continue;
      }
      await client.query(source);
      await client.query('INSERT INTO platform_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
    console.log('Database migrations complete.');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Migration failed and was rolled back. Check database access and migration files. Credentials were not logged.');
  } finally { await client.end(); }
}
migrate().catch(()=>{console.error('Database migration could not complete. Check DATABASE_URL and PostgreSQL access; no credentials were logged.');process.exitCode=1;});
