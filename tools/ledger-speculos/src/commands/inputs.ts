import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { option } from '../adapters/command';
export const outputOption=option(z.enum(['human','json']).default('human'));
export function resolveOutputFormat(value?:string):'human'|'json'{return value==='json'?'json':'human';}
export function resolveUserPath(path:string){return resolve(path.startsWith('~/')?homedir()+path.slice(1):path);}
