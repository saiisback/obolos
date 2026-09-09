import type { RepoEvidence } from './contracts';

export const HEDERA_NETWORK = 'hedera:testnet' as const;
export const BLOCKY402_URL = 'https://api.testnet.blocky402.com';
export const HBAR_ASSET = '0.0.0';

export function validateRepos(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw new Error('Provide one to three repositories.');
  const repos = value.map(repo => {
    if (typeof repo !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || ['.', '..'].includes(repo.split('/')[1])) throw new Error('Invalid GitHub owner/repository.');
    return repo;
  });
  if (new Set(repos.map(repo => repo.toLowerCase())).size !== repos.length) throw new Error('Duplicate repositories are not billable.');
  return repos;
}

export type PriceBook = Record<'repo-standard' | 'repo-economy',number>;
const defaultPrices: PriceBook = {'repo-standard':100_000,'repo-economy':120_000};
export function createQuote(providerId: string, input: unknown, prices: PriceBook, payTo: string) {
  const repos = validateRepos(input);
  if (!Object.hasOwn(prices,providerId)) throw new Error('Unknown provider.');
  const unitPriceAtomic = prices[providerId as keyof PriceBook];
  const amountAtomic = unitPriceAtomic * repos.length;
  if (!Number.isSafeInteger(unitPriceAtomic) || unitPriceAtomic <= 0 || !Number.isSafeInteger(amountAtomic)) throw new Error('Invalid service price.');
  return {providerId,unitPriceAtomic,units:repos.length,amountAtomic,network:HEDERA_NETWORK,asset:'HBAR' as const,payTo,expiresAt:new Date(Date.now()+60000).toISOString()};
}

/** Fixed-host GitHub API; reject redirects so tokens never follow moved repositories. */
export async function fetchRepoEvidence(repos: string[], githubToken?: string): Promise<RepoEvidence[]> {
  return Promise.all(validateRepos(repos).map(async repo => {
    const sourceUrl = `https://api.github.com/repos/${repo}`;
    const response = await fetch(sourceUrl,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Obolos-evidence-service',...(githubToken ? {Authorization:`Bearer ${githubToken}`} : {})},redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`GitHub evidence unavailable (HTTP ${response.status}).`);
    const data = await response.json() as {private?:boolean;full_name?:string;description?:string;stargazers_count:number;forks_count:number;open_issues_count:number;pushed_at:string;language?:string;license?:{spdx_id?:string}};
    if (data.private !== false || data.full_name?.toLowerCase() !== repo.toLowerCase()) throw new Error('Only exact public repository evidence can be purchased.');
    return {repo,description:data.description ?? '',stars:data.stargazers_count,forks:data.forks_count,openIssues:data.open_issues_count,pushedAt:data.pushed_at,language:data.language ?? 'Not specified',license:data.license?.spdx_id ?? 'Not specified',sourceUrl,fetchedAt:new Date().toISOString()};
  }));
}
