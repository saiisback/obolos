import {listServiceProfiles} from '@/lib/platform/service-profiles';
import {platformError,platformJson} from '@/lib/platform/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{return platformJson({profiles:await listServiceProfiles()});}catch(error){return platformError(error);}}
