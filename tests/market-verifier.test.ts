import {describe,it,expect} from 'vitest';
import {verifyMetricReport} from '../src/lib/market/verifier';
import type {Report} from '../src/lib/contracts';
const now=new Date('2026-09-10T10:00:00Z');
const report:Report={title:'Metrics',summary:'openai/codex | stars=123 | forks=45 | openIssues=6',recommendation:'Consider this repository.',generatedBy:'model',createdAt:now.toISOString(),checks:[],verified:false,evidence:[{repo:'openai/codex',description:'',stars:123,forks:45,openIssues:6,pushedAt:now.toISOString(),fetchedAt:now.toISOString(),language:'TypeScript',license:'MIT',sourceUrl:'https://api.github.com/repos/openai/codex'}]};
describe('hosted metric verifier',()=>{
 it('matches explicit claims and clearly limits certification',()=>{const r=verifyMetricReport(report,now);expect(r.checks.every(c=>c.passed)).toBe(true);expect(r.checks.map(c=>c.detail).join(' ')).toMatch(/free.text.*not certified/i);});
 it.each(['openai/codex | stars=124 | forks=45 | openIssues=6','No metrics','openai/codex | stars=123 | forks=45 | openIssues=6\nopenai/codex | stars=123 | forks=45 | openIssues=6'])('rejects incorrect, missing and duplicated claims: %s',summary=>expect(verifyMetricReport({...report,summary},now).checks.some(c=>!c.passed)).toBe(true));
 it('rejects stale evidence',()=>expect(verifyMetricReport({...report,evidence:[{...report.evidence[0],fetchedAt:'2026-09-09T10:00:00Z'}]},now).checks.some(c=>!c.passed)).toBe(true));
 it('rejects metrics hidden in recommendation',()=>expect(verifyMetricReport({...report,recommendation:'This repository has 999 stars'},now).checks.some(c=>!c.passed)).toBe(true));
});
