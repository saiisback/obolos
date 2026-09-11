import {sql} from '@/lib/platform/db';
import {platformJson,platformError} from '@/lib/platform/http';
import {referenceSeller} from '@/lib/economy/provider-queue';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{const [health]=await sql()`SELECT model,checked_at FROM economy_provider_health WHERE seller=${referenceSeller}`;const age=health?Math.max(0,Math.floor((Date.now()-new Date(String(health.checked_at)).getTime())/1000)):null;return platformJson({seller:referenceSeller,status:age!==null&&age<120?'online':'unavailable',lastSeen:health?new Date(String(health.checked_at)).toISOString():null,model:health?.model??null,storageLeaseSeconds:3600});}catch(error){return platformError(error);}}
