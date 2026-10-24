import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getOwnerFromRequest } from '@/lib/session';
import { validateRateCard } from '@/lib/shopPricing';
import { accountRequest } from '@/lib/authBody';
import { UploadError } from '@/lib/uploadQuote';
export async function GET(req: NextRequest) { const owner = await getOwnerFromRequest(req); if (!owner?.shopId)
    return NextResponse.json({ error: 'Shop membership required' }, { status: 401 }); const card = await prisma.shopRateCard.findFirst({ where: { shopId: owner.shopId! }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); return NextResponse.json({ card, canEdit: owner.role === 'owner' }, { headers: { 'Cache-Control': 'private, no-store' } }); }
export async function POST(req: NextRequest) {
    const owner = await getOwnerFromRequest(req);
    if (!owner?.shopId)
        return NextResponse.json({ error: 'Shop membership required' }, { status: 401 });
    if (owner.role !== 'owner')
        return NextResponse.json({ error: 'Owner role required' }, { status: 403 });
    const bounded = await accountRequest(req);
    if (bounded instanceof Response)
        return bounded;
    try {
        const body = await bounded.json();
        const value = validateRateCard(body);
        const card = await prisma.$transaction(async (tx) => { await tx.$queryRaw `SELECT id FROM "Shop" WHERE id=${owner.shopId} FOR UPDATE`; const current = await tx.shopRateCard.findFirst({ where: { shopId: owner.shopId! }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); if ((body.expectedVersion ?? null) !== (current?.id ?? null))
            throw new UploadError('Rates changed in another window. Reload before saving.', 409); return tx.shopRateCard.create({ data: { id: randomUUID(), shopId: owner.shopId!, ...value, createdAt: new Date(Math.max(Date.now(), (current?.createdAt.getTime() ?? 0) + 1)) } }); });
        return NextResponse.json({ card });
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof UploadError ? e.message : 'Unable to save rates' }, { status: e instanceof UploadError ? e.status : 400 });
    }
}
