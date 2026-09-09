import type { SignedMandate } from '../platform/execution-contracts';
export interface RunnerJob { id:string; agentId:string; repos:string[]; mandate:SignedMandate }
export interface RunnerPins { origin:string; agentId:string; owner:string }
