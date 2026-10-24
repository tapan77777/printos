export const dashboardPaths = ["/login", "/register", "/recover", "/reset-password", "/shops", "/dashboard", "/dashboard/jobs", "/dashboard/reports", "/dashboard/devices", "/dashboard/pricing"] as const;
export function cloudOrigin(input: unknown, packaged: boolean): string {
  if (typeof input !== "string" || input.length > 2048) throw Error("Enter your PrintOS cloud address.");
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error("Use the cloud origin only, without a path or credentials.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback && !packaged)) throw Error("HTTPS is required for the cloud dashboard.");
  if (packaged && (loopback || url.hostname.endsWith(".localhost"))) throw Error("Packaged apps require a hosted cloud backend.");
  return url.origin;
}
export function allowNavigation(raw: string, origin: string): boolean {
  try {
    const u = new URL(raw);
    return u.origin === origin && !u.username && !u.password && (
      dashboardPaths.some(p => u.pathname === p) ||
      /^\/api\/jobs\/[A-Za-z0-9-]{1,80}\/file$/.test(u.pathname) ||
      /^\/p\/[A-Za-z0-9_-]{1,128}$/.test(u.pathname));
  } catch { return false; }
}
export type LocalConfig = { version: 1; origin?: string; printer?: {name: string; identifier: string} };
export function validateConfig(value: unknown, packaged: boolean): LocalConfig {
  const c = value as LocalConfig;
  if (!c || c.version !== 1) throw Error("Local setup needs review.");
  const origin = c.origin === undefined ? undefined : cloudOrigin(c.origin, packaged);
  let printer: LocalConfig["printer"];
  if (c.printer !== undefined) {
    const p = c.printer;
    if (!p || typeof p.name !== "string" || !p.name || p.name.length > 512 || /[\x00-\x1f]/.test(p.name) || !/^[a-f0-9]{64}$/.test(p.identifier)) throw Error("Select a discovered printer.");
    printer = {name:p.name,identifier:p.identifier};
  }
  return {version:1,origin,printer};
}
export function validLocalSender(senderId: number, expectedId: number, frameUrl: string, expectedUrl: string, mainFrame: boolean) {
  return senderId === expectedId && mainFrame && frameUrl === expectedUrl;
}

/** A single server-authorized PDF grant, never a general remote navigation permission. */
export function privateDocumentGrant(value:unknown,now=Date.now()):string {
 const m=value as {url?:unknown;sha256?:unknown;sizeBytes?:unknown;expiresAt?:unknown};
 if(!m||typeof m.url!=='string'||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isInteger(m.sizeBytes)||Number(m.sizeBytes)<1||Number(m.sizeBytes)>25*1024*1024||typeof m.expiresAt!=='string'||!Number.isFinite(Date.parse(m.expiresAt))||Date.parse(m.expiresAt)<=now||Date.parse(m.expiresAt)>now+65000)throw Error('Invalid document grant');
 const u=new URL(m.url);if(u.protocol!=='https:'||u.username||u.password||u.hash||!/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)||!/^\/storage\/v1\/object\/sign\/[a-z0-9-]+\/objects\/[a-f0-9]{64}\/[a-f0-9-]{36}\.pdf$/.test(u.pathname)||!u.searchParams.get('token'))throw Error('Invalid document grant');return u.toString();
}
export function privatePreviewRequest(raw:string,method:string,grant:string){
 if(!['GET','HEAD'].includes(method))return false;
 if(raw===grant)return true;
 try{const u=new URL(raw);return (u.protocol==='chrome-extension:'&&u.hostname==='mhjfbmdgcfjbbpaeojofohoefgiehjai')||(u.protocol==='chrome:'&&['resources','theme'].includes(u.hostname));}catch{return false;}
}
