import type { Run } from './contracts';

/** Preserve the exact signed UTF-8 message in the signing script's JSON input format. */
export function approvalFile(run: Pick<Run, 'id' | 'approval'>): string {
  if (!run.approval) throw new Error('There is no pending authorization to export.');
  return JSON.stringify({schema: 'obolos.approval.v1', runId: run.id, message: run.approval.message}, null, 2);
}
