import { neon } from '@neondatabase/serverless';
import { PlatformError } from './http';

export function databaseConfigured() { return Boolean(process.env.DATABASE_URL); }
export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new PlatformError(503, 'DATABASE_REQUIRED', 'Neon is not connected yet. Configure DATABASE_URL to enable accounts.');
  return neon(url, {fetchOptions: {cache: 'no-store'}});
}
