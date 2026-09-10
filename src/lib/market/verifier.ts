import type {Report} from '../contracts';
// Certifies only explicit metric rows against the submitted purchased evidence.
export function verifyMetricReport(report:Report,now=new Date()) {
 const pattern=/^([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}) \| stars=(\d+) \| forks=(\d+) \| openIssues=(\d+)$/;
 const lines=report.summary.split(/\r?\n/),claims=lines.map(l=>pattern.exec(l.trim())).filter((v):v is RegExpExecArray=>!!v);
 const checks=report.evidence.map(e=>{const matches=claims.filter(c=>c[1]===e.repo);return {label:`Metrics: ${e.repo}`,passed:matches.length===1&&Number(matches[0][2])===e.stars&&Number(matches[0][3])===e.forks&&Number(matches[0][4])===e.openIssues,detail:'Exactly one stars, forks and openIssues row must match the submitted evidence.'};});
 checks.push({label:'Evidence integrity and freshness',passed:new Set(report.evidence.map(e=>e.repo)).size===report.evidence.length&&report.evidence.length>0&&report.evidence.every(e=>e.sourceUrl===`https://api.github.com/repos/${e.repo}`&&Date.parse(e.fetchedAt)<=now.getTime()+60000&&Date.parse(e.fetchedAt)>=now.getTime()-3600000),detail:'Unique GitHub evidence must be at most one hour old; its provenance is checked separately by paid delivery.'});
 const extra=[report.title,report.recommendation,...lines.filter(l=>!pattern.test(l.trim()))].join('\n');
 checks.push({label:'Claim scope',passed:claims.length===report.evidence.length&&claims.every(c=>report.evidence.some(e=>e.repo===c[1]))&&!/\d[^\n]{0,40}(?:stars?|forks?|issues?)|(?:stars?|forks?|issues?)[^\n]{0,40}\d/i.test(extra),detail:'Only canonical metric rows are certified against evidence. Free-text judgments are not certified; extra numeric metric claims are rejected.'});
 return {checks};
}

export {reportDigest} from './digest';
