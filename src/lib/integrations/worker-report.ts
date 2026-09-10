import {z} from 'zod';
const row=z.object({repo:z.string(),stars:z.number().int().nonnegative(),forks:z.number().int().nonnegative(),openIssues:z.number().int().nonnegative()}).strict();
const output=z.object({analysis:z.string().min(1).max(6000),repositories:z.array(row).min(1).max(3)}).strict();
export const workerResponseFormat={type:'json_schema',json_schema:{name:'repository_report',strict:true,schema:{type:'object',additionalProperties:false,required:['analysis','repositories'],properties:{analysis:{type:'string'},repositories:{type:'array',items:{type:'object',additionalProperties:false,required:['repo','stars','forks','openIssues'],properties:{repo:{type:'string'},stars:{type:'integer'},forks:{type:'integer'},openIssues:{type:'integer'}}}}}}}};
/** Preserve model claims for independent checking; only layout is deterministic. */
export function formatWorkerReport(content:string,repos:string[]):string {
 const data=output.parse(JSON.parse(content));
 if(data.repositories.length!==repos.length||new Set(data.repositories.map(r=>r.repo)).size!==repos.length||data.repositories.some(r=>!repos.includes(r.repo)))throw Error('Worker repository coverage is invalid.');
 if(/\d[^\n]{0,40}(?:stars?|forks?|issues?)|(?:stars?|forks?|issues?)[^\n]{0,40}\d/i.test(data.analysis))throw Error('Worker analysis includes out-of-format numeric metric claims.');
 return [data.analysis,'',...data.repositories.map(r=>`${r.repo} | stars=${r.stars} | forks=${r.forks} | openIssues=${r.openIssues}`),'',...repos.map(repo=>`Source: https://api.github.com/repos/${repo}`)].join('\n');
}
