import {it,expect,vi} from 'vitest';
import {updateSetup} from '../lib/setupService';
import {setupSettings} from '../lib/shopSetupState';
function fixture(){let metadata:string|null=null;const printers:any[]=[];let prices=true;
 const tx={$queryRaw:vi.fn(),organization:{findUnique:async(args:any)=>args.select.rateCards?{name:'Fixture shop',metadata,rateCards:prices?[{id:'r',rules:[],minimumPaise:0}]:[],printers}: {name:'Fixture shop',metadata},update:vi.fn(async(args:any)=>{metadata=args.data.metadata;return{};})},shopRateCard:{findFirst:async()=>prices?{id:'r'}:null},printer:{findFirst:async(args:any)=>printers.find(p=>p.id===args.where.id)??null,create:vi.fn(async(args:any)=>{const p={id:'intake',...args.data};printers.push(p);return p;})}};
 const db={...tx,$transaction:async(fn:any)=>fn(tx)};
 return{db:db as any,tx,settings:()=>setupSettings(metadata),noPrices:()=>{prices=false;}};
}
it('generates one persistent intake identity without enabling orders or a physical device',async()=>{
 const f=fixture();await updateSetup(f.db,'a','qr',undefined);await updateSetup(f.db,'a','qr',undefined);
 expect(f.tx.printer.create).toHaveBeenCalledOnce();expect(f.settings()).toEqual({orderingEnabled:false,intakePrinterId:'intake'});
 expect(f.tx.printer.create.mock.calls[0][0].data).toMatchObject({shopId:'a'});
 expect(f.tx.printer.create.mock.calls[0][0].data).not.toHaveProperty('processingEnabled');
});
it('requires saved prices and a QR before explicit enabling, and permits explicit disabling',async()=>{
 const f=fixture();await expect(updateSetup(f.db,'a','ordering',true)).rejects.toMatchObject({status:409});await updateSetup(f.db,'a','qr',undefined);await updateSetup(f.db,'a','ordering',true);expect(f.settings().orderingEnabled).toBe(true);f.noPrices();await updateSetup(f.db,'a','ordering',false);expect(f.settings().orderingEnabled).toBe(false);
 const empty=fixture();empty.noPrices();await expect(updateSetup(empty.db,'a','qr',undefined)).rejects.toMatchObject({status:409});expect(empty.tx.printer.create).not.toHaveBeenCalled();
});
it('rejects malformed actions and implicit truthy enables',async()=>{const f=fixture();for(const action of [null,'enable','printer'])await expect(updateSetup(f.db,'a',action,true)).rejects.toMatchObject({status:400});await expect(updateSetup(f.db,'a','ordering','true')).rejects.toMatchObject({status:400});});
