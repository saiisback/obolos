import {NextRequest} from 'next/server';
import {requireUser} from '@/lib/platform/auth';
import {sql} from '@/lib/platform/db';
import {publicMarketOrder} from '@/lib/platform/marketplace';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {
    const user=await requireUser(request);
    const rows=await sql()`SELECT o.*,a.name AS agent_name,o.service_snapshot->>'name' AS service_name
      FROM platform_market_orders o JOIN platform_jobs j ON j.id=o.job_id
      JOIN platform_agents a ON a.id=j.agent_id WHERE a.user_id=${user.id}
      ORDER BY o.created_at DESC,o.id DESC LIMIT 100`;
    return platformJson({orders:rows.map(row=>({...publicMarketOrder(row),agentName:String(row.agent_name),serviceName:String(row.service_name)}))});
  } catch(error) {return platformError(error);}
}
