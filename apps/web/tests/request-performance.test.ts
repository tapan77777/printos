import {it,expect,vi,afterEach} from 'vitest';
import {measureStage,withRequestPerformance} from '../lib/requestPerformance';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('keeps request timing contexts separate and logs only fixed labels/counts/durations',async()=>{
 vi.stubEnv('PRINTOS_PERFORMANCE_DIAGNOSTICS','enabled');const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 const [one,two]=await Promise.all([withRequestPerformance('account',async()=>{await measureStage('db',async()=>{});return Response.json({secret:'not-in-log'});}),withRequestPerformance('setup',async()=>Response.json({user:'not-in-log'}))]);
 expect(one.headers.get('Server-Timing')).toContain('db_queries;desc="1"');expect(two.headers.get('Server-Timing')).toContain('db_queries;desc="0"');expect(JSON.stringify(log.mock.calls)).not.toContain('not-in-log');expect(log).toHaveBeenCalledTimes(2);
});
it('does not expose raw errors through diagnostics or HTTP responses',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});const response=await withRequestPerformance('setup',async()=>{throw Error('private-password fixture@example.test postgresql://private');});expect(response.status).toBe(500);expect(await response.text()).not.toContain('private');expect(JSON.stringify(log.mock.calls)).not.toContain('private');
});
it('preserves immutable redirects and separate authentication cookies',async()=>{
 const redirect=await withRequestPerformance('account',async()=>Response.redirect('https://example.test/shops',302));expect(redirect.status).toBe(302);expect(redirect.headers.get('Location')).toBe('https://example.test/shops');
 const headers=new Headers();headers.append('Set-Cookie','one=fixture; HttpOnly');headers.append('Set-Cookie','two=fixture; HttpOnly');const response=await withRequestPerformance('account',async()=>new Response('{}',{headers}));expect(response.headers.getSetCookie()).toHaveLength(2);
});
