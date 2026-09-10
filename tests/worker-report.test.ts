import {describe,it,expect} from 'vitest';
import {formatWorkerReport} from '../src/lib/integrations/worker-report';
const output={analysis:'The activity snapshot alone cannot establish software quality or security.',repositories:[{repo:'octocat/Hello-World',stars:3807,forks:6739,openIssues:7132}]};
describe('structured worker report',()=>{
 it('renders model metric claims once, without changing their values',()=>expect(formatWorkerReport(JSON.stringify(output),['octocat/Hello-World'])).toContain('octocat/Hello-World | stars=3807 | forks=6739 | openIssues=7132'));
 it('blocks extra prose metric claims before buying verification',()=>expect(()=>formatWorkerReport(JSON.stringify({...output,analysis:'Evidence stars: 3807'}),['octocat/Hello-World'])).toThrow());
 it('rejects missing, duplicate and unrequested repositories',()=>{for(const repositories of [[],[...output.repositories,...output.repositories],[{...output.repositories[0],repo:'other/repo'}]])expect(()=>formatWorkerReport(JSON.stringify({...output,repositories}),['octocat/Hello-World'])).toThrow();});
 it('does not silently repair model counts before the paid verifier',()=>expect(formatWorkerReport(JSON.stringify({...output,repositories:[{...output.repositories[0],stars:0}]}),['octocat/Hello-World'])).toContain('stars=0'));
});
