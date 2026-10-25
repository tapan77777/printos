'use client';
import {useRef,useState} from 'react';
import type {RateRule} from '@/lib/shopPricing';
export type PricingCard={id:string;rules:unknown;minimumPaise:number};
const newRule=():RateRule=>({paperSize:'A4',colorMode:'BW',duplex:false,basis:'PAGE',unitPaise:200});
export function PricingEditor({initialCard,canEdit,onSaved}:{initialCard:PricingCard|null;canEdit:boolean;onSaved?:(card:PricingCard)=>void}){
 const [rules,setRules]=useState<RateRule[]>(Array.isArray(initialCard?.rules)?initialCard.rules:[newRule()]);
 const [minimum,setMinimum]=useState(initialCard?.minimumPaise??0);const [version,setVersion]=useState(initialCard?.id??null);
 const [busy,setBusy]=useState(false);const lock=useRef(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 function update(i:number,patch:Partial<RateRule>){setRules(r=>r.map((value,n)=>n===i?{...value,...patch}:value));setNotice('');}
 async function submit(event:React.FormEvent){event.preventDefault();if(lock.current||!canEdit)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/admin/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules,minimumPaise:minimum,expectedVersion:version})});const data=await response.json();if(!response.ok)throw Error(data.error??'Your prices could not be saved.');setVersion(data.card.id);setNotice('Prices saved. Ordering stays as you set it.');onSaved?.(data.card);}
  catch(error){setError(error instanceof Error?error.message:'We couldn’t save your prices. Please try again.');}finally{lock.current=false;setBusy(false);}
 }
 async function reload(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const response=await fetch('/api/admin/pricing',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error??'Prices could not be loaded');setVersion(data.card?.id??null);setRules(data.card?.rules??[newRule()]);setMinimum(data.card?.minimumPaise??0);setNotice('Saved prices loaded.');}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{lock.current=false;setBusy(false);}}
 return <section aria-labelledby="pricing-title"><h2 id="pricing-title">Set your printing prices</h2><p>Start with our editable draft: A4 black &amp; white at ₹2 per page. Save only the options your shop offers.</p>
 {!version&&<p className="notice">These are draft prices. Saving prices does not turn on ordering.</p>}
 {error&&<p role="alert" className="notice notice-error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
 <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy||!canEdit} className="setup-prices"><legend>Available printing options</legend>
 {rules.map((rule,i)=><div key={i} className="price-rule">
 <label className="field-label">Paper size<select value={rule.paperSize} onChange={e=>update(i,{paperSize:e.target.value})}>{['A4','A5','LETTER','LEGAL'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label className="field-label">Colour<select value={rule.colorMode} onChange={e=>update(i,{colorMode:e.target.value as RateRule['colorMode']})}><option value="BW">Black &amp; white</option><option value="COLOUR">Colour</option></select></label>
 <label className="field-label">Sides<select value={String(rule.duplex)} onChange={e=>update(i,{duplex:e.target.value==='true'})}><option value="false">Single-sided</option><option value="true">Double-sided</option></select></label>
 <label className="field-label">Charge per<select value={rule.basis} onChange={e=>update(i,{basis:e.target.value as RateRule['basis']})}><option value="PAGE">Printed page</option><option value="SHEET">Sheet</option></select></label>
 <label className="field-label">Price (₹)<input required type="number" min="0" step="0.01" value={Number.isNaN(rule.unitPaise)?'':rule.unitPaise/100} onChange={e=>update(i,{unitPaise:e.target.value===''?NaN:Math.round(Number(e.target.value)*100)})}/></label>
 <button type="button" className="btn btn-ghost" onClick={()=>setRules(r=>r.filter((_,n)=>n!==i))}>Remove option {i+1}</button>
 </div>)}
 <button type="button" className="btn btn-secondary" disabled={rules.length>=32} onClick={()=>setRules(r=>[...r,newRule()])}>Add a print option</button>
 <p className="muted">Per page means each printed side. Per sheet rounds up separately for each copy. Options you don’t list won’t be offered.</p>
 <label className="field-label setup-minimum">Minimum order price (₹)<input required type="number" min="0" step="0.01" value={Number.isNaN(minimum)?'':minimum/100} onChange={e=>setMinimum(e.target.value===''?NaN:Math.round(Number(e.target.value)*100))}/></label>
 <button type="submit" className="btn btn-primary" disabled={rules.length===0}>{busy?'Saving prices…':'Save prices'}</button>
 </fieldset></form><button type="button" className="btn btn-ghost" disabled={busy} onClick={reload}>Reload saved prices</button>
 {!canEdit&&<p>Only the shop owner can change prices.</p>}
 </section>;
}
