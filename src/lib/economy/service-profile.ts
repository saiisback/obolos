import {z} from 'zod';
import {validateSchemaValue,type ServiceDefinition} from './service-contract';

const profileInput=z.object({
 title:z.string().trim().min(1).max(100),
 description:z.string().trim().min(1).max(2000),
 tags:z.array(z.string().trim().min(1).max(40)).max(10),
 examples:z.array(z.unknown()).max(3),
}).strict();
export type ServiceProfile=z.infer<typeof profileInput>&{serviceHash:string};
export function validateServiceProfile(service:ServiceDefinition,value:unknown):ServiceProfile {
 const profile=profileInput.parse(value);
 if(new Set(profile.tags.map(tag=>tag.toLowerCase())).size!==profile.tags.length)throw Error('Use distinct service tags.');
 for(const example of profile.examples)validateSchemaValue(example,service.inputSchema,32768);
 return {serviceHash:service.serviceHash,...profile};
}
const referenceProfiles:Record<string,z.infer<typeof profileInput>>={
 inference:{title:'Writing and language assistance',description:'Generate text from your prompt: drafting, summarizing supplied text, translation and explanations. No browsing, external actions, file access or factual verification.',tags:['writing','translation','summarization'],examples:[{prompt:'Translate "Hello, welcome to our shop" into Spanish.'}]},
 compute:{title:'Text statistics and fingerprint',description:'Count characters, words and UTF-8 bytes in supplied text and calculate its SHA-256 fingerprint. This service does not execute arbitrary code.',tags:['text','statistics','hashing'],examples:[{text:'Hello world'}]},
 verification:{title:'Content integrity check',description:'Compare supplied text against an expected SHA-256 fingerprint. Checks byte integrity, not factual accuracy or writing quality.',tags:['integrity','verification'],examples:[{text:'hello world',sha256:'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'}]},
 storage:{title:'Store a text artifact',description:'Store supplied text for one hour and retrieve it through the authenticated paid-order access path.',tags:['storage','text'],examples:[{text:'My project notes'}]},
 data:{title:'GitHub repository activity',description:'Fetch current public GitHub repository metadata such as stars, forks, issues and last push time.',tags:['github','repository','data'],examples:[{repo:'octocat/Hello-World'}]},
};
/** Category alone is not evidence of a capability. Known reference descriptions require the exact host/path and compatible input. */
export function profileForService(service:ServiceDefinition,stored?:unknown):ServiceProfile {
 if(stored!==undefined&&stored!==null)return validateServiceProfile(service,stored);
 const fallback={serviceHash:service.serviceHash,title:`${service.category[0].toUpperCase()+service.category.slice(1)} service`,description:'A seller-defined service. Review its input and output schemas and provider documentation before requesting work.',tags:[service.category],examples:[]};
 const endpoint=new URL(service.endpoint);
 if(endpoint.origin!=='https://obolos.app'||endpoint.pathname!==`/api/economy/reference/${service.category}`||endpoint.search||endpoint.hash)return fallback;
 const profile=referenceProfiles[service.category];
 try{return validateServiceProfile(service,profile);}catch{return fallback;}
}
