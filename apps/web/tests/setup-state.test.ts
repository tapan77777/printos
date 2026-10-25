import {it,expect} from 'vitest';
import {setupSettings,setupMetadata,shopIdentifier,hasProtectedSetupMetadata} from '../lib/shopSetupState';
it.each([null,undefined,'bad','[]','null','{}','{"printos":{"orderingEnabled":"true"}}'])('fails closed for missing or invalid ordering state %s',metadata=>{expect(setupSettings(metadata).orderingEnabled).toBe(false);});
it('preserves unrelated metadata while only explicitly enabling ordering',()=>{
 const qr=setupMetadata('{"other":"kept"}',{intakePrinterId:'cloud'});expect(setupSettings(qr)).toEqual({orderingEnabled:false,intakePrinterId:'cloud'});
 const enabled=setupMetadata(qr,{orderingEnabled:true});expect(JSON.parse(enabled).other).toBe('kept');expect(setupSettings(enabled).orderingEnabled).toBe(true);
});
it.each(['A','!!!','मेरा प्रिंट','Café Prints','Shop '.repeat(80)])('creates valid bounded automatic identifiers for %s',name=>{
 const a=shopIdentifier(name,'123abc'),b=shopIdentifier(name,'456def');expect(a).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);expect(a.length).toBeGreaterThanOrEqual(3);expect(a.length).toBeLessThanOrEqual(60);expect(a).not.toBe(b);
});
it('recognizes protected metadata supplied as objects or serialized JSON',()=>{expect(hasProtectedSetupMetadata({printos:{orderingEnabled:true}})).toBe(true);expect(hasProtectedSetupMetadata('{"printos":null}')).toBe(true);expect(hasProtectedSetupMetadata({unrelated:true})).toBe(false);});
