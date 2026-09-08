import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/platform/db';
import { PlatformError } from '@/lib/platform/http';

const agentInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(''),
  dataBudgetAtomic: z.number().int().min(0).max(100_000_000),
  verificationBudgetAtomic: z.number().int().min(0).max(1_000_000),
});

export function parseAgentInput(value: unknown) {
  const parsed = agentInput.safeParse(value);
  if (!parsed.success) throw new PlatformError(400, 'INVALID_AGENT', 'Provide a name (1–80 characters), description (up to 1000 characters), and integer budgets from 0 to 100000000 tinybars and 0 to 1000000 USDC atomic units.');
  return parsed.data;
}

export function assertUuid(value: string) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)) {
    throw new PlatformError(404, 'NOT_FOUND', 'Resource not found.');
  }
}

export function assertAgentOwner(agent: { user_id: string } | undefined, userId: string): asserts agent is { user_id: string } {
  if (!agent || agent.user_id !== userId) throw new PlatformError(404, 'AGENT_NOT_FOUND', 'Agent not found.');
}

export async function requireOwnedAgent(userId: string, agentId: string) {
  assertUuid(agentId);
  const rows = await sql()`SELECT user_id FROM platform_agents WHERE id = ${agentId}`;
  assertAgentOwner(rows[0] as { user_id: string } | undefined, userId);
}

export async function listAgents(userId: string) {
  return sql()`SELECT id, name, description, status,
    data_budget_atomic AS "dataBudgetAtomic", verification_budget_atomic AS "verificationBudgetAtomic",
    created_at AS "createdAt" FROM platform_agents WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC`;
}

export async function createAgent(userId: string, body: unknown) {
  const input = parseAgentInput(body);
  const db = sql();
  // Separate statements at READ COMMITTED are essential: the insert sees a fresh
  // snapshot after waiting for the parent lock, including concurrent creations.
  const results = await db.transaction([
    db`SELECT id FROM platform_users WHERE id = ${userId} FOR UPDATE`,
    db`INSERT INTO platform_agents (id, user_id, name, description, data_budget_atomic, verification_budget_atomic)
      SELECT ${randomUUID()}, ${userId}, ${input.name}, ${input.description}, ${input.dataBudgetAtomic}, ${input.verificationBudgetAtomic}
      WHERE (SELECT count(*) FROM platform_agents WHERE user_id = ${userId}) < 25
      RETURNING id, name, description, status, data_budget_atomic AS "dataBudgetAtomic",
        verification_budget_atomic AS "verificationBudgetAtomic", created_at AS "createdAt"`,
  ], { isolationLevel: 'ReadCommitted' });
  if (!results[1][0]) throw new PlatformError(409, 'AGENT_LIMIT', 'You can create up to 25 agents.');
  return results[1][0];
}

const runInput = z.strictObject({
  repos: z.array(z.string().max(140).regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/)).min(1).max(3),
});

export function validateRunInput(body: unknown, idempotencyKey: string | null) {
  const parsed = runInput.safeParse(body);
  if (!parsed.success || new Set(parsed.data.repos.map((repo) => repo.toLowerCase())).size !== parsed.data.repos.length) {
    throw new PlatformError(400, 'INVALID_RUN', 'Provide 1–3 unique GitHub repositories in owner/repo format.');
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
    throw new PlatformError(400, 'INVALID_IDEMPOTENCY_KEY', 'Provide an Idempotency-Key of 1–128 letters, digits, periods, underscores, colons or hyphens.');
  }
  return { ...parsed.data, idempotencyKey };
}

export function runnerRequired(): never {
  throw new PlatformError(409, 'RUNNER_REQUIRED', 'Payment execution requires an isolated runner and verified payment authorization. Agent execution is not configured.');
}

export async function listAgentRuns(agentId: string) {
  return sql()`SELECT id, agent_id AS "agentId", status, repos, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM platform_jobs WHERE agent_id = ${agentId} ORDER BY created_at DESC, id DESC LIMIT 100`;
}

export async function getAgentRun(agentId: string, runId: string) {
  assertUuid(runId);
  const rows = await sql()`SELECT id, agent_id AS "agentId", status, repos, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM platform_jobs WHERE agent_id = ${agentId} AND id = ${runId}`;
  if (!rows[0]) throw new PlatformError(404, 'RUN_NOT_FOUND', 'Run not found.');
  return rows[0];
}
