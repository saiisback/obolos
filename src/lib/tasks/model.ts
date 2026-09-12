import {keccak256, toHex, type Hex} from 'viem';
import {z} from 'zod';
import {canonicalJsonHash, validateSchemaValue, validateServiceDefinition, type ServiceDefinition, type ConstrainedJsonSchema} from '@/lib/economy/service-contract';

export type TaskStatus = 'queued' | 'planning' | 'needs_approval' | 'approved' | 'running' | 'completed' | 'blocked' | 'cancelled';
export interface TaskPlan {
  version: 1;
  summary: string;
  steps: {serviceHash: Hex; definition: ServiceDefinition; input: unknown}[];
  totalAtomic: string;
}
export interface TaskStepResult {index: number; orderId: string; transactionHash: string; outputHash: string; output: unknown}
export interface GeneralTask {
  id: string; agentId: string; instruction: string; budgetAtomic: string; status: TaskStatus;
  plan: TaskPlan | null; planHash: string | null; approvedPlanHash: string | null; approvalExpiresAt: string | null;
  steps: TaskStepResult[]; error: string | null; createdAt: string; updatedAt: string;
}
export const taskAtomicSchema = z.string().regex(/^[1-9]\d{0,77}$/).refine(value => BigInt(value) < 2n ** 256n, 'Budget exceeds uint256');
const rawPlan = z.object({summary: z.string().trim().min(1).max(2000), steps: z.array(z.object({serviceHash: z.string().regex(/^0x[\da-fA-F]{64}$/), input: z.unknown().refine(v => v !== undefined)}).strict()).min(1).max(5)}).strict();
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** A reference is the entire object, never interpolation or executable code. */
function mapInput(value: unknown, resolve: (index: number, path: (string | number)[]) => unknown): unknown {
  if (Array.isArray(value)) return value.map(item => mapInput(item, resolve));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => forbiddenKeys.has(key))) throw Error('Unsafe input key');
    if (Object.hasOwn(record, '$from')) {
      if (Object.keys(record).length !== 2 || !Number.isSafeInteger(record.$from) || Number(record.$from) < 0 || !Array.isArray(record.path) || record.path.length > 12 || record.path.some(key => !(typeof key === 'string' && key.length > 0 && !forbiddenKeys.has(key)) && !(Number.isSafeInteger(key) && Number(key) >= 0))) throw Error('Invalid output reference');
      return resolve(Number(record.$from), record.path as (string | number)[]);
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, mapInput(child, resolve)]));
  }
  return value;
}
export function resolveTaskInput(template: unknown, outputs: readonly unknown[]): unknown {
  canonicalJsonHash(template); // Bounds nesting and size before recursive traversal.
  return mapInput(template, (index, path) => {
    if (index >= outputs.length) throw Error('Output reference must identify an earlier completed step');
    let value = outputs[index];
    for (const key of path) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw Error('Output reference path is missing');
      value = (value as Record<string | number, unknown>)[key];
    }
    canonicalJsonHash(value);
    return structuredClone(value);
  });
}
function schemaAtPath(schema: ConstrainedJsonSchema, path: (string | number)[]): ConstrainedJsonSchema {
  let current = schema;
  for (const key of path) {
    if (current.type === 'object' && typeof key === 'string' && Object.hasOwn(current.properties!, key) && current.required?.includes(key)) current = current.properties![key];
    // maxItems is an upper bound, not a guarantee that any index exists. This
    // schema dialect has no minItems, so only whole-array references are safe.
    else throw Error('Reference path is not present in the earlier output schema');
  }
  return current;
}
function compatibleSchema(source: ConstrainedJsonSchema, target: ConstrainedJsonSchema): boolean {
  if (source.type !== target.type && !(source.type === 'integer' && target.type === 'number')) return false;
  if (target.maxLength !== undefined && (source.maxLength === undefined || source.maxLength > target.maxLength)) return false;
  if (target.minimum !== undefined && (source.minimum === undefined || source.minimum < target.minimum)) return false;
  if (target.maximum !== undefined && (source.maximum === undefined || source.maximum > target.maximum)) return false;
  if (target.type === 'array') return source.maxItems! <= target.maxItems! && compatibleSchema(source.items!, target.items!);
  if (target.type === 'object') return (target.required ?? []).every(key => source.required?.includes(key)) && Object.entries(source.properties!).every(([key, child]) => Object.hasOwn(target.properties!, key) && compatibleSchema(child, target.properties![key]));
  return true;
}
function validateTemplate(value: unknown, schema: ConstrainedJsonSchema, earlier: readonly ServiceDefinition[]): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '$from')) {
    mapInput(value, (index, path) => {
      if (index >= earlier.length) throw Error('Output references must identify earlier steps');
      if (!compatibleSchema(schemaAtPath(earlier[index].outputSchema, path), schema)) throw Error('Referenced output schema does not fit the service input');
      return null;
    });
  } else if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ((schema.required ?? []).some(key => !Object.hasOwn(record, key))) throw Error('Required service input is missing');
    for (const [key, child] of Object.entries(record)) {
      if (forbiddenKeys.has(key) || !Object.hasOwn(schema.properties!, key)) throw Error('Unknown service input field');
      validateTemplate(child, schema.properties![key], earlier);
    }
  } else if (schema.type === 'array' && Array.isArray(value)) {
    if (value.length > schema.maxItems!) throw Error('Input array exceeds service schema');
    for (const child of value) validateTemplate(child, schema.items!, earlier);
  } else validateSchemaValue(value, schema);
}
export function createTaskPlan(value: unknown, services: readonly ServiceDefinition[], budgetAtomic: string): TaskPlan {
  const budget = BigInt(taskAtomicSchema.parse(budgetAtomic)), parsed = rawPlan.parse(value);
  canonicalJsonHash(value);
  let total = 0n;
  const definitions: ServiceDefinition[] = [];
  const steps = parsed.steps.map((step) => {
    const registered = services.find(service => service.serviceHash.toLowerCase() === step.serviceHash.toLowerCase());
    if (!registered) throw Error('Plan names an unregistered or unavailable service');
    const definition = validateServiceDefinition(structuredClone(registered));
    validateTemplate(step.input, definition.inputSchema, definitions);
    definitions.push(definition);
    total += BigInt(definition.quantity) * BigInt(definition.unitPriceAtomic);
    if (total > budget) throw Error('Plan exceeds the task budget');
    return {serviceHash: definition.serviceHash, definition, input: structuredClone(step.input)};
  });
  return {version: 1, summary: parsed.summary, steps, totalAtomic: total.toString()};
}
export function taskPlanHash(plan: TaskPlan): Hex {return canonicalJsonHash(plan);}
export function taskStepOrderId(taskId: string, planHash: string, index: number): Hex {
  if (!z.uuid().safeParse(taskId).success || !/^0x[\da-f]{64}$/.test(planHash) || !Number.isInteger(index) || index < 0 || index >= 5) throw Error('Invalid task order identity');
  return keccak256(toHex(`obolos.task.v1:${taskId.toLowerCase()}:${planHash}:${index}`));
}
