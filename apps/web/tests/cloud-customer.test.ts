import {createElement,type ReactNode} from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi,afterEach} from 'vitest';
import CustomerPrinter from '../app/p/[printerId]/CustomerPrinter';
vi.mock('next/link',()=>({default:({children,...p}:{children:ReactNode;href:string})=>createElement('a',p,children)}));
afterEach(()=>vi.unstubAllGlobals());
it('uploads once directly, quotes options with JSON, and never sends storage credentials',async()=>{
 const token='pdu_'+'a'.repeat(43);const url='https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/upload/sign/printos-documents/uploads/'+'a'.repeat(64)+'/b3714b56-8541-4a1b-8ae5-cd8f3d53e9bd.pdf?token=fixture';
 const fetch=vi.fn().mockImplementation(async(path:string,init:any)=>{if(path==='/api/documents')return Response.json({documentId:'fixture-doc',documentToken:token,uploadUrl:url});if(path===url){expect(init.headers.Authorization).toBeUndefined();expect(init.credentials).toBe('omit');return Response.json({});}if(path.endsWith('/finalize'))return Response.json({pageCount:5});if(path==='/api/quotes'){expect(init.body).not.toBeInstanceOf(FormData);const b=JSON.parse(init.body);expect(b.file).toBeUndefined();expect(b.documentId).toBe('fixture-doc');expect(init.headers['x-printos-document-token']).toBe(token);return Response.json({price:233*b.copies,pageCount:5,selectedPages:5,unitPaise:233,copies:b.copies,pageRange:'all',quoteKey:'fixture-quote'});}throw Error('Unexpected mock request');});vi.stubGlobal('fetch',fetch);
 let view!:ReturnType<typeof create>;await act(async()=>{view=create(createElement(CustomerPrinter,{params:{printerId:'DOC-A'},cloudStorage:true}));});
 await act(async()=>{view.root.findByProps({type:'file'}).props.onChange({target:{files:[new File(['fixture'],'test.pdf',{type:'application/pdf'})]}});});
 expect(fetch.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);expect(JSON.stringify(view.toJSON())).toContain('₹2.33');
 await act(async()=>{view.root.findAllByType('button').find(b=>b.props['aria-label']==='Increase copies')!.props.onClick();});expect(fetch.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);expect(fetch.mock.calls.filter(c=>c[0]==='/api/quotes')).toHaveLength(2);expect(JSON.stringify(view.toJSON())).toContain('₹4.66');view.unmount();
});
