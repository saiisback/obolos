import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateRunner,claimJob } from '@/lib/platform/execution';
import { platformError,platformJson,readJson } from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){try{const runner=await authenticateRunner(req.headers.get('authorization'));z.object({}).strict().parse(await readJson(req));return platformJson(await claimJob(runner));}catch(e){return platformError(e);}}
