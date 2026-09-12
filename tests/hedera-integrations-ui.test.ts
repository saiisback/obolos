import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HederaEvidenceView} from '../src/components/platform/hedera-integrations';
import {publicHederaEvidence} from '../src/lib/hedera/public-evidence';
it('shows absent proofs without manufactured amounts or confirmations',()=>{
 const markup=renderToStaticMarkup(createElement(HederaEvidenceView,{evidence:publicHederaEvidence({})}));
 expect(markup).toContain('No confirmed proof published');expect(markup).toContain('/.well-known/agent-card.json');expect(markup).toContain('/api/hedera/evidence');
 expect(markup).not.toContain('Chain confirmed');expect(markup).not.toContain('0 HBAR');
});
it('links published topic, token and scheduled transfer proofs to fixed testnet explorers',()=>{
 const evidence=publicHederaEvidence({hts:{asset:'0.0.789',payTo:'0.0.123',unitPriceAtomic:2,decimals:0,symbol:'TEST',network:'hedera:testnet'},release:{checkedAt:'2026-09-13T00:00:00.000Z',schedules:[{scheduleId:'0.0.456',transactionId:'0.0.123@1789190000.000000001?scheduled',proof:{scheduleId:'0.0.456',consensusTimestamp:'1789190001.000000002',payer:'0.0.123',payTo:'0.0.789',amountAtomic:100,network:'hedera:testnet',asset:'HBAR',round:0}}]}});
 const markup=renderToStaticMarkup(createElement(HederaEvidenceView,{evidence}));
 expect(markup).toContain('https://hashscan.io/testnet/token/0.0.789');expect(markup).toContain('https://hashscan.io/testnet/schedule/0.0.456');expect(markup).toContain('100 tinybar');expect(markup).toContain('Testnet service credit');
});

import {canonicalAgentData,createUaid} from '../src/lib/hedera/identity';
it('renders an anchored UAID and exact topic-message JSON without using a stored link',()=>{
 const canonical=canonicalAgentData({registry:'obolos',name:'Repository service',version:'1.0.0',protocol:'a2a',nativeId:'hedera:testnet:0.0.123',skills:[7,17]});
 const profileAnchor={network:'hedera:2',topicId:'0.0.456',transactionId:'0.0.123@1789190000.000000001',sequenceNumber:'1',consensusTimestamp:'1789190001.000000002',mirrorUrl:'https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.456/messages/1'};
 const evidence=publicHederaEvidence({identityService:{version:1,canonical,uaid:createUaid(canonical),submitKey:{type:'ED25519',key:'aa'.repeat(32)},topicId:'0.0.456',profileAnchor}});
 const markup=renderToStaticMarkup(createElement(HederaEvidenceView,{evidence}));
 expect(markup).toContain(createUaid(canonical));expect(markup).toContain('https://hashscan.io/testnet/topic/0.0.456');expect(markup).toContain(profileAnchor.mirrorUrl);
});
