import {keccak256, toHex, zeroAddress, type Hex} from 'viem';
import {economyClient, economyDeployment, policyAbi, type EconomyDeployment} from '@/lib/economy/chain';
import {requireOwnedAgent} from './agents';
import {sql} from './db';

type PolicyReading = {owner: string; executor: string; active: boolean; totalCapAtomic: string; spentAtomic: string; windowCapAtomic: string; windowSeconds: string; blockNumber: string; timestamp: number};
type Policy = ({status: 'registered'} & PolicyReading) | {status: 'not_registered' | 'unavailable' | 'owner_mismatch' | 'not_deployed'};
type SourceReceipt = {transactionHash: string; outputHash: string; outputMatches: boolean | null};
export type AgentEconomy = {
  agentId: string; policy: Policy; indexedAt: string | null;
  orders: {orderId: string; category: string; amountAtomic: string; providerState: string; createdAt: string; transactionHash: string; deliveryAttempts: number; outputHash: string | null; outputSummary: string | null; sellerAttestation: SourceReceipt | null; buyerAcknowledgment: SourceReceipt | null}[];
};

async function readFinalizedPolicy(agentId: Hex, deployment: EconomyDeployment): Promise<PolicyReading> {
  const client = economyClient();
  if (await client.getChainId() !== deployment.chainId) throw Error('Wrong economy chain');
  const block = await client.getBlock({blockTag: 'finalized'});
  const value = await client.readContract({address: deployment.policy, abi: policyAbi, functionName: 'agents', args: [agentId], blockNumber: block.number});
  return {owner: value[0].toLowerCase(), executor: value[1].toLowerCase(), active: value[2], totalCapAtomic: value[3].toString(), spentAtomic: value[4].toString(), windowCapAtomic: value[5].toString(), windowSeconds: value[6].toString(), blockNumber: block.number.toString(), timestamp: Number(block.timestamp)};
}

async function policyWithinDeadline(read: Promise<PolicyReading>): Promise<PolicyReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_resolve, reject) => {timer = setTimeout(() => reject(Error('Policy read timed out')), 7000);})]);
  } finally {clearTimeout(timer);}
}

// Summarize numerical results only; arbitrary provider text and input never enter the list response.
function outputSummary(category: string, output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const keys: Record<string, string[]> = {compute: ['characters', 'words', 'bytes'], data: ['stars', 'forks', 'openIssues'], verification: ['passed'], storage: ['bytes'], inference: ['promptTokens', 'completionTokens']};
  const result = keys[category]?.flatMap(key => {
    const value = (output as Record<string, unknown>)[key];
    return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? [`${key}: ${value}`] : [];
  });
  return result?.length ? result.join(' · ') : 'Output received';
}

export async function getAgentEconomy(user: {id: string; address: string}, platformAgentId: string, overrides: {readPolicy?: typeof readFinalizedPolicy; deployment?: EconomyDeployment | null} = {}): Promise<AgentEconomy> {
  // Ownership is checked before any economy/order or external RPC read.
  await requireOwnedAgent(user.id, platformAgentId);
  const agentId = keccak256(toHex(platformAgentId)), deployment = overrides.deployment === undefined ? economyDeployment() : overrides.deployment;
  if (!deployment) return {agentId, policy: {status: 'not_deployed'}, indexedAt: null, orders: []};
  const db = sql();
  const policyPromise: Promise<Policy> = policyWithinDeadline((overrides.readPolicy ?? readFinalizedPolicy)(agentId, deployment)).then((value): Policy => {
    if (value.owner.toLowerCase() === zeroAddress) return {status: 'not_registered'};
    if (value.owner.toLowerCase() !== user.address.toLowerCase()) return {status: 'owner_mismatch'};
    return {status: 'registered', ...value};
  }).catch(() => ({status: 'unavailable'}));
  const [rows, index, policy] = await Promise.all([
    db`SELECT o.order_id,o.state,o.created_at,o.transaction_hash,o.delivery_attempts,o.output_hash,o.output,
      o.request->>'category' AS category,o.request->>'amountAtomic' AS amount_atomic,
      delivery.transaction_hash AS attestation_hash,delivery.payload->>'outputHash' AS attested_output_hash,
      acknowledgment.transaction_hash AS acknowledgment_hash,acknowledgment.payload->>'outputHash' AS acknowledged_output_hash
      FROM economy_orders o
      LEFT JOIN LATERAL (SELECT transaction_hash,payload FROM economy_chain_events
        WHERE chain_id=${deployment.chainId} AND contract_address=${deployment.ledger}
          AND event_name='DeliveryAttested' AND payload->>'orderId'=o.order_id
          AND lower(payload->>'seller')=lower(o.definition->>'seller')
          AND block_number <= (SELECT block_number FROM economy_index_state WHERE settlement_address=${deployment.settlement})
        ORDER BY block_number DESC,log_index DESC LIMIT 1) delivery ON true
      LEFT JOIN LATERAL (SELECT transaction_hash,payload FROM economy_chain_events
        WHERE chain_id=${deployment.chainId} AND contract_address=${deployment.ledger}
          AND event_name='BuyerAcknowledged' AND payload->>'orderId'=o.order_id
          AND lower(payload->>'payer')=lower(o.request->>'payer')
          AND block_number <= (SELECT block_number FROM economy_index_state WHERE settlement_address=${deployment.settlement})
        ORDER BY block_number DESC,log_index DESC LIMIT 1) acknowledgment ON true
      WHERE o.user_id=${user.id} AND o.platform_agent_id=${platformAgentId}
        AND o.request->>'agentId'=${agentId}
        AND o.request->'settlement'->>'chainId'=${String(deployment.chainId)}
        AND lower(o.request->'settlement'->>'address')=${deployment.settlement}
        AND lower(o.request->'settlement'->>'ledgerAddress')=${deployment.ledger}
      ORDER BY o.created_at DESC,o.order_id DESC LIMIT 100`,
    db`SELECT updated_at FROM economy_index_state WHERE settlement_address=${deployment.settlement}`,
    policyPromise,
  ]);
  return {agentId, policy, indexedAt: index[0]?.updated_at ? new Date(String(index[0].updated_at)).toISOString() : null, orders: rows.map(row => ({
    orderId: String(row.order_id), category: String(row.category), amountAtomic: String(row.amount_atomic), providerState: String(row.state), createdAt: new Date(String(row.created_at)).toISOString(), transactionHash: String(row.transaction_hash), deliveryAttempts: Number(row.delivery_attempts), outputHash: row.output_hash ? String(row.output_hash) : null, outputSummary: outputSummary(String(row.category), row.output),
    sellerAttestation: row.attestation_hash ? {transactionHash: String(row.attestation_hash), outputHash: String(row.attested_output_hash), outputMatches: row.output_hash ? row.output_hash === row.attested_output_hash : null} : null,
    buyerAcknowledgment: row.acknowledgment_hash ? {transactionHash: String(row.acknowledgment_hash), outputHash: String(row.acknowledged_output_hash), outputMatches: row.output_hash ? row.output_hash === row.acknowledged_output_hash : null} : null,
  }))};
}
