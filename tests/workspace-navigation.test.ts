import {describe, expect, it} from 'vitest';
import {workspaceLinks, workspaceReturnPath} from '@/lib/platform/workspace-navigation';

describe('private workspace navigation', () => {
  it('keeps all workspace sections under /app', () => {
    expect(workspaceLinks.map(link => link.href)).toEqual(['/app', '/app/marketplace', '/app/evidence', '/app/developers']);
  });
  it('returns users to their requested workspace section after login', () => {
    for (const link of workspaceLinks) expect(workspaceReturnPath(link.href)).toBe(link.href);
  });
  it('rejects external, protocol-relative and unrelated return destinations', () => {
    for (const value of [null, 'https://evil.example/app', '//evil.example', '/developers', '/app/../api/account', '/app?next=https://evil.example', '/app\\evil']) {
      expect(workspaceReturnPath(value)).toBe('/app');
    }
  });
});
