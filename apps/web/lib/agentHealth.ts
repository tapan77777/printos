export const HEALTH_TTL_MS = 45000;
export function effectiveHealth(lastHeartbeat: Date | null, printerAvailable: boolean | null, now = Date.now()) {
  const online = !!lastHeartbeat && lastHeartbeat.getTime() <= now && now - lastHeartbeat.getTime() <= HEALTH_TTL_MS;
  return { online, printerAvailable: online ? printerAvailable : null };
}
