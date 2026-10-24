import type {PrivateStorage} from '../../lib/privateStorage';
import {StorageError} from '../../lib/privateStorage';
export class FixtureStorage implements PrivateStorage {
 readonly namespace='isolated-fixture-storage';
 objects=new Map<string,Buffer>();operations:{op:string;keys:string[]}[]=[];failDelete=false;
 async check(){this.operations.push({op:'check',keys:[]});}
 async uploadGrant(key:string){this.operations.push({op:'grant',keys:[key]});return 'https://fixture.invalid/upload';}
 async read(key:string,max:number){this.operations.push({op:'read',keys:[key]});const b=this.objects.get(key);if(!b)throw new StorageError(404);if(b.length>max)throw new StorageError(413);return Buffer.from(b);}
 async put(key:string,b:Buffer){if(this.objects.has(key))throw new StorageError(409);this.operations.push({op:'put',keys:[key]});this.objects.set(key,Buffer.from(b));}
 async sign(key:string,download:boolean){this.operations.push({op:'sign',keys:[key]});return 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/printos-documents/'+key+'?token=fixture'+(download?'&download=document.pdf':'');}
 async remove(keys:string[]){this.operations.push({op:'remove',keys});if(this.failDelete)throw new StorageError();for(const key of keys)this.objects.delete(key);}
}
