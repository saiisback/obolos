import { z } from 'zod';

export const walletSnapshotSchema = z.object({
  id: z.enum(['hedera-payer', 'circle-agent']),
  name: z.string(), network: z.enum(['hedera:testnet', 'arc:testnet']),
  asset: z.enum(['HBAR', 'USDC']), decimals: z.number().int(),
  address: z.string().nullable(), payTo: z.string().nullable(),
  balanceAtomic: z.string().regex(/^\d+$/).nullable(),
  balanceStatus: z.enum(['unconfigured', 'available', 'unavailable']),
  balanceSource: z.enum(['hedera-mirror', 'arc-rpc']).nullable(),
  explorerUrl: z.string().url().nullable(), detail: z.string(),
}).strict();
export const brokerWalletsSchema = z.object({
  observedAt: z.string(), wallets: z.array(walletSnapshotSchema).max(2),
}).strict();
export type WalletSnapshot = z.infer<typeof walletSnapshotSchema>;
export type BrokerWallets = z.infer<typeof brokerWalletsSchema>;
export interface ReadinessCheck {
  id: string; label: string; status: 'ready' | 'missing' | 'action'; detail: string;
}
export interface LiveOverview {
  signerMode: 'usb' | 'speculos';
  checkedAt: string; operatorAuthenticated: boolean; liveEnabled: boolean;
  controllerAddress: string | null; serviceUrl: string | null;
  wallets: WalletSnapshot[]; checks: ReadinessCheck[];
  evidence: { liveRuns: number; hederaPayments: number; arcPayments: number; ledgerApprovals: number };
  resources: { id: string; label: string; url: string }[];
}
