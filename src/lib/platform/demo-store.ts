import { randomUUID } from 'node:crypto';
import type { Run } from '../contracts';
import { sql } from './db';

/** Serverless demo persistence. Payment execution belongs to the isolated
 * agent runner; legacy operations still require their separate operator gate. */
export class NeonDemoStore {
  async list(owner:string):Promise<Run[]> {
    const rows=await sql()`SELECT run FROM platform_demo_runs WHERE owner=${owner} ORDER BY created_at DESC`;
    return rows.map(row=>row.run as Run);
  }
  async get(owner:string,id:string):Promise<Run> {
    const rows=await sql()`SELECT run FROM platform_demo_runs WHERE owner=${owner} AND id=${id}::uuid`;
    if(!rows[0])throw new Error('Run not found.');return rows[0].run as Run;
  }
  async insert(owner:string,run:Run):Promise<Run> {
    const db=sql();
    const rows=await db.transaction([
      db`SELECT pg_advisory_xact_lock(732980125)`,
      db`INSERT INTO platform_demo_runs(id,owner,run) SELECT ${run.id}::uuid,${owner},${JSON.stringify(run)}::jsonb
        WHERE (SELECT count(*) FROM platform_demo_runs WHERE owner=${owner})<50 AND (SELECT count(*) FROM platform_demo_runs)<500 RETURNING id`,
    ],{isolationLevel:'ReadCommitted'});
    if(!rows[1][0])throw new Error('Demo capacity reached. Export your records and ask the operator to archive old jobs.');
    return run;
  }
  async mutate(owner:string,id:string,action:(run:Run)=>Promise<Run>|Run):Promise<Run> {
    const marker=randomUUID();
    const rows=await sql()`UPDATE platform_demo_runs SET in_flight=${marker}::uuid,started_at=now()
      WHERE owner=${owner} AND id=${id}::uuid AND in_flight IS NULL RETURNING run`;
    if(!rows[0]){
      await this.get(owner,id);
      throw new Error('An operation is running or was interrupted. It will not be retried; reconcile before continuing.');
    }
    const run=rows[0].run as Run;
    let result:Run;
    try{result=await action(run);}catch(error){
      // The action could have reached an external dependency before throwing.
      // Preserve the intent, rather than make that operation retryable.
      run.status='failed';run.error='Operation interrupted; manual reconciliation is required before any further action.';
      await sql()`UPDATE platform_demo_runs SET run=${JSON.stringify(run)}::jsonb WHERE id=${id}::uuid AND owner=${owner} AND in_flight=${marker}::uuid`;
      throw error;
    }
    const saved=await sql()`UPDATE platform_demo_runs SET run=${JSON.stringify(result)}::jsonb,in_flight=NULL,started_at=NULL
      WHERE id=${id}::uuid AND owner=${owner} AND in_flight=${marker}::uuid RETURNING id`;
    if(!saved[0])throw new Error('Operation result could not be saved; manual reconciliation is required.');
    return result;
  }
}
