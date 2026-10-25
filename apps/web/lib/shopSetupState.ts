/** Protected settings share existing Shop.metadata; absent/malformed state is inactive. */
export type SetupSettings = { orderingEnabled: boolean; intakePrinterId: string | null };
export function metadataObject(value: string | null | undefined): Record<string, unknown> {
  try { const parsed = JSON.parse(value ?? '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
export function setupSettings(metadata: string | null | undefined): SetupSettings {
  const value = metadataObject(metadata).printos;
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { orderingEnabled: state.orderingEnabled === true, intakePrinterId: typeof state.intakePrinterId === 'string' ? state.intakePrinterId : null };
}
export function setupMetadata(metadata: string | null | undefined, patch: Partial<SetupSettings>) {
  return JSON.stringify({ ...metadataObject(metadata), printos: { ...setupSettings(metadata), ...patch } });
}
export function hasProtectedSetupMetadata(metadata: unknown) {
  if (metadata && typeof metadata === 'object') return Object.hasOwn(metadata, 'printos');
  if (typeof metadata === 'string') return Object.hasOwn(metadataObject(metadata), 'printos');
  return false;
}
export function shopIdentifier(name: string, suffix: string) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'shop';
  return `${base}-${suffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'shop'}`;
}
