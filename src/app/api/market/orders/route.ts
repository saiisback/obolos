import {NextRequest} from 'next/server';
import {authenticateRunner} from '@/lib/platform/execution';
import {createMarketOrder} from '@/lib/platform/marketplace';
import {platformError,platformJson,readJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){try{return platformJson({order:await createMarketOrder(await authenticateRunner(req.headers.get('authorization')),await readJson(req,262144))},201);}catch(e){return platformError(e);}}
