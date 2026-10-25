import {it,expect,vi} from 'vitest';
import {documentService,documentHash} from '../lib/documents';
it('denies cloud upload grants, finalization and quote-byte reads while ordering is inactive',async()=>{
 const token='pdu_'+'A'.repeat(43);const storage={namespace:'fixture',check:vi.fn(),read:vi.fn(),put:vi.fn(),uploadGrant:vi.fn()};
 const db={printer:{findUnique:async()=>({id:'p',shopId:'a'})},organization:{findUnique:async()=>({metadata:'{}'})},storedDocument:{findUnique:async()=>({id:'doc',shopId:'a',tokenHash:documentHash(token),storageNamespace:'fixture',expiresAt:new Date(Date.now()+60000),jobId:null,status:'UPLOADING'})},$transaction:vi.fn()};
 const service=documentService(db as any,storage as any);
 await expect(service.begin('p',100)).rejects.toMatchObject({status:409});await expect(service.finalize('doc',token)).rejects.toMatchObject({status:409});await expect(service.upload('doc',token,'p',new FormData())).rejects.toMatchObject({status:409});
 expect(storage.uploadGrant).not.toHaveBeenCalled();expect(storage.read).not.toHaveBeenCalled();expect(storage.put).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();
});
