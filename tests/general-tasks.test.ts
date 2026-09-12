import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {createServiceDefinition} from '@/lib/economy/service-contract';
import {createTaskPlan, resolveTaskInput, taskPlanHash, taskStepOrderId} from '@/lib/tasks/model';
const address = (digit: string) => `0x${digit.repeat(40)}` as `0x${string}`;
const schema = {type: 'object' as const, properties: {text: {type: 'string' as const, maxLength: 1000}}, required: ['text'], additionalProperties: false as const};
const service = createServiceDefinition({chainId: 5042002, settlementAddress: address('1'), ledgerAddress: address('2'), seller: address('3'), endpoint: 'https://provider.example/translate', category: 'inference', unit: 'inference-request', quantity: '2', unitPriceAtomic: '9007199254740993', inputSchema: schema, outputSchema: schema});
const raw = {summary: 'Translate and refine the text.', steps: [{serviceHash: service.serviceHash, input: {text: 'Hello'}}, {serviceHash: service.serviceHash, input: {text: {$from: 0, path: ['text']}}}]};
describe('general task approval model', () => {
  it('pins exact service definitions, bigint totals, and input routing for general text work', () => {
    const plan = createTaskPlan(raw, [service], '36028797018963972');
    expect(plan.totalAtomic).toBe('36028797018963972');
    expect(plan.steps[0].definition).toEqual(service);
    expect(resolveTaskInput(plan.steps[1].input, [{text: 'Bonjour'}])).toEqual({text: 'Bonjour'});
    expect(() => createTaskPlan(raw, [service], '36028797018963971')).toThrow(/budget/);
    expect(() => createTaskPlan(raw, [service], (2n ** 256n).toString())).toThrow();
  });
  it('rejects invented providers, empty plans and oversized sequential plans', () => {
    expect(() => createTaskPlan(raw, [], '99999999999999999')).toThrow(/unregistered/);
    expect(() => createTaskPlan({...raw, steps: []}, [service], '1')).toThrow();
    expect(() => createTaskPlan({...raw, steps: Array(6).fill(raw.steps[0])}, [service], '999999999999999999')).toThrow();
  });
  it('rejects self/forward references, executable reference shapes and missing or mismatched paths before payment', () => {
    for (const reference of [{$from: 1, path: ['text']}, {$from: 2, path: ['text']}, {$from: 0, path: ['missing']}, {$from: 0, path: ['text'], expression: 'run()'}, {$from: 0, path: ['constructor']}]) {
      expect(() => createTaskPlan({...raw, steps: [raw.steps[0], {serviceHash: service.serviceHash, input: {text: reference}}]}, [service], '99999999999999999')).toThrow();
    }
    expect(() => createTaskPlan({...raw, steps: [{serviceHash: service.serviceHash, input: {text: {$from: 0, path: ['text']}}}]}, [service], '99999999999999999')).toThrow();
    expect(() => resolveTaskInput({text: {$from: 0, path: ['absent']}}, [{text: 'ok'}])).toThrow();
  });
  it('validates literal siblings even when a template also includes an output reference', () => {
    expect(() => createTaskPlan({...raw, steps: [raw.steps[0], {serviceHash: service.serviceHash, input: {...raw.steps[1].input, extra: 'invalid'}}]}, [service], '99999999999999999')).toThrow();
    expect(() => createTaskPlan({...raw, steps: [{serviceHash: service.serviceHash, input: {}}]}, [service], '99999999999999999')).toThrow();
  });
  it('rejects array-index references without guaranteed items but accepts schema-compatible whole arrays', () => {
    const {protocol: _protocol, serviceHash: _hash, ...terms} = service;
    const arraySchema = {type: 'array' as const, items: {type: 'string' as const, maxLength: 1000}, maxItems: 3};
    const producer = createServiceDefinition({...terms, endpoint: 'https://provider.example/array', outputSchema: arraySchema});
    const consumer = createServiceDefinition({...terms, endpoint: 'https://provider.example/combine', inputSchema: arraySchema});
    const first = {serviceHash: producer.serviceHash, input: {text: 'Hello'}};
    expect(() => createTaskPlan({summary: 'Read a possibly empty array.', steps: [first, {serviceHash: service.serviceHash, input: {text: {$from: 0, path: [0]}}}]}, [service, producer], '99999999999999999')).toThrow(/path/);
    const plan = createTaskPlan({summary: 'Process the full array.', steps: [first, {serviceHash: consumer.serviceHash, input: {$from: 0, path: []}}]}, [producer, consumer], '99999999999999999');
    expect(resolveTaskInput(plan.steps[1].input, [[]])).toEqual([]);
  });
  it('hashes complete approved terms canonically and retains deterministic order IDs across retries', () => {
    const plan = createTaskPlan(raw, [service], '99999999999999999'), hash = taskPlanHash(plan), id = randomUUID();
    expect(taskPlanHash(JSON.parse(JSON.stringify(plan)))).toBe(hash);
    expect(taskStepOrderId(id, hash, 0)).toBe(taskStepOrderId(id, hash, 0));
    expect(taskStepOrderId(id, hash, 1)).not.toBe(taskStepOrderId(id, hash, 0));
    expect(taskPlanHash({...plan, summary: 'Other'})).not.toBe(hash);
    plan.steps[0].definition.inputSchema = {type: 'null'};
    expect(taskPlanHash(plan)).not.toBe(hash);
    expect(service.inputSchema).toEqual(schema);
  });
});
