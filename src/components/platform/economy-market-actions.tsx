'use client';

import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {decodeFunctionResult, encodeFunctionData, formatUnits, keccak256, parseAbi, toHex, type Hex} from 'viem';
import {createServiceDefinition, serviceRequestSchema, validateServiceDefinition, validateServiceRequest, type ServiceDefinition, type ServiceRequest} from '@/lib/economy/service-contract';
import {resourceCategories} from '@/lib/economy/model';
import {api, errorMessage, type Agent, type User} from './api';
import {useBrowserWallets} from './wallets';
import s from './platform.module.css';
import e from './economy-workspace.module.css';

type Deployment = {chainId: number; settlement: string; ledger: string};
type DeliveredOrder = {orderId: string; serviceHash: string; transactionHash: string; state: string; deliveryAttempts: number; output?: unknown; outputHash?: string; deliveryError?: string};
const registrationAbi = parseAbi([
  'function registerService(uint8 category,bytes32 unitHash,uint256 quantity,uint256 unitPrice,bytes32 endpointHash) returns(bytes32)',
  'function services(bytes32) view returns(address seller,uint8 category,bytes32 unitHash,uint256 quantity,uint256 unitPrice,bytes32 endpointHash)',
]);
const protocolDocs = 'https://github.com/saiisback/obolos/blob/main/docs/economy-provider-protocol.md';
const serviceTemplate = JSON.stringify({endpoint: '', category: 'compute', unit: 'compute-unit', quantity: '1', unitPriceAtomic: '10000', inputSchema: {type: 'object', properties: {text: {type: 'string', maxLength: 2000}}, required: ['text'], additionalProperties: false}, outputSchema: {type: 'object', properties: {result: {type: 'string', maxLength: 4000}}, required: ['result'], additionalProperties: false}}, null, 2);
const amount = (value: string | bigint) => `${formatUnits(BigInt(value), 6)} test USDC`;
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

function ReceiptLink({hash}: {hash: string}) {
  return /^0x[\da-f]{64}$/i.test(hash) ? <a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction {short(hash)}</a> : null;
}

