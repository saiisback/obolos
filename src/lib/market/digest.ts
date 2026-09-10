import {createHash} from 'node:crypto';
import type {Report} from '../contracts';
export function reportDigest(r:Report) {
 // Stable field order survives JSONB key normalization and excludes mutable checks.
 const evidence=r.evidence.map(e=>({repo:e.repo,description:e.description,stars:e.stars,forks:e.forks,openIssues:e.openIssues,pushedAt:e.pushedAt,language:e.language,license:e.license,sourceUrl:e.sourceUrl,fetchedAt:e.fetchedAt}));
 return createHash('sha256').update(JSON.stringify({title:r.title,summary:r.summary,recommendation:r.recommendation,evidence,generatedBy:r.generatedBy,createdAt:r.createdAt})).digest('hex');
}
