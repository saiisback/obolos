export const workspaceLinks = [
  { label: 'Agents', href: '/app' },
  { label: 'Marketplace', href: '/app/marketplace' },
  { label: 'Evidence', href: '/app/evidence' },
  { label: 'Developers', href: '/app/developers' },
] as const;

// Only known, same-origin workspace destinations may survive sign-in.
export function workspaceReturnPath(value: string | null): string {
  if (value && /^\/app\?service=[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) return value;
  return workspaceLinks.some(link => link.href === value) ? value! : '/app';
}
