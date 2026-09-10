import {describe, expect, it} from 'vitest';
import {workspaceLinks, workspaceReturnPath} from '@/lib/platform/workspace-navigation';

describe('private workspace navigation', () => {
  it('keeps all workspace sections under /app', () => {
    expect(workspaceLinks.map(link => link.href)).toEqual(['/app', '/app/marketplace', '/app/evidence', '/app/developers']);
  });
  it('returns users to their requested workspace section after login', () => {
    for (const link of workspaceLinks) expect(workspaceReturnPath(link.href)).toBe(link.href);
  });
  it('preserves only a valid service selection through login', () => {
    const service='13936142-3321-4de8-8e09-e57dcf7d1a82';
    expect(workspaceReturnPath(`/app?service=${service}`)).toBe(`/app?service=${service}`);
    for(const path of ['/app?service=bad', `/app?service=${service}&next=https://evil.example`, `/app?service=${service}#untrusted`]) expect(workspaceReturnPath(path)).toBe('/app');
  });
  it('rejects external, protocol-relative and unrelated return destinations', () => {
    for (const value of [null, 'https://evil.example/app', '//evil.example', '/developers', '/app/../api/account', '/app?next=https://evil.example', '/app\\evil']) {
      expect(workspaceReturnPath(value)).toBe('/app');
    }
  });
});
