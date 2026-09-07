import {expect, it} from 'vitest';
import {approvalFile} from '../src/lib/approval-export';
import {approvalMessage} from '../scripts/ledger-approve';

it('passes the downloaded approval directly to the hardware signing parser without changing bytes', () => {
  const message='Obolos mandate authorization\nMode: live\nNew mandate: {"label":"quoted \\"value\\""}\nUTF-8: ℏ';
  const file=approvalFile({id:'run-id',approval:{message,nonce:'nonce',expiresAt:'2030-01-01',reason:'price',proposedMandate:{} as never}});
  expect(approvalMessage(JSON.parse(file))).toBe(message);
  expect(() => approvalFile({id:'run-id'})).toThrow('no pending');
});
