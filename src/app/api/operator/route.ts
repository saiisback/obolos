import { NextRequest } from 'next/server';
import { body,equal,fail,ok,operatorIdentity,sameOrigin,setSession } from '@/lib/http';
export async function POST(req:NextRequest){try{
 sameOrigin(req);const input=await body(req);
 if(!process.env.OPERATOR_TOKEN||typeof input.token!=='string'||!equal(input.token,process.env.OPERATOR_TOKEN))throw new Error('Invalid operator token.');
 const response=ok({authenticated:true});setSession(response,operatorIdentity(),'ag_operator');return response;
}catch(e){return fail(e);}}
