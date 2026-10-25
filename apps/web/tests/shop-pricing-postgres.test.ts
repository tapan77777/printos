import { it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { authoritativeQuote } from '../lib/shopPricing';
const owner = vi.hoisted(() => ({ value: null as any }));
vi.mock('@/lib/session', () => ({ getOwnerFromRequest: async () => owner.value }));
const target = process.env.PRINTOS_DISPOSABLE_DATABASE;
it.skipIf(!target)('real database scoped rate publishing, quote locking, snapshots and legacy preservation', async () => {
    const url = new URL(target!);
    if (url.hostname !== 'localhost' || !url.searchParams.get('host')?.includes('printos-tenant-pg-'))
        throw Error('Private fixture cluster required');
    const db = new PrismaClient({ datasources: { db: { url: target! } } });
    try {
        const a = 'rates-a', b = 'rates-b';
        await db.organization.createMany({ data: [{ id: a, name: 'Rates A', slug: a, metadata: '{"printos":{"orderingEnabled":true}}' }, { id: b, name: 'Rates B', slug: b, metadata: '{"printos":{"orderingEnabled":true}}' }] });
        await db.printer.createMany({ data: [{ id: 'rates-pa', name: 'A', deviceId: 'RATES-A', shopId: a }, { id: 'rates-pb', name: 'B', deviceId: 'RATES-B', shopId: b }, { id: 'rates-old', name: 'Legacy', deviceId: 'RATES-OLD' }] });
        const legacy = await db.printJob.create({ data: { id: 'rates-legacy', printerId: 'rates-old', fileId: 'fixture.pdf', customerSessionId: 'fixture', price: 12345 } });
        const api = await import('../app/api/admin/pricing/route');
        const rules = [{ paperSize: 'A4', colorMode: 'BW', duplex: true, basis: 'SHEET', unitPaise: 175 }];
        const request = (data: any) => new NextRequest('http://localhost:3999/api/admin/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        owner.value = null;
        expect((await api.GET(new NextRequest('http://localhost:3999/api/admin/pricing'))).status).toBe(401);
        owner.value = { shopId: a, role: 'staff' };
        expect((await api.POST(request({ rules, minimumPaise: 0 }))).status).toBe(403);
        owner.value = { shopId: a, role: 'owner' };
        const first = await api.POST(request({ rules, minimumPaise: 0, shopId: b }));
        expect(first.status).toBe(200);
        const v1 = (await first.json()).card;
        expect(v1.shopId).toBe(a);
        expect(await db.shopRateCard.count({ where: { shopId: b } })).toBe(0);
        const input = { options: { copies: 3, colorMode: 'BW' as const, paperSize: 'A4' as const, duplex: true, pageRange: '1-3' }, quote: { pageCount: 7 }, bytes: Buffer.from('fixture') };
        const pa = await db.printer.findUniqueOrThrow({ where: { id: 'rates-pa' } }), pb = await db.printer.findUniqueOrThrow({ where: { id: 'rates-pb' } });
        await expect(db.$transaction(tx => authoritativeQuote(tx, pb, input))).rejects.toThrow('not configured');
        const q = await db.$transaction(tx => authoritativeQuote(tx, pa, input));
        expect(q.price).toBe(1050);
        const saved = await db.printJob.create({ data: { id: 'rates-snapshot', printerId: pa.id, shopId: a, fileId: 'fixture.pdf', customerSessionId: 'fixture', copies: 3, duplex: true, pageRange: '1-3', pageCount: 7, price: q.price, pricingSnapshot: q.pricingSnapshot! } });
        const edited = { rules: [{ ...rules[0], unitPaise: 999 }], minimumPaise: 0, expectedVersion: v1.id };
        const edits = await Promise.all([api.POST(request(edited)), api.POST(request(edited))]);
        expect(edits.map(r => r.status).sort()).toEqual([200, 409]);
        const q2 = await db.$transaction(tx => authoritativeQuote(tx, pa, input));
        expect(q2.quoteKey).not.toBe(q.quoteKey);
        expect(q2.price).toBe(5994);
        expect((await db.printJob.findUniqueOrThrow({ where: { id: saved.id } })).price).toBe(1050);
        await expect(db.printJob.update({ where: { id: saved.id }, data: { price: 1 } })).rejects.toThrow();
        await expect(db.printJob.update({ where: { id: saved.id }, data: { pricingSnapshot: { tampered: true } } })).rejects.toThrow();
        await expect(db.shopRateCard.update({ where: { id: v1.id }, data: { minimumPaise: 1 } })).rejects.toThrow();
        expect(await db.printJob.findUnique({ where: { id: legacy.id } })).toEqual(legacy);
        owner.value = { shopId: b, role: 'owner' };
        expect((await (await api.GET(new NextRequest('http://localhost:3999/api/admin/pricing?shopId=' + a))).json()).card).toBeNull();
    }
    finally {
        await db.$disconnect();
    }
}, 30000);
