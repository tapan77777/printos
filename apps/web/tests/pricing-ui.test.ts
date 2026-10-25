import {createElement} from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi,afterEach} from 'vitest';
import {PricingEditor} from '../app/dashboard/pricing/PricingEditor';
afterEach(()=>vi.unstubAllGlobals());
it('loads saved state without another GET and saves integer paise only after acknowledgement',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({card:{id:'v1',minimumPaise:0,rules:[{paperSize:'A4',colorMode:'BW',duplex:false,basis:'PAGE',unitPaise:200}]}})});vi.stubGlobal('fetch',fetch);
 const view=create(createElement(PricingEditor,{initialCard:null,canEdit:true}));expect(fetch).not.toHaveBeenCalled();
 await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({minimumPaise:0,expectedVersion:null,rules:[{unitPaise:200}]});expect(JSON.stringify(view.toJSON())).toContain('Prices saved');view.unmount();
});
it('keeps staff controls disabled',()=>{const view=create(createElement(PricingEditor,{initialCard:null,canEdit:false}));expect(view.root.findByType('fieldset').props.disabled).toBe(true);view.unmount();});
it('retains draft data and a retryable error when saving fails',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('Offline')));const view=create(createElement(PricingEditor,{initialCard:null,canEdit:true}));await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(view.root.findByProps({role:'alert'}).children).toContain('Offline');expect(view.root.findByType('fieldset').props.disabled).toBe(false);view.unmount();
});
it('prevents two submissions in the same event turn',async()=>{
 let finish!:(value:unknown)=>void;const fetch=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetch);const view=create(createElement(PricingEditor,{initialCard:null,canEdit:true}));let pending!:Promise<void>;
 await act(async()=>{const submit=view.root.findByType('form').props.onSubmit;pending=submit({preventDefault(){}});void submit({preventDefault(){}});});expect(fetch).toHaveBeenCalledOnce();await act(async()=>{finish({ok:true,json:async()=>({card:{id:'v1'}})});await pending;});view.unmount();
});