export function EconomyServicePublishing({deployment, reserveBps, reviewBps}: {deployment: Deployment; reserveBps: string | number; reviewBps: string | number}) {
  const wallets = useBrowserWallets();
  const [walletId, setWalletId] = useState('');
  const [source, setSource] = useState(serviceTemplate);
  const [definition, setDefinition] = useState<ServiceDefinition | null>(null);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [transaction, setTransaction] = useState('');
  const [registrationAttempted, setRegistrationAttempted] = useState(false);
  const wallet = wallets.find(item => item.info.uuid === walletId) ?? wallets[0];

  async function loadCatalog() {
    try {setServices((await api<{services: ServiceDefinition[]}>('/api/economy/services')).services); setCatalogError('');}
    catch (caught) {setCatalogError(errorMessage(caught));}
  }
  useEffect(() => {void loadCatalog();}, []);

  async function prepare(event: FormEvent) {
    event.preventDefault(); setBusy('review'); setError(''); setMessage('');
    try {
      const account = await api<{user: User | null}>('/api/account');
      if (!account.user) throw Error('Sign in with the seller wallet before publishing.');
      const input = JSON.parse(source);
      const value = input.serviceHash ? validateServiceDefinition(input) : createServiceDefinition({...input, chainId: 5042002, settlementAddress: deployment.settlement, ledgerAddress: deployment.ledger, seller: account.user.address});
      if (value.seller !== account.user.address.toLowerCase() || value.settlementAddress !== deployment.settlement.toLowerCase() || value.ledgerAddress !== deployment.ledger.toLowerCase()) throw Error('The definition must use your signed-in seller wallet and the current deployment.');
      const endpoint = new URL(value.endpoint);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || (endpoint.port && endpoint.port !== '443')) throw Error('Use a public HTTPS endpoint without credentials, query parameters, fragments, or a custom port.');
      const pending = window.sessionStorage.getItem(`economy-registration:${value.serviceHash}`);
      setDefinition(value); setTransaction(pending?.startsWith('0x') ? pending : ''); setRegistrationAttempted(!!pending);
    } catch (caught) {setDefinition(null); setError(errorMessage(caught));}
    finally {setBusy('');}
  }

  async function register() {
    if (!definition || !wallet || busy) return;
    setBusy('register'); setError(''); setMessage('');
    let submitted = false;
    try {
      const account = await api<{user: User | null}>('/api/account');
      if (account.user?.address.toLowerCase() !== definition.seller) throw Error('The signed-in account changed. Review the service again.');
      const accounts = await wallet.provider.request({method: 'eth_requestAccounts'});
      if (!Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== definition.seller) throw Error('Select the browser wallet account that owns this workspace.');
      if (BigInt(String(await wallet.provider.request({method: 'eth_chainId'}))) !== 5042002n) await wallet.provider.request({method: 'wallet_switchEthereumChain', params: [{chainId: toHex(5042002)}]});
      if (BigInt(String(await wallet.provider.request({method: 'eth_chainId'}))) !== 5042002n) throw Error('Switch the wallet to Arc testnet (5042002).');
      const result = await wallet.provider.request({method: 'eth_call', params: [{to: deployment.settlement, data: encodeFunctionData({abi: registrationAbi, functionName: 'services', args: [definition.serviceHash]})}, 'latest']});
      const existing = decodeFunctionResult({abi: registrationAbi, functionName: 'services', data: String(result) as Hex});
      if (existing[0] !== '0x0000000000000000000000000000000000000000') {setRegistrationAttempted(true); setMessage('These service terms are already registered. Publish the definition after the registration is finalized.'); return;}
      const data = encodeFunctionData({abi: registrationAbi, functionName: 'registerService', args: [resourceCategories.indexOf(definition.category), keccak256(toHex(definition.unit)), BigInt(definition.quantity), BigInt(definition.unitPriceAtomic), keccak256(toHex(definition.endpoint))]});
      window.sessionStorage.setItem(`economy-registration:${definition.serviceHash}`, 'submitted'); setRegistrationAttempted(true); submitted = true;
      const hash = await wallet.provider.request({method: 'eth_sendTransaction', params: [{from: definition.seller, to: deployment.settlement, chainId: toHex(5042002), data, value: '0x0'}]});
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('The wallet did not return a transaction hash. Check its activity before submitting anything else.');
      window.sessionStorage.setItem(`economy-registration:${definition.serviceHash}`, hash); setTransaction(hash);
      setMessage('Registration submitted. Once it is finalized, publish the definition below. Publication checks finalized on-chain terms and sends no wallet transaction.');
    } catch (caught) {
      if (submitted && (caught as {code?: number}).code === 4001) {window.sessionStorage.removeItem(`economy-registration:${definition.serviceHash}`); setRegistrationAttempted(false);}
      setError(errorMessage(caught));
    } finally {setBusy('');}
  }

  async function publish() {
    if (!definition || busy) return;
    setBusy('publish'); setError(''); setMessage('');
    try {
      await api('/api/economy/services', {method: 'POST', body: JSON.stringify(definition)});
      setMessage('Service published. Buyers can discover its immutable definition from the public services API.');
      await loadCatalog();
    } catch (caught) {setError(`${errorMessage(caught)} If registration is still pending, wait for finality and retry publication only.`);}
    finally {setBusy('');}
  }

  const principal = definition ? BigInt(definition.quantity) * BigInt(definition.unitPriceAtomic) : 0n;
  const reserve = principal * BigInt(reserveBps) / 10000n;
  const review = principal * BigInt(reviewBps) / 10000n;
  return <section className={e.section}>
    <h2>Publish your service</h2><p>Register immutable terms with your seller wallet, then publish the endpoint’s input and output schemas. You need an Arc testnet wallet with gas; publishing does not fund or enroll a buyer agent.</p>
    <details className={e.details}><summary>Open advanced service publication</summary><div className={e.actionPanel}>
      <p>Use <code>obolos.service.v1</code>. Replace the empty endpoint and adapt the example schemas to your API. Prices are integer micro-USDC; 10,000 = 0.01 USDC. <a href={protocolDocs} target="_blank" rel="noopener noreferrer">Provider protocol</a></p>
      <form onSubmit={prepare}><label htmlFor="economy-service-json">Service terms JSON</label><textarea id="economy-service-json" value={source} onChange={event => {setSource(event.target.value); setDefinition(null); setError(''); setMessage('');}} rows={14} spellCheck={false} maxLength={120000} disabled={!!busy}/><button className={s.secondary} disabled={!!busy}>{busy === 'review' ? 'Validating…' : 'Review service terms'}</button></form>
      {definition && <div className={e.serviceReview}>
        <h3>Review before wallet signing</h3><dl><div><dt>Seller</dt><dd><code>{definition.seller}</code></dd></div><div><dt>Endpoint</dt><dd>{definition.endpoint}</dd></div><div><dt>Category / unit</dt><dd>{definition.category} / {definition.unit}</dd></div><div><dt>Unit price × quantity</dt><dd>{amount(definition.unitPriceAtomic)} × {definition.quantity}</dd></div><div><dt>Order principal</dt><dd>{amount(principal)}</dd></div><div><dt>Seller allocation · {formatUnits(10000n - BigInt(reserveBps) - BigInt(reviewBps), 2)}%</dt><dd>{amount(principal - reserve - review)}</dd></div><div><dt>Reserve / review pool</dt><dd>{amount(reserve)} / {amount(review)}</dd></div><div><dt>Service hash</dt><dd><code>{definition.serviceHash}</code></dd></div></dl>
        <p>Allocation uses the indexed fee policy and includes seller rounding dust. Actual future orders must use the policy in force at settlement. This transaction only registers the service; it does not collect an order payment.</p>
        {wallets.length ? <label htmlFor="economy-wallet">Seller browser wallet<select id="economy-wallet" value={wallet?.info.uuid ?? ''} onChange={event => setWalletId(event.target.value)} disabled={!!busy}>{wallets.map(item => <option key={item.info.uuid} value={item.info.uuid}>{item.info.name}</option>)}</select></label> : <p>No browser wallet detected. Open this workspace in a browser with your wallet extension to register, or publish already-registered terms below.</p>}
        <div className={e.formActions}><button className={s.secondary} type="button" onClick={() => void register()} disabled={!!busy || !wallet || registrationAttempted}>{busy === 'register' ? 'Check your wallet…' : registrationAttempted ? 'Registration submitted or found' : 'Register service in wallet'}</button><button className={s.primary} type="button" onClick={() => void publish()} disabled={!!busy}>{busy === 'publish' ? 'Checking finalized registration…' : 'Publish registered service'}</button></div>
        {transaction && <p><ReceiptLink hash={transaction}/></p>}
        {registrationAttempted && <p>Registration is not resubmitted here. Check wallet activity or the transaction receipt, then retry publication when finalized.</p>}
      </div>}
      {error && <p className={e.formError} role="alert">{error}</p>}{message && <p className={e.note} role="status">{message}</p>}
    </div></details>
    <details className={e.details}><summary>Browse published service definitions ({services.length})</summary>{catalogError ? <p role="alert">{catalogError} <button className={s.secondary} onClick={() => void loadCatalog()}>Reload definitions</button></p> : services.length === 0 ? <p>No immutable service definitions have been published.</p> : <ul className={e.definitionList}>{services.map(service => <li key={service.serviceHash}><strong>{service.category} · {amount(service.unitPriceAtomic)} / {service.unit}</strong><p>{service.endpoint}</p><code>{service.serviceHash}</code><pre>{JSON.stringify(service, null, 2)}</pre></li>)}</ul>}<p><a href="/api/economy/services" target="_blank" rel="noopener noreferrer">Public services JSON</a></p></details>
  </section>;
}

