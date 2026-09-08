export type User = { id: string; address: string };
export type Agent = { id: string; name: string; description: string; status: string; dataBudgetAtomic: number; verificationBudgetAtomic: number; createdAt: string };
export type ApiKeySummary = { id: string; name: string; prefix: string; createdAt: string; expiresAt: string; revokedAt: string | null };

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error || 'The request could not be completed. Please try again.', response.status, body?.code);
  return body as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

// Decimal string arithmetic keeps tinybar and micro-USDC amounts exact.
export function toAtomic(value: string, decimals: number): number {
  if (!new RegExp(`^(?:0|1)(?:\\.\\d{1,${decimals}})?$`).test(value)) throw new Error(`Enter an amount from 0 to 1 with at most ${decimals} decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (amount > 10n ** BigInt(decimals)) throw new Error('Each budget must be at most 1 token per run.');
  return Number(amount);
}

export function fromAtomic(value: number, decimals: number): string {
  const padded = String(value).padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}
