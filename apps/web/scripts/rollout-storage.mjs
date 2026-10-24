// Read-only verification of the administrator-provisioned Storage boundary.
export function assertStorageReady(state) {
 const b=state.bucket;
 if(!b||b.id!=='printos-documents'||b.name!=='printos-documents'||b.public!==false||String(b.file_size_limit)!=='26214400'||JSON.stringify(b.allowed_mime_types)!==JSON.stringify(['application/pdf']))throw Error('Storage bucket settings differ from reviewed private PDF bucket');
 if(state.rls!==true)throw Error('Storage objects RLS must be enabled');
 const p=state.policy;
 const expression=s=>typeof s==='string'&&["(bucket_id <> 'printos-documents'::text)","bucket_id <> 'printos-documents'::text","(bucket_id <> 'printos-documents')","bucket_id <> 'printos-documents'"].includes(s.trim());
 if(!p||p.policyname!=='printos_documents_client_deny'||p.permissive!=='RESTRICTIVE'||p.cmd!=='ALL'||JSON.stringify([...p.roles].sort())!==JSON.stringify(['anon','authenticated'])||!expression(p.qual)||!expression(p.with_check))throw Error('Storage restrictive policy differs from reviewed client deny policy');
 return state;
}
export async function inspectStorage(db) {
 const buckets=await db.$queryRawUnsafe("SELECT id,name,public,file_size_limit::text AS file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='printos-documents'");
 const policies=await db.$queryRawUnsafe("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='printos_documents_client_deny'");
 const rls=await db.$queryRawUnsafe("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects'");
 return {bucket:buckets[0]??null,policy:policies[0]??null,rls:rls[0]?.relrowsecurity===true};
}