export function EconomyOrderDelivery({deployment}: {deployment: Deployment}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [source, setSource] = useState('');
  const [prepared, setPrepared] = useState<ServiceRequest | null>(null);
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState<DeliveredOrder | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [agentsError, setAgentsError] = useState('');

  async function loadAgents() {
    try {const result = await api<{agents: Agent[]}>('/api/agents'); setAgents(result.agents); setAgentId(current => result.agents.some(agent => agent.id === current) ? current : result.agents[0]?.id ?? ''); setAgentsError('');}
    catch (caught) {setAgentsError(errorMessage(caught));}
  }
  useEffect(() => {void loadAgents();}, []);

  async function prepare(event: FormEvent) {
    event.preventDefault(); setBusy('review'); setError(''); setPrepared(null);
    try {
      const parsed = serviceRequestSchema.parse(JSON.parse(source));
      if (!agentId || keccak256(toHex(agentId)) !== parsed.agentId) throw Error('Choose the platform agent used by this settled request. Its on-chain ID must match.');
      if (parsed.settlement.address !== deployment.settlement.toLowerCase() || parsed.settlement.ledgerAddress !== deployment.ledger.toLowerCase()) throw Error('The request must use the active Arc deployment.');
      const services = await api<{services: ServiceDefinition[]}>('/api/economy/services');
      const service = services.services.find(item => item.serviceHash === parsed.serviceHash);
      if (!service) throw Error('Publish this service definition before requesting delivery.');
      setPrepared(validateServiceRequest(service, parsed));
    } catch (caught) {setError(errorMessage(caught));}
    finally {setBusy('');}
  }

  async function submit() {
    if (!prepared || busy) return;
    setBusy('submit'); setError(''); setOrder(null); setOrderId(prepared.orderId);
    try {setOrder((await api<{order: DeliveredOrder}>('/api/economy/orders', {method: 'POST', body: JSON.stringify({platformAgentId: agentId, request: prepared})})).order);}
    catch (caught) {setError(`${errorMessage(caught)} Read this order’s status before retrying. Keep the same order ID and payment transaction.`);}
    finally {setBusy('');}
  }

  async function recover(retry: boolean) {
    if (!/^0x[\da-f]{64}$/i.test(orderId)) {setError('Enter the full bytes32 order ID from the original paid request.'); return;}
    setBusy(retry ? 'retry' : 'status'); setError(''); setOrder(null);
    try {setOrder((await api<{order: DeliveredOrder}>(`/api/economy/orders/${orderId}${retry ? '/delivery' : ''}`, retry ? {method: 'POST'} : {})).order);}
    catch (caught) {setError(errorMessage(caught));}
    finally {setBusy('');}
  }

  return <section className={e.section}><h2>Deliver a paid service order</h2><p>Submit the immutable request from an already-finalized contract settlement. Your signed-in human owner must own the platform agent and its on-chain mandate; the request’s payer must be its registered executor.</p>
    <details className={e.details}><summary>Open advanced paid-order delivery</summary><div className={e.actionPanel}>
      <p>This panel verifies an existing payment and requests provider delivery. It never creates a payment, funds a wallet, or enrolls an agent. <Link href="/app/developers#integration">Developer integration</Link> · <a href={protocolDocs} target="_blank" rel="noopener noreferrer">Request protocol</a></p>
      {agentsError && <p role="alert">{agentsError} <button className={s.secondary} onClick={() => void loadAgents()}>Reload agents</button></p>}
      <form onSubmit={prepare}><label htmlFor="economy-order-agent">Owning platform agent<select id="economy-order-agent" value={agentId} onChange={event => {setAgentId(event.target.value); setPrepared(null);}} disabled={!!busy || agents.length === 0}>{agents.length === 0 && <option value="">No agents available</option>}{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label htmlFor="economy-request-json">Settled ServiceRequest JSON<textarea id="economy-request-json" value={source} onChange={event => {setSource(event.target.value); setPrepared(null);}} rows={12} spellCheck={false} placeholder="Paste the complete obolos.service.v1 request, including input and the finalized settlement transaction." maxLength={120000} required disabled={!!busy}/></label><button className={s.secondary} disabled={!!busy || !agentId}>{busy === 'review' ? 'Validating request…' : 'Review paid request'}</button>
      </form>
      {prepared && <div className={e.serviceReview}><h3>Existing payment to verify</h3><p>{amount(prepared.amountAtomic)} · {prepared.category} · quantity {prepared.quantity}</p><p>Order <code>{prepared.orderId}</code></p><p><ReceiptLink hash={prepared.settlement.transactionHash}/></p><p>The API independently verifies finalized settlement evidence before contacting the service. Input is sent to the published provider endpoint.</p><button className={s.primary} onClick={() => void submit()} disabled={!!busy}>{busy === 'submit' ? 'Verifying payment and requesting delivery…' : 'Verify payment & request delivery'}</button></div>}
      <div className={e.recovery}><h3>Check or retry an existing order</h3><p>Use the original order ID. Delivery retries reuse its saved request and payment.</p><label htmlFor="economy-recover-id">Order ID<input id="economy-recover-id" value={orderId} onChange={event => {setOrderId(event.target.value.trim()); setOrder(null);}} placeholder="0x… (64 hexadecimal characters)" disabled={!!busy} spellCheck={false}/></label><div className={e.formActions}><button className={s.secondary} onClick={() => void recover(false)} disabled={!!busy || !orderId}>{busy === 'status' ? 'Reading status…' : 'Read order status'}</button><button className={s.secondary} onClick={() => void recover(true)} disabled={!!busy || !orderId || order?.state === 'fulfilled'}>{busy === 'retry' ? 'Requesting delivery…' : 'Retry delivery only'}</button></div></div>
      {error && <p className={e.formError} role="alert">{error}</p>}
      {order && <div className={e.serviceReview} role="status"><h3>{order.state === 'fulfilled' ? 'Provider response received' : order.state === 'delivering' ? 'Delivery in progress' : 'Paid · awaiting delivery'}</h3><p>Order <code>{order.orderId}</code></p><p>Delivery attempts: {order.deliveryAttempts}. The provider response does not attest on-chain delivery or independently verify output quality.</p>{order.deliveryError && <p>{order.deliveryError}</p>}{order.output !== undefined && <><h3>Provider output</h3><pre>{JSON.stringify(order.output, null, 2)}</pre></>}{order.outputHash && <p>Output hash <code>{order.outputHash}</code></p>}<p><ReceiptLink hash={order.transactionHash}/></p></div>}
    </div></details>
  </section>;
}
