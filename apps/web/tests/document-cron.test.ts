import {it,expect,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
const reads=vi.hoisted(()=>vi.fn());vi.mock('@/lib/prisma',()=>({prisma:{storedDocument:{findMany:reads}}}));
import {GET} from '../app/api/internal/documents/retention/route';
afterEach(()=>vi.unstubAllEnvs());
it('scheduled deletion fails closed without explicit activation and a private token',async()=>{vi.stubEnv('PRINTOS_DOCUMENT_CLEANUP','disabled');expect((await GET(new NextRequest('https://fixture.invalid/api/internal/documents/retention'))).status).toBe(503);vi.stubEnv('PRINTOS_DOCUMENT_CLEANUP','enabled');vi.stubEnv('CRON_SECRET','fixture-only-secret-'.repeat(3));expect((await GET(new NextRequest('https://fixture.invalid/api/internal/documents/retention',{headers:{authorization:'Bearer guessed'}}))).status).toBe(401);expect(reads).not.toHaveBeenCalled();});
