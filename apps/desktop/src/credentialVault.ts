import {mkdir,readFile,open,rename,unlink} from "node:fs/promises";
import path from "node:path";import {randomUUID,createPrivateKey,createPublicKey} from "node:crypto";
export type StoredCredential={deviceId:string;token:string;shopId:string;printerDeviceId:string;mode:string;expiresAt:string;confirmed:boolean};
export type PairingVault={version:1;origin:string;privateKey:string;publicKey:string;pending?:{id:string;nonce:string;code:string;expiresAt:string};credential?:StoredCredential};
export interface ProtectedStorage{available():Promise<boolean>;encrypt(value:string):Promise<Buffer>;decrypt(value:Buffer):Promise<string>;}
export class CredentialVault{
 constructor(private file:string,private storage:ProtectedStorage){}
 private async available(){if(!await this.storage.available())throw Error("OS_PROTECTED_STORAGE_UNAVAILABLE");}
 async load():Promise<PairingVault|null>{
  let bytes:Buffer;try{bytes=await readFile(this.file);}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw Error("DEVICE_VAULT_UNAVAILABLE");}
  await this.available();
  if(bytes.length>32768)throw Error("DEVICE_VAULT_INVALID");
  try{const record=JSON.parse(await this.storage.decrypt(bytes)) as PairingVault;
   if(record.version!==1||typeof record.origin!=="string"||!record.privateKey||!record.publicKey)throw Error();
   const pub=createPublicKey(createPrivateKey(record.privateKey)).export({type:"spki",format:"der"}).toString("base64");if(pub!==record.publicKey)throw Error();
   if(record.credential&&(!/^pda_[A-Za-z0-9_-]{43}$/.test(record.credential.token)||typeof record.credential.confirmed!=="boolean"||!Number.isFinite(Date.parse(record.credential.expiresAt))))throw Error();
   return record;
  }catch{throw Error("DEVICE_VAULT_INVALID");}
 }
 async remove(){await unlink(this.file).catch(e=>{if(e.code!=="ENOENT")throw Error("DEVICE_VAULT_UNAVAILABLE");});}
 async save(record:PairingVault){
  await this.available();const encrypted=await this.storage.encrypt(JSON.stringify(record));const directory=path.dirname(this.file);await mkdir(directory,{recursive:true,mode:0o700});const temp=path.join(directory,`.vault-${randomUUID()}`);
  const handle=await open(temp,"wx",0o600);try{await handle.writeFile(encrypted);await handle.sync();}finally{await handle.close();}
  try{await rename(temp,this.file);if(process.platform!=="win32"){const dir=await open(directory,"r");try{await dir.sync();}finally{await dir.close();}}}finally{await unlink(temp).catch(()=>{});}
 }
}
