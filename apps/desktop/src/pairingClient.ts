import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {CredentialVault,type PairingVault,type StoredCredential} from "./credentialVault";
export type PairRequest=(route:string,body?:unknown,credential?:StoredCredential)=>Promise<any>;
export class PairingFailure extends Error{constructor(message:string,public status?:number){super(message);}}
const message=(id:string,nonce:string,op:string)=>`PrintOS-pair-v1\n${id}\n${nonce}\n${op}`;
export class DesktopPairing{
 private busy=false;private checkedAt:string|null=null;
 constructor(private vault:CredentialVault,private origin:()=>string|undefined,private request:PairRequest){}
 private async exclusive<T>(fn:()=>Promise<T>){if(this.busy)throw new PairingFailure("A device connection operation is already running.");this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async summary(){
  try{const value=await this.vault.load();if(!value)return {state:"unpaired",printingEnabled:false};if(value.origin!==this.origin())return {state:value.credential||value.pending?"different-origin":"unpaired",printingEnabled:false};
   return {state:value.credential?(value.credential.confirmed?"credential-stored":"receipt-pending"):value.pending?"awaiting-approval":"unpaired",deviceId:value.credential?.deviceId,shopId:value.credential?.shopId,printerDeviceId:value.credential?.printerDeviceId,mode:value.credential?.mode,expiresAt:value.credential?.expiresAt,keyFingerprint:createHash("sha256").update(value.publicKey).digest("hex").slice(0,16),challengeId:value.pending?.id,code:value.pending?.code,challengeExpiresAt:value.pending?.expiresAt,lastValidatedAt:this.checkedAt,printingEnabled:false};
  }catch{return {state:"secure-storage-unavailable",printingEnabled:false};}
 }
 async credentials(){const value=await this.vault.load();if(!value?.credential?.confirmed||value.origin!==this.origin()||Date.parse(value.credential.expiresAt)<=Date.now())throw new PairingFailure('Confirmed, unexpired pairing required');return {origin:value.origin,credential:value.credential};}
 async deviceStatus(){const {credential}=await this.credentials();return this.request('/api/devices/self',undefined,credential);}
 async configure(input:unknown){const {credential}=await this.credentials();return this.request('/api/devices/configuration',input,credential);}
 async forgetRevoked(){return this.exclusive(async()=>{const value=await this.vault.load();if(!value)return this.summary();if(value.origin!==this.origin())throw new PairingFailure("Return to the original cloud before removing this pairing.");
  if(value.credential){let denied=false;try{await this.request("/api/devices/self",undefined,value.credential);}catch(e){if(e instanceof PairingFailure&&e.status===401)denied=true;else throw e;}if(!denied)throw new PairingFailure("Revoke this device in the owner dashboard before forgetting its local credential.");}
  else if(value.pending&&Date.parse(value.pending.expiresAt)>Date.now())throw new PairingFailure("Wait for the pending challenge to expire before starting a different identity.");
  await this.vault.remove();this.checkedAt=null;return this.summary();});}
 async begin(label:unknown,mode:unknown){return this.exclusive(async()=>{
  const origin=this.origin();if(!origin)throw new PairingFailure("Configure your cloud origin first.");
  if(typeof label!=="string"||!label.trim()||label.length>80||!["mock","windows"].includes(String(mode)))throw new PairingFailure("Choose a computer name and adapter mode.");
  const existing=await this.vault.load();if(existing?.credential)throw new PairingFailure("This computer already has a stored credential. Revoke it in the cloud before pairing another identity.");
  if(existing?.pending&&Date.parse(existing.pending.expiresAt)>Date.now())throw new PairingFailure("A pairing is already pending. Check its approval or wait for it to expire.");
  const keys=generateKeyPairSync("ed25519");const value:PairingVault={version:1,origin,privateKey:keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),publicKey:keys.publicKey.export({type:"spki",format:"der"}).toString("base64")};
  // Prove secure storage is usable BEFORE creating any cloud-side challenge.
  await this.vault.save(value);
  const result=await this.request("/api/devices/pairing",{label:label.trim(),mode,publicKey:value.publicKey});
  if(!/^[a-f0-9-]{36}$/i.test(result.id)||typeof result.nonce!=="string"||result.nonce.length>128||! /^[A-F0-9]{10}$/.test(result.code)||!Number.isFinite(Date.parse(result.expiresAt)))throw new PairingFailure("Invalid pairing acknowledgement. No credential was accepted.");
  value.pending={id:result.id,nonce:result.nonce,code:result.code,expiresAt:result.expiresAt};await this.vault.save(value);return this.summary();
 });}
 async check(){return this.exclusive(async()=>{
  const value=await this.vault.load();if(!value||value.origin!==this.origin())throw new PairingFailure("No pairing exists for this cloud origin.");
  if(value.credential){
   if(!value.credential.confirmed)await this.confirm(value);
   const status=await this.request("/api/devices/self",undefined,value.credential);if(status.deviceId!==value.credential.deviceId||status.shopId!==value.credential.shopId||status.printerDeviceId!==value.credential.printerDeviceId)throw new PairingFailure("Device scope acknowledgement did not match.");
   this.checkedAt=new Date().toISOString();return this.summary();
  }
  const pending=value.pending;if(!pending)throw new PairingFailure("Start a new pairing request.");
  if(Date.parse(pending.expiresAt)<=Date.now())throw new PairingFailure("Pairing expired. Start a fresh request.");
  const proof=(op:string)=>sign(null,Buffer.from(message(pending.id,pending.nonce,op)),value.privateKey).toString("base64");
  const status=await this.request(`/api/devices/pairing/${pending.id}/poll`,{signature:proof("poll")});if(status.approved!==true)return this.summary();
  // This redemption is never automatically retried. A lost response requires owner
  // inspection/revocation of the unconfirmed device, not recovering a plaintext token.
  const data=await this.request(`/api/devices/pairing/${pending.id}/consume`,{signature:proof("consume")});
  if(!/^pda_[A-Za-z0-9_-]{43}$/.test(data.token)||! /^[a-f0-9-]{36}$/i.test(data.deviceId)||typeof data.shopId!=="string"||typeof data.printerDeviceId!=="string"||!Number.isFinite(Date.parse(data.expiresAt))||data.confirmed!==false)throw new PairingFailure("Invalid device credential response. Review the cloud device before retrying setup.");
  value.credential={deviceId:data.deviceId,token:data.token,shopId:data.shopId,printerDeviceId:data.printerDeviceId,mode:data.mode,expiresAt:data.expiresAt,confirmed:false};value.pending=undefined;
  await this.vault.save(value); // Failure here means NO confirmation and no usable agent credential.
  await this.confirm(value);this.checkedAt=new Date().toISOString();return this.summary();
 });}
 private async confirm(value:PairingVault){
  const credential=value.credential!;const result=await this.request("/api/devices/confirm",{},credential);
  if(result.confirmed!==true||result.deviceId!==credential.deviceId||result.shopId!==credential.shopId||result.printerDeviceId!==credential.printerDeviceId||result.processingEnabled!==false)throw new PairingFailure("Device receipt acknowledgement did not match. Printing remains disabled.");
  credential.confirmed=true;await this.vault.save(value);
 }
}
