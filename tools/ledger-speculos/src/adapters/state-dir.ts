import { homedir } from 'node:os';
import { resolve } from 'node:path';
export function stateDir(_name: string): string {
  const path = process.env.OBOLOS_SPECULOS_STATE_DIR;
  return path ? resolve(path) : resolve(homedir(), '.local/state/obolos-ledger-speculos');
}
