import {it,expect,vi} from 'vitest';
import {assertOrderingEnabled} from '../lib/ordering';
import {authoritativeQuote} from '../lib/shopPricing';
it('blocks missing, disabled and malformed settings, even when bypassing the customer page',async()=>{
 for(const metadata of [null,'{}','broken','{"printos":{"orderingEnabled":false}}']){
  const db={organization:{findUnique:async()=>({metadata})}} as any;await expect(assertOrderingEnabled(db,'a')).rejects.toMatchObject({status:409});
 }await expect(assertOrderingEnabled({} as any,null)).rejects.toMatchObject({status:409});
});
it('rechecks ordering under the shop lock before reading rates or accepting an order',async()=>{
 const calls:string[]=[];const db={$queryRaw:async()=>{calls.push('lock');},organization:{findUnique:async()=>{calls.push('gate');return{metadata:'{}'};}},shopRateCard:{findFirst:vi.fn()}};
 await expect(authoritativeQuote(db as any,{id:'p',shopId:'a'},{options:{} as any,quote:{pageCount:1},bytes:Buffer.from('fixture')})).rejects.toMatchObject({status:409});expect(calls).toEqual(['lock','gate']);expect(db.shopRateCard.findFirst).not.toHaveBeenCalled();
});
