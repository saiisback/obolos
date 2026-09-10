export const workspaceLinks = [
  { label: 'Agents', href: '/app' },
  { label: 'Marketplace', href: '/app/marketplace' },
  { label: 'Evidence', href: '/app/evidence' },
  { label: 'Developers', href: '/app/developers' },
] as const;

// Only known, same-origin workspace destinations may survive sign-in.
export function workspaceReturnPath(value: string | null): string {
  return workspaceLinks.some(link => link.href === value) ? value! : '/app';
}
