import {NextRequest} from 'next/server';
import {authenticateIndexing,scheduledIndex} from '@/lib/economy/indexing-scheduler';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(req:NextRequest){
 try{authenticateIndexing(req.headers.get('authorization'));return platformJson(await scheduledIndex());}
 catch(error){return platformError(error);}
}
