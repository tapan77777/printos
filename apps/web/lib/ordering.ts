import type { Prisma } from '@prisma/client';
import { setupSettings } from './shopSetupState';
import { UploadError } from './uploadQuote';
type DB = Pick<Prisma.TransactionClient, 'organization'>;
export async function assertOrderingEnabled(db: DB, shopId: string | null) {
  if (!shopId) throw new UploadError('This shop is not accepting orders yet.', 409);
  const shop = await db.organization.findUnique({ where: { id: shopId }, select: { metadata: true } });
  if (!shop || !setupSettings(shop.metadata).orderingEnabled) throw new UploadError('This shop is not accepting orders yet. Please ask at the counter.', 409);
}
