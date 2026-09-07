import type { BrokerHealth, Run } from './contracts';
import type { BrokerWallets, LiveOverview, ReadinessCheck } from './live-contracts';

export const LIVE_RESOURCES = [
  {id:'source',label:'AgentGDP public source and architecture',url:'https://github.com/saiisback/AgentGDP'},
  {id:'setup',label:'AgentGDP credential and wallet setup guide',url:'https://github.com/saiisback/AgentGDP/blob/main/docs/live-setup.md'},
  {id:'circle',label:'Create and fund a Circle Agent Wallet',url:'https://developers.circle.com/agent-stack/agent-wallets/quickstart'},
  {id:'arc-faucet',label:'Circle testnet USDC faucet',url:'https://faucet.circle.com/'},
  {id:'hedera-faucet',label:'Hedera testnet account and HBAR faucet',url:'https://portal.hedera.com/'},
  {id:'ledger',label:'Ledger Key Ring setup',url:'https://developers.ledger.com/docs/ai-tools/ledger-cli'},
  {id:'ledger-track',label:'Ledger track and required DX feedback',url:'https://developers.ledger.com/ethonline'},
  {id:'blocky',label:'Blocky402 testnet integration',url:'https://blocky402.com/docs/testnet/'},
  {id:'hedera-explorer',label:'Inspect Hedera transactions on HashScan',url:'https://hashscan.io/testnet'},
  {id:'arc-explorer',label:'Inspect Arc transactions on ArcScan',url:'https://testnet.arcscan.app/'},
  {id:'arc',label:'Arc testnet network details',url:'https://docs.arc.io/arc/references/connect-to-arc'},
  {id:'tracks',label:'ETHOnline prize requirements',url:'https://ethglobal.com/events/ethonline2026/prizes'},
];
export function safeServiceUrl(value?:string):string|null {
  try {
    const url=new URL(value??'');
    if(url.username||url.password||url.search||url.hash)return null;
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return null;
    return url.href.replace(/\/$/,'');
  }catch{return null;}
}
export function liveConfiguration(env:Record<string,string|undefined>):boolean {
  return !!env.OPERATOR_TOKEN&&!!safeServiceUrl(env.DATA_SERVICE_URL)&&/^0x[0-9a-fA-F]{40}$/.test(env.LEDGER_CONTROLLER_ADDRESS??'');
}
export function buildLiveOverview(input:{
  authenticated:boolean; env:Record<string,string|undefined>; runs:Run[];
  health:BrokerHealth; wallets?:BrokerWallets; serviceReachable:boolean;
}):LiveOverview {
  const {authenticated,env,health}=input;
  const service=safeServiceUrl(env.DATA_SERVICE_URL);
  const controller=/^0x[0-9a-fA-F]{40}$/.test(env.LEDGER_CONTROLLER_ADDRESS??'')?env.LEDGER_CONTROLLER_ADDRESS!:null;
  const wallets=authenticated?(input.wallets?.wallets??[]):[];
  const liveRuns=input.runs.filter(run=>run.mode==='live');
  const receipts=liveRuns.flatMap(run=>run.receipts).filter(receipt=>receipt.mode==='live'&&receipt.status==='settled'&&!!receipt.transactionId);
  const evidence={liveRuns:liveRuns.length,hederaPayments:receipts.filter(r=>r.network==='hedera:testnet').length,arcPayments:receipts.filter(r=>r.network==='arc:testnet').length,ledgerApprovals:liveRuns.flatMap(r=>r.authorizations??[]).filter(p=>p.mode==='live'&&p.signature&&p.signer).length};
  const checks:ReadinessCheck[]=[
    {id:'operator',label:'Operator authenticated',status:authenticated?'ready':'action',detail:authenticated?'This browser can inspect wallet details and request live jobs.':'Enter the operator token below. Wallet details stay private until authentication.'},
    {id:'broker',label:'Ledger-enrolled broker and Circle session',status:health.ready?'ready':'missing',detail:health.ready?'Required capabilities report configured; this is not payment proof.':'Provision Key Ring, the model credential, Hedera payer and Circle testnet session in the private broker.'},
    {id:'controller',label:'Pinned Ledger controller',status:controller?'ready':'missing',detail:controller?'A controller address is configured; confirm it on the physical Ledger.':'Derive and confirm the controller address on your Ledger, then configure it on app and broker.'},
    {id:'service',label:'Hedera x402 service',status:input.serviceReachable?'ready':'missing',detail:input.serviceReachable?'The service health endpoint identifies Hedera testnet and hosted Blocky402. A paid request is still needed.':authenticated?'Start the data service and set DATA_SERVICE_URL. Read-only health could not be confirmed.':'Authenticate to check the configured resource service.'},
    ...(['hedera-payer','circle-agent'] as const).map(id=>{
      const wallet=wallets.find(w=>w.id===id),positive=wallet?.balanceStatus==='available'&&wallet.balanceAtomic!==null&&BigInt(wallet.balanceAtomic)>0n;
      return {id:`funding-${id}`,label:id==='hedera-payer'?'HBAR payer funded':'Arc agent wallet funded',status:positive?'ready':'action',detail:positive?'A positive testnet balance was observed. Each job still needs enough principal plus network fees.':'Fund the testnet wallet and refresh. Unknown balances are not displayed as zero.'} as ReadinessCheck;
    }),
    {id:'payments',label:'Real paid request on both rails',status:evidence.hederaPayments>0&&evidence.arcPayments>0?'ready':'action',detail:`This workspace has ${evidence.hederaPayments} confirmed Hedera and ${evidence.arcPayments} confirmed Arc receipts. Rehearsals do not count.`},
    {id:'hardware',label:'Physical Ledger demo and authorization proof',status:'action',detail:`${evidence.ledgerApprovals} saved controller proofs in this workspace. A recorded physical device demonstration and Ledger tooling feedback are still required.`},
    {id:'publish',label:'Public service and demo',status:'action',detail:'The public repository is linked below. Deploy the x402 service over HTTPS and record the real paid request in a 2–4 minute video.'},
  ];
  return {checkedAt:input.wallets?.observedAt??new Date().toISOString(),operatorAuthenticated:authenticated,liveEnabled:authenticated&&health.ready&&liveConfiguration(env),controllerAddress:authenticated?controller:null,serviceUrl:authenticated?service:null,wallets,checks,evidence,resources:LIVE_RESOURCES};
}
