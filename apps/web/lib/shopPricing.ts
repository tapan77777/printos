import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { resolvePageRange, createQuote } from './pricing';
import { ALLOWED_PAPER_SIZES, MAX_COPIES, type UploadOptions } from './validate';
import { UploadError } from './uploadQuote';
export type RateRule = {
    paperSize: string;
    colorMode: 'BW' | 'COLOUR';
    duplex: boolean;
    basis: 'PAGE' | 'SHEET';
    unitPaise: number;
};
export function validateRateCard(input: unknown): {
    rules: RateRule[];
    minimumPaise: number;
} {
    const b = input as any;
    if (!b || !Array.isArray(b.rules) || !b.rules.length || b.rules.length > 32 || !Number.isSafeInteger(b.minimumPaise) || b.minimumPaise < 0 || b.minimumPaise > 2147483647)
        throw new UploadError('Provide supported combinations and an integer minimum in paise');
    const seen = new Set();
    const rules = b.rules.map((r: any) => { if (!r || !ALLOWED_PAPER_SIZES.includes(r.paperSize) || !['BW', 'COLOUR'].includes(r.colorMode) || typeof r.duplex !== 'boolean' || !['PAGE', 'SHEET'].includes(r.basis) || !Number.isSafeInteger(r.unitPaise) || r.unitPaise < 0 || r.unitPaise > 2147483647)
        throw new UploadError('Invalid rate: use integer paise and a supported paper, colour, duplex and billing basis'); const key = [r.paperSize, r.colorMode, r.duplex].join(':'); if (seen.has(key))
        throw new UploadError('Duplicate pricing combination'); seen.add(key); return { paperSize: r.paperSize, colorMode: r.colorMode, duplex: r.duplex, basis: r.basis, unitPaise: r.unitPaise } as RateRule; });
    return { rules, minimumPaise: b.minimumPaise };
}
export function calculateShopQuote(card: {
    id: string;
    shopId: string;
    rules: unknown;
    minimumPaise: number;
}, options: UploadOptions, pageCount: number) {
    const { rules, minimumPaise } = validateRateCard(card);
    if (!Number.isInteger(options.copies) || options.copies < 1 || options.copies > MAX_COPIES)
        throw new UploadError('Invalid copies');
    const selection = resolvePageRange(options.pageRange, pageCount);
    const rule = rules.find(r => r.paperSize === options.paperSize && r.colorMode === options.colorMode && r.duplex === options.duplex);
    if (!rule)
        throw new UploadError('This shop does not offer the selected printing combination', 422);
    const unitsPerCopy = rule.basis === 'SHEET' && options.duplex ? Math.ceil(selection.selectedPages / 2) : selection.selectedPages;
    const units = unitsPerCopy * options.copies;
    const subtotalPaise = units * rule.unitPaise;
    const price = Math.max(minimumPaise, subtotalPaise);
    if (!Number.isSafeInteger(price) || price > 2147483647)
        throw new UploadError('Quote exceeds supported amount');
    return { schemaVersion: 1, currency: 'INR', rateCardId: card.id, shopId: card.shopId, pageCount, ...selection, copies: options.copies, paperSize: options.paperSize, colorMode: options.colorMode, duplex: options.duplex, basis: rule.basis, unitPaise: rule.unitPaise, units, subtotalPaise, minimumPaise, price };
}
type DB = Prisma.TransactionClient;
export async function authoritativeQuote(db: DB, printer: {
    shopId: string | null;
    id: string;
}, upload: {
    options: UploadOptions;
    quote: {
        pageCount: number;
    };
    bytes: Buffer;
}) {
    if (!printer.shopId) {
        const legacy = createQuote(upload.options, upload.quote.pageCount);
        const snapshot = { schemaVersion: 1, currency: 'INR', source: 'LEGACY_DEFAULT_SCHEDULE', shopId: null, ...upload.options, ...legacy, basis: 'PAGE', unitPaise: legacy.perPagePaise, units: legacy.selectedPages * legacy.copies, minimumPaise: 0 };
        return { ...legacy, quoteKey: null, pricingSnapshot: snapshot };
    }
    // Rate edits and submissions lock the same shop row, preventing a stale-rate race.
    await db.$queryRaw `SELECT id FROM "Shop" WHERE id=${printer.shopId} FOR UPDATE`;
    const card = await db.shopRateCard.findFirst({ where: { shopId: printer.shopId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (!card)
        throw new UploadError('This shop has not configured printing prices', 422);
    const snapshot = calculateShopQuote(card, upload.options, upload.quote.pageCount);
    const quoteKey = createHash('sha256').update(JSON.stringify({ printerId: printer.id, snapshot })).update(upload.bytes).digest('hex');
    return { ...snapshot, quoteKey, pricingSnapshot: snapshot };
}
