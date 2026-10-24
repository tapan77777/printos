"use client";
import { useEffect, useState } from 'react';
import type { RateRule } from '@/lib/shopPricing';
const newRule = (): RateRule => ({ paperSize: 'A4', colorMode: 'BW', duplex: false, basis: 'PAGE', unitPaise: 200 });
export default function Pricing() {
    const [rules, setRules] = useState<RateRule[]>([newRule()]);
    const [minimum, setMinimum] = useState(0);
    const [version, setVersion] = useState<string | null>(null);
    const [editable, setEditable] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    async function load() { setBusy(true); setError(''); try {
        const r = await fetch('/api/admin/pricing');
        const d = await r.json();
        if (!r.ok)
            throw Error(d.error);
        setEditable(d.canEdit);
        setVersion(d.card?.id ?? null);
        setRules(d.card?.rules ?? [newRule()]);
        setMinimum(d.card?.minimumPaise ?? 0);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load rates');
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { load(); }, []);
    function update(i: number, patch: Partial<RateRule>) { setRules(r => r.map((v, n) => n === i ? { ...v, ...patch } : v)); setNotice(''); }
    async function save() { setBusy(true); setError(''); setNotice(''); try {
        const r = await fetch('/api/admin/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules, minimumPaise: minimum, expectedVersion: version }) });
        const d = await r.json();
        if (!r.ok)
            throw Error(d.error);
        setVersion(d.card.id);
        setNotice('Rates published. Existing jobs keep their original prices.');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save');
    }
    finally {
        setBusy(false);
    } }
    return <><div className="page-heading"><p className="eyebrow">SHOP CONFIGURATION</p><h1>Printing prices</h1><p>Publish exactly the combinations your shop offers. All amounts below are integer paise (100 paise = ₹1).</p></div>{error && <p role="alert" className="notice notice-error">{error}</p>}{notice && <p role="status">{notice}</p>}<button className="btn btn-ghost" disabled={busy} onClick={load}>Reload saved rates</button><fieldset disabled={busy || !editable} className="panel" style={{ padding: 24, minWidth: 0 }}><legend>Supported printing combinations</legend>{!version && <p role="status">No published rates yet. The values below are a draft; customers cannot obtain shop quotes until an owner publishes prices.</p>}<p>Per page means per printed side. Per sheet rounds odd duplex pages up separately for every copy. Unlisted combinations are rejected.</p>{rules.map((r, i) => <div key={i} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}><label>Paper<select aria-label={`Paper ${i + 1}`} value={r.paperSize} onChange={e => update(i, { paperSize: e.target.value })}>{['A4', 'A5', 'LETTER', 'LEGAL'].map(v => <option key={v}>{v}</option>)}</select></label><label>Colour<select value={r.colorMode} onChange={e => update(i, { colorMode: e.target.value as RateRule['colorMode'] })}><option value="BW">Black & white</option><option value="COLOUR">Colour</option></select></label><label>Sides<select value={String(r.duplex)} onChange={e => update(i, { duplex: e.target.value === 'true' })}><option value="false">Single-sided</option><option value="true">Double-sided</option></select></label><label>Charge per<select value={r.basis} onChange={e => update(i, { basis: e.target.value as RateRule['basis'] })}><option value="PAGE">Printed page</option><option value="SHEET">Sheet</option></select></label><label>Paise<input style={{ width: 110 }} type="number" min={0} step={1} value={Number.isNaN(r.unitPaise) ? "" : r.unitPaise} onChange={e => update(i, { unitPaise: e.target.value === '' ? NaN : Number(e.target.value) })}/></label><button className="btn btn-ghost" onClick={() => setRules(r => r.filter((_, n) => n !== i))}>Remove combination {i + 1}</button></div>)}<button className="btn btn-ghost" disabled={rules.length >= 32} onClick={() => setRules(r => [...r, newRule()])}>Add combination</button><p><label>Minimum order charge (paise) <input type="number" min={0} step={1} value={Number.isNaN(minimum) ? "" : minimum} onChange={e => setMinimum(e.target.value === '' ? NaN : Number(e.target.value))}/></label></p><button className="btn btn-primary" onClick={save}>Publish prices</button></fieldset>{busy && <p role="status">Loading…</p>}{!editable && !busy && !error && <p>Staff can view rates. Only a shop owner can publish changes.</p>}<p>Rates describe your shop’s offering; they do not verify physical printer capabilities.</p></>;
}
