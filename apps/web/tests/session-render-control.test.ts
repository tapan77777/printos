import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({signal:new Error('fixture Next render-control signal')}));
vi.mock('next/headers',()=>({headers:async()=>{throw m.signal;}}));
import {getOwnerFromCookies} from '../lib/session';
it('preserves Next render-control exceptions from request headers',async()=>{await expect(getOwnerFromCookies()).rejects.toBe(m.signal);});
