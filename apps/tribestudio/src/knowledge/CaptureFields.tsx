import { RELATION_TYPES, STRUCTURED_FIELDS, VALUE_STATES, type Representation, type ValueState } from '@indigen-world/contracts/knowledge';
import type { RecordInput } from './data';
import { KasemField } from '../spelling/KasemField';

const labels: Record<string, string> = { senses: 'Lexical senses', examples: 'Ordered examples', dialogueTurns: 'Speaker turns', segments: 'Story segments', qaExamples: 'Instruction examples' };
export function CaptureFields({ record, onChange }: { record: RecordInput; onChange: (record: RecordInput) => void }) {
  const change = <K extends keyof RecordInput>(key: K, value: RecordInput[K]) => onChange({ ...record, [key]: value });
  const text = (label: string, value: string, set: (value: string) => void, max = 2000) => <label className="kw-field"><span>{label}</span><input value={value} maxLength={max} onChange={e => set(e.target.value)} /></label>;
  const rightsText = (key: 'holder' | 'evidence' | 'version' | 'publicAttribution' | 'restrictions' | 'expiresAt', label: string) => text(label, record.rights[key], value => change('rights', { ...record.rights, [key]: value }));
  const rowChange = (key: string, index: number, patch: Partial<Representation>) => change('structured', { ...record.structured, [key]: record.structured[key].map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <>
    <section className="kw-section"><h3>Missing information has a meaning</h3><p>Use a state to distinguish an unknown value from one that does not apply. Keep the text field empty when no wording is known.</p>
      {(['english', 'french', 'region', 'context'] as const).map(key => <label className="kw-field" key={key}><span>{key === 'english' ? 'English translation' : key === 'french' ? 'French translation' : key === 'region' ? 'Region' : 'Context'} state</span><select value={record.valueStates[key] ?? 'unknown'} onChange={e => change('valueStates', { ...record.valueStates, [key]: e.target.value as ValueState })}>{VALUE_STATES.map(s => <option value={s} key={s}>{s.replaceAll('_', ' ')}</option>)}</select></label>)}
      {text('Assigned request reference, if any', record.requestContext, value => change('requestContext', value), 200)}
    </section>
    {(STRUCTURED_FIELDS[record.datasetType] ?? []).map(key => <section className="kw-section" key={key}><h3>{labels[key]}</h3><p>Keep each original, translation and context together. Order is preserved. Speaker and translator references must be pseudonymous.</p>
      {(record.structured[key] ?? []).map((row, index) => <div className="kw-inset" key={row.id}><strong>{index + 1}. {labels[key]}</strong>
        {(['original', 'english', 'french', 'context', 'translator', ...(key === 'dialogueTurns' ? ['speakerId'] : [])] as const).map(field => <label className="kw-field" key={field}><span>{field === 'speakerId' ? 'Speaker reference' : field === 'original' ? 'Original Kasem' : field}</span>{field === 'original' ? <KasemField value={row.original} maxLength={12000} onChange={e => rowChange(key, index, { original: e.target.value })} /> : <textarea value={row[field as keyof Representation]} maxLength={field === 'context' ? 4000 : ['translator', 'speakerId'].includes(field) ? 100 : 12000} onChange={e => rowChange(key, index, { [field]: e.target.value })} />}</label>)}
        <label className="kw-field"><span>Translation state</span><select value={row.translationState} onChange={e => rowChange(key, index, { translationState: e.target.value as ValueState })}>{VALUE_STATES.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label>
        <button type="button" onClick={() => change('structured', { ...record.structured, [key]: record.structured[key].filter((_, i) => i !== index) })}>Remove item {index + 1}</button>
      </div>)}
      <button type="button" disabled={(record.structured[key]?.length ?? 0) >= 100} onClick={() => change('structured', { ...record.structured, [key]: [...(record.structured[key] ?? []), { id: crypto.randomUUID(), original: '', english: '', french: '', speakerId: '', context: '', translator: '', translationState: 'not_yet_translated' }] })}>Add {key === 'dialogueTurns' ? 'speaker turn' : 'item'}</button>
    </section>)}
    <section className="kw-section"><h3>Relationships to exact revisions</h3><p>Use the internal record ID shown in its history. A link does not copy content or grant permission to use it.</p>
      {record.relations.map((relation, index) => <div className="kw-inset" key={index}>
        <label className="kw-field"><span>Relationship</span><select value={relation.type} onChange={e => change('relations', record.relations.map((r, i) => i === index ? { ...r, type: e.target.value } : r))}>{RELATION_TYPES.map(t => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}</select></label>
        {text('Target record ID', relation.recordId, value => change('relations', record.relations.map((r, i) => i === index ? { ...r, recordId: value } : r)), 100)}
        <label className="kw-field"><span>Target revision</span><input type="number" min="1" step="1" value={relation.revision} onChange={e => change('relations', record.relations.map((r, i) => i === index ? { ...r, revision: Number(e.target.value) } : r))} /></label>
        <button type="button" onClick={() => change('relations', record.relations.filter((_, i) => i !== index))}>Remove relationship {index + 1}</button>
      </div>)}
      <button type="button" disabled={record.relations.length >= 30} onClick={() => change('relations', [...record.relations, { type: 'supports', recordId: '', revision: 1 }])}>Add relationship</button>
    </section>
    <section className="kw-section"><h3>Rights evidence and disclosure</h3><p>Unresolved rights can enter restricted review. Release and model use stay blocked. Recording permission never implies permission to replicate a voice.</p>
      <label className="kw-field"><span>Rights state</span><select id="kw-rights-state" value={record.rights.state} onChange={e => change('rights', { ...record.rights, state: e.target.value as RecordInput['rights']['state'] })}><option value="unresolved">Unresolved — block release</option><option value="documented">Documented</option><option value="withdrawn">Withdrawn — block use</option></select></label>
      {rightsText('holder', 'Rights holder reference')}{rightsText('evidence', 'Private consent evidence reference')}{rightsText('version', 'Consent evidence version')}{rightsText('publicAttribution', 'Consented attribution for public display')}{rightsText('restrictions', 'Disclosure restrictions')}{rightsText('expiresAt', 'Rights expiry, ISO date if applicable')}
      {(['preservation', 'derivedMedia', 'speechSynthesis'] as const).map(key => <label className="kw-check" key={key}><input type="checkbox" checked={record.rights[key]} onChange={e => change('rights', { ...record.rights, [key]: e.target.checked })} /><span>{({ preservation: 'Allow preservation', derivedMedia: 'Allow derived media', speechSynthesis: 'Allow speech synthesis under a separately approved policy' })[key]}</span></label>)}
      {text('Source family for leakage checks', record.sourceFamily, value => change('sourceFamily', value), 200)}
      <label className="kw-field"><span>Proposed dataset split</span><select value={record.split} onChange={e => change('split', e.target.value as RecordInput['split'])}><option value="unassigned">Unassigned</option><option value="train">Training candidate</option><option value="evaluation">Held-out evaluation candidate</option></select><small>Review and release approval are required. A source family cannot be released into both splits.</small></label>
    </section>
  </>;
}
