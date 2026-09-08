import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from '@/lib/platform/db';
import { PlatformError } from '@/lib/platform/http';
import { assertUuid, requireOwnedAgent } from '@/lib/platform/agents';

export function parseKeyName(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'name')) {
    throw new PlatformError(400, 'INVALID_KEY', 'Provide a key name.');
  }
  const name = (body as { name?: unknown }).name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    throw new PlatformError(400, 'INVALID_KEY', 'Key name must contain 1–80 characters.');
  }
  return name.trim();
}

export function createCredential() {
  const token = `ob_test_${randomBytes(32).toString('base64url')}`;
  return { token, hash: createHash('sha256').update(token).digest('hex'), prefix: token.slice(0, 15) };
}

export function bearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer (ob_test_[A-Za-z0-9_-]{43})$/i);
  if (!match) throw new PlatformError(401, 'INVALID_API_KEY', 'A valid Bearer API key is required.');
  return match[1];
}

type CredentialRow = { agent_id: string; expires_at: string | Date; revoked_at: string | Date | null };

export function assertCredentialScope(row: CredentialRow | undefined, agentId: string, now = new Date()): asserts row is CredentialRow {
  const expiry = row ? new Date(row.expires_at).getTime() : NaN;
  if (!row || row.revoked_at !== null || !Number.isFinite(expiry) || expiry <= now.getTime()) {
    throw new PlatformError(401, 'INVALID_API_KEY', 'The API key is invalid, expired or revoked.');
  }
  if (row.agent_id !== agentId) throw new PlatformError(403, 'KEY_SCOPE_MISMATCH', 'This API key is scoped to a different agent.');
}

export async function authenticateAgentKey(authorization: string | null, agentId: string) {
  const token = bearerToken(authorization);
  const hash = createHash('sha256').update(token).digest('hex');
  const rows = await sql()`SELECT agent_id, expires_at, revoked_at, clock_timestamp() AS checked_at
    FROM platform_api_keys WHERE token_hash = ${hash}`;
  const row = rows[0] as (CredentialRow & { checked_at: string | Date }) | undefined;
  // Use the database clock so expiry and key quotas share one source of time.
  assertCredentialScope(row, agentId, row ? new Date(row.checked_at) : new Date());
  return { agentId: row.agent_id };
}

export async function listAgentKeys(userId: string, agentId: string) {
  await requireOwnedAgent(userId, agentId);
  return sql()`SELECT k.id, k.name, k.prefix, k.created_at AS "createdAt", k.expires_at AS "expiresAt", k.revoked_at AS "revokedAt"
    FROM platform_api_keys k JOIN platform_agents a ON a.id = k.agent_id
    WHERE k.agent_id = ${agentId} AND a.user_id = ${userId} ORDER BY k.created_at DESC, k.id DESC`;
}

export async function issueAgentKey(userId: string, agentId: string, body: unknown) {
  const name = parseKeyName(body);
  await requireOwnedAgent(userId, agentId);
  const credential = createCredential();
  const db = sql();
  const results = await db.transaction([
    db`SELECT id FROM platform_agents WHERE id = ${agentId} AND user_id = ${userId} FOR UPDATE`,
    db`INSERT INTO platform_api_keys (id, agent_id, name, prefix, token_hash, expires_at)
      SELECT ${randomUUID()}, id, ${name}, ${credential.prefix}, ${credential.hash}, now() + interval '30 days'
      FROM platform_agents WHERE id = ${agentId} AND user_id = ${userId}
        AND (SELECT count(*) FROM platform_api_keys WHERE agent_id = ${agentId} AND revoked_at IS NULL AND expires_at > now()) < 10
      RETURNING id, name, prefix, created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
  ], { isolationLevel: 'ReadCommitted' });
  if (!results[0][0]) throw new PlatformError(404, 'AGENT_NOT_FOUND', 'Agent not found.');
  if (!results[1][0]) throw new PlatformError(409, 'KEY_LIMIT', 'Each agent can have up to 10 active API keys. Revoke an existing key first.');
  return { key: results[1][0], token: credential.token };
}

export async function revokeAgentKey(userId: string, agentId: string, keyId: string) {
  await requireOwnedAgent(userId, agentId);
  assertUuid(keyId);
  const rows = await sql()`UPDATE platform_api_keys k SET revoked_at = COALESCE(k.revoked_at, now())
    FROM platform_agents a WHERE k.id = ${keyId} AND k.agent_id = ${agentId} AND a.id = k.agent_id AND a.user_id = ${userId}
    RETURNING k.id`;
  if (!rows[0]) throw new PlatformError(404, 'KEY_NOT_FOUND', 'API key not found.');
}
