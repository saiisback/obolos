import {economyDeployment} from '@/lib/economy/chain';
import {sql} from './db';

type SourceReceipt = {transactionHash: string; outputHash: string};
export type EconomyPurchases = {
  indexedAt: string | null;
  orders: {orderId: string; platformAgentId: string; agentName: string; serviceHash: string; seller: string; category: string; quantity: string; unit: string; amountAtomic: string; state: string; transactionHash: string; outputHash: string | null; createdAt: string; sellerAttestation: SourceReceipt | null; buyerAcknowledgment: SourceReceipt | null}[];
};

/** Owner-only list. No request inputs, provider output bodies, credentials or delivery leases. */
export async function listOwnedEconomyPurchases(userId: string): Promise<EconomyPurchases> {
  const deployment = economyDeployment();
  if (!deployment) return {orders: [], indexedAt: null};
  const db = sql();
  const [rows, index] = await Promise.all([
    db`SELECT o.order_id,o.platform_agent_id,a.name AS agent_name,o.service_hash,o.state,o.transaction_hash,o.output_hash,o.created_at,
      o.definition->>'seller' AS seller,o.request->>'category' AS category,o.request->>'quantity' AS quantity,
      o.request->>'unit' AS unit,o.request->>'amountAtomic' AS amount_atomic,
      delivery.transaction_hash AS attestation_hash,delivery.payload->>'outputHash' AS attested_output_hash,
      acknowledgment.transaction_hash AS acknowledgment_hash,acknowledgment.payload->>'outputHash' AS acknowledged_output_hash
      FROM economy_orders o JOIN platform_agents a ON a.id=o.platform_agent_id AND a.user_id=o.user_id
      LEFT JOIN LATERAL (SELECT transaction_hash,payload FROM economy_chain_events
        WHERE chain_id=${deployment.chainId} AND contract_address=${deployment.ledger}
          AND event_name='DeliveryAttested' AND payload->>'orderId'=o.order_id
          AND lower(payload->>'seller')=lower(o.definition->>'seller')
          AND (o.output_hash IS NULL OR payload->>'outputHash'=o.output_hash)
        ORDER BY block_number DESC,log_index DESC LIMIT 1) delivery ON true
      LEFT JOIN LATERAL (SELECT transaction_hash,payload FROM economy_chain_events
        WHERE chain_id=${deployment.chainId} AND contract_address=${deployment.ledger}
          AND event_name='BuyerAcknowledged' AND payload->>'orderId'=o.order_id
          AND lower(payload->>'payer')=lower(o.request->>'payer')
          AND payload->>'outputHash'=delivery.payload->>'outputHash'
        ORDER BY block_number DESC,log_index DESC LIMIT 1) acknowledgment ON true
      WHERE o.user_id=${userId}
        AND o.request->'settlement'->>'chainId'=${String(deployment.chainId)}
        AND lower(o.request->'settlement'->>'address')=${deployment.settlement}
        AND lower(o.request->'settlement'->>'ledgerAddress')=${deployment.ledger}
      ORDER BY o.created_at DESC,o.order_id DESC LIMIT 100`,
    db`SELECT updated_at FROM economy_index_state WHERE settlement_address=${deployment.settlement}`,
  ]);
  return {indexedAt: index[0]?.updated_at ? new Date(String(index[0].updated_at)).toISOString() : null, orders: rows.map(row => ({
    orderId: String(row.order_id), platformAgentId: String(row.platform_agent_id), agentName: String(row.agent_name), serviceHash: String(row.service_hash), seller: String(row.seller), category: String(row.category), quantity: String(row.quantity), unit: String(row.unit), amountAtomic: String(row.amount_atomic), state: String(row.state), transactionHash: String(row.transaction_hash), outputHash: row.output_hash ? String(row.output_hash) : null, createdAt: new Date(String(row.created_at)).toISOString(),
    sellerAttestation: row.attestation_hash ? {transactionHash: String(row.attestation_hash), outputHash: String(row.attested_output_hash)} : null,
    buyerAcknowledgment: row.acknowledgment_hash ? {transactionHash: String(row.acknowledgment_hash), outputHash: String(row.acknowledged_output_hash)} : null,
  }))};
}
