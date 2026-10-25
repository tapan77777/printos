import { logAccountFailure } from './authDiagnostic';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
type Stage = 'auth' | 'db' | 'hash' | 'email';
type Operation = 'account' | 'pricing-read' | 'pricing-save' | 'setup' | 'devices' | 'printers';
type Sample = { dbQueries: number; durations: Partial<Record<Stage, number>> };
const context = new AsyncLocalStorage<Sample>();
export async function measureStage<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
  const sample = context.getStore(); if (!sample) return work();
  const start = performance.now(); if (stage === 'db') sample.dbQueries++;
  try { return await work(); } finally { sample.durations[stage] = (sample.durations[stage] ?? 0) + performance.now() - start; }
}
export async function withRequestPerformance(operation: Operation, work: () => Promise<Response>): Promise<Response> {
  const sample: Sample = { dbQueries: 0, durations: {} }; const start = performance.now();
  return context.run(sample, async () => {
    let response:Response;
    try { response=await work(); } catch(error) { logAccountFailure('handler',error); response=Response.json({error:'This request could not be completed. Please try again.'},{status:500}); }
    const totalMs = Math.round(performance.now() - start);
    const timing = [`app;dur=${totalMs}`, ...Object.entries(sample.durations).map(([key, ms]) => `${key};dur=${ms.toFixed(1)}`), `db_queries;desc="${sample.dbQueries}"`];
    const headers=new Headers(response.headers);headers.set('Server-Timing',timing.join(', '));
    if (process.env.PRINTOS_PERFORMANCE_DIAGNOSTICS === 'enabled') console.info(JSON.stringify({ event: 'request_performance', operation, totalMs, dbQueries: sample.dbQueries, durationsMs: Object.fromEntries(Object.entries(sample.durations).map(([key, ms]) => [key, Math.round(ms)])) }));
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  });
}
