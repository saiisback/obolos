import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/platform/auth';
import { revokeAgentKey } from '@/lib/platform/credentials';
import { platformError, platformJson, requireOrigin } from '@/lib/platform/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; keyId: string }> }) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const { id, keyId } = await context.params;
    await revokeAgentKey(user.id, id, keyId);
    return platformJson({ ok: true });
  } catch (error) { return platformError(error); }
}
