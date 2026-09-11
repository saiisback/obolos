import {execFileSync} from 'node:child_process';
import {decryptBrokerSecrets} from '../src/lib/integrations/ledger';
import {executeProviderWork,inferWithProvider} from '../src/lib/economy/provider-work';
async function main(){
 const pass=process.env.WALLET_PASS||execFileSync('security',['find-generic-password','-s','obolos-speculos-ring-password','-w'],{encoding:'utf8'}).trim();
 const secrets=await decryptBrokerSecrets({...process.env,WALLET_PASS:pass});
 const context={orderId:'preflight-no-settlement',paidAt:Math.floor(Date.now()/1000)};
 const data=await executeProviderWork('data',{repo:'saiisback/obolos'},context);
 const inference=await executeProviderWork('inference',{prompt:'In one sentence, describe what a cryptographic hash verifies.'},{...context,infer:prompt=>inferWithProvider(prompt,{apiKey:secrets.inferenceApiKey,model:'gpt-5-nano',baseUrl:'https://api.openai.com/v1'})});
 console.log(JSON.stringify({sourceConnected:!!data.fetchedAt,sourceUrl:data.sourceUrl,modelConnected:!!inference.text,model:inference.model,requestId:inference.requestId,promptTokens:inference.promptTokens,completionTokens:inference.completionTokens,settlement:false}));
}
main().catch(()=>{console.error('Real provider preflight failed; no synthetic fallback used.');process.exitCode=1;});
