import type {User} from './auth';
import {sql} from './db';
import {PlatformError} from './http';
import {z} from 'zod';
import {validateServiceDefinition} from '../economy/service-contract';
import {profileForService,validateServiceProfile,type ServiceProfile} from '../economy/service-profile';

export async function listServiceProfiles():Promise<ServiceProfile[]> {
 const rows=await sql()`SELECT s.definition,p.profile FROM economy_services s
 LEFT JOIN economy_service_profiles p ON p.service_hash=s.service_hash
 WHERE NOT EXISTS(SELECT 1 FROM economy_service_retirements r WHERE r.service_hash=s.service_hash)
 ORDER BY s.created_at DESC LIMIT 100`;
 return rows.map(row=>profileForService(validateServiceDefinition(row.definition),row.profile));
}
export async function saveServiceProfile(user:User,serviceHash:string,value:unknown):Promise<ServiceProfile> {
 const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(serviceHash).toLowerCase(),db=sql();
 const rows=await db`SELECT definition FROM economy_services WHERE service_hash=${hash} AND user_id=${user.id}`;
 if(!rows[0])throw new PlatformError(404,'SERVICE_NOT_FOUND','Your published service was not found.');
 const service=validateServiceDefinition(rows[0].definition);
 if(service.seller!==user.address.toLowerCase())throw new PlatformError(403,'SERVICE_SELLER_MISMATCH','Only the registered seller may describe this service.');
 let profile:ServiceProfile;
 try{profile=validateServiceProfile(service,value);}catch{throw new PlatformError(400,'INVALID_SERVICE_PROFILE','Provide a title, description, distinct tags and example inputs matching your service schema.');}
 const {serviceHash:_hash,...stored}=profile;
 await db`INSERT INTO economy_service_profiles(service_hash,profile) VALUES(${hash},${JSON.stringify(stored)}::jsonb)
 ON CONFLICT(service_hash) DO UPDATE SET profile=excluded.profile,updated_at=now()`;
 return profile;
}
