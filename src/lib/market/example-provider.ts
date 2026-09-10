import {z} from 'zod';
import {marketReportSchema} from './contracts';
import {reportDigest,verifyMetricReport} from './verifier';
import {PlatformError} from '../platform/http';
const requestSchema=z.object({protocol:z.literal('obolos.verifier.v1'),order:z.object({id:z.uuid(),serviceId:z.uuid(),revision:z.number().int().positive(),recipient:z.string(),amountAtomic:z.number().int().positive(),transactionHash:z.string(),reportDigest:z.string(),receiptUrl:z.string()}).strict(),report:marketReportSchema}).strict();
export type ProviderReceipt={id:string;serviceId:string;revision:number;recipient:string;amountAtomic:number;transactionHash:string;reportDigest:string;status:string;chainConfirmed?:boolean;timestamp?:string};
/** A provider pins the marketplace it trusts; it never fetches a request's receiptUrl. */
export async function runExampleProvider(body:unknown,lookup:(id:string)=>Promise<ProviderReceipt>, expected:{serviceId:string;recipient:string}) {
  const input=requestSchema.parse(body),paid=await lookup(input.order.id),order=input.order;
  if(paid.serviceId!==expected.serviceId || paid.recipient.toLowerCase()!==expected.recipient.toLowerCase() || !paid.chainConfirmed || !['paid','fulfilled'].includes(paid.status) || paid.id!==order.id || paid.serviceId!==order.serviceId || paid.revision!==order.revision || paid.recipient.toLowerCase()!==order.recipient.toLowerCase() || paid.amountAtomic!==order.amountAtomic || paid.transactionHash.toLowerCase()!==order.transactionHash.toLowerCase() || paid.reportDigest!==order.reportDigest || reportDigest(input.report)!==paid.reportDigest)throw new PlatformError(403,'PAID_REQUEST_REQUIRED','The request does not match a confirmed paid order.');
  const timestamp=Number(paid.timestamp);
  if(!Number.isFinite(timestamp)||timestamp<=0)throw new PlatformError(403,'PAID_REQUEST_REQUIRED','The paid order timestamp is unavailable.');
  // Use settlement time so a delivery retry gives the same freshness result.
  const result=verifyMetricReport(input.report,new Date(timestamp*1000));
  result.checks.push({label:'Example provider: repository identity',passed:input.report.evidence.every(item=>item.repo.split('/').every(Boolean)),detail:'This independent HTTP provider checked repository identities in the paid evidence.'});
  return result;
}
