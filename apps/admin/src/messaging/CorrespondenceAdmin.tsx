import { useEffect, useState } from 'react';
import { normalizeLetter,parseLetterBody,bodyPlainText,heritageSvg,HERITAGE_FRAME,type CorrespondenceLetter,type LetterRun } from '@indigen-world/contracts/correspondence';
import { useLeaveGuard } from '../router';
import { Button,Dialog,Field,Notice,PageHeader } from '../ui/primitives';
import { correspondenceRequest,type Draft,type LetterFiles,type Version,type Delivery } from './correspondence-data';
import './correspondence.css';

const empty = ():CorrespondenceLetter=>({date:new Date().toISOString().slice(0,10),recipient:{name:'',organisation:'',address:[],email:''},subject:'',salutation:'',body:[],closing:'',sender:{name:'',role:''},enclosures:''});
const markdown = (letter:CorrespondenceLetter)=>letter.body.map(b=>(b.pageBreakBefore?'---page---\n':'')+(b.list==='bullet'?'- ':b.list==='number'?'1. ':'')+b.runs.map(r=>r.href?`[${r.text}](${r.href})`:r.bold?`**${r.text}**`:r.italic?`*${r.text}*`:r.text).join('')).join('\n\n');
function Runs({runs}:{runs:LetterRun[]}) { return <>{runs.map((r,i)=>{let content:React.ReactNode=r.text; if(r.bold) content=<strong>{content}</strong>; if(r.italic) content=<em>{content}</em>; return <span key={i}>{r.href?<a href={r.href} target="_blank" rel="noreferrer">{content}</a>:content}</span>;})}</>; }
export function CorrespondenceAdmin() {
  const [id,setId]=useState<string>(()=>crypto.randomUUID()),[revision,setRevision]=useState(0),[letter,setLetter]=useState(empty),[body,setBody]=useState(''),[emailBody,setEmailBody]=useState('');
  const [drafts,setDrafts]=useState<Draft[]>([]),[versions,setVersions]=useState<Version[]>([]),[files,setFiles]=useState<LetterFiles|null>(null);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState(false),[loadFailed,setLoadFailed]=useState(false);
  useLeaveGuard(dirty,'Your letter has unsaved edits. Leave this page?');
  const load = async()=>{try{setDrafts((await correspondenceRequest<{drafts:Draft[]}>({action:'list'})).drafts);setLoadFailed(false);}catch(e){setLoadFailed(true);setError(e instanceof Error?e.message:'Drafts could not be loaded.');}};
  useEffect(()=>{void load();},[]);
  const history=async()=>setVersions((await correspondenceRequest<{versions:Version[]}>({action:'history',id})).versions);
  const change=(value:Partial<CorrespondenceLetter>)=>{setLetter(v=>({...v,...value}));setDirty(true);setFiles(null);};
  const changeBody=(value:string)=>{setBody(value);change({body:parseLetterBody(value)});};
  const save = async()=>{
    const content=normalizeLetter(letter,{draft:true});
    if (!dirty && revision) return revision;
    const result=await correspondenceRequest<{revision:number}>({action:'save',id,revision,letter:content,emailBody});
    setRevision(result.revision);setDirty(false);void load();return result.revision;
  };
  const run=async(label:string,operation:()=>Promise<void>)=>{setBusy(label);setError('');setNotice('');try{await operation();}catch(e){setError(e instanceof Error?e.message:'This action failed. Your letter remains here; retry when ready.');}finally{setBusy('');}};
  const generate=async(action:'generate'|'print'='generate')=>{
    const rev=await save();
    const result=await correspondenceRequest<LetterFiles>({action,id,revision:rev});setFiles(result);await history();return result;
  };
  const openDraft=async(nextId:string)=>{
    const draft=drafts.find(d=>d.id===nextId);if(!draft)return;
    setId(draft.id);setRevision(draft.revision);setLetter(draft.letter);setBody(markdown(draft.letter));setEmailBody(draft.emailBody||'');setDirty(false);setFiles(null);setVersions([]);setNotice('');setError('');
    try{setVersions((await correspondenceRequest<{versions:Version[]}>({action:'history',id:draft.id})).versions);}catch(e){setError(e instanceof Error?e.message:'Version history could not be loaded.');}
  };
  const download=async(kind:'pdf'|'docx')=>{
    const popup=window.open('about:blank','_blank');
    await run(`Preparing ${kind==='pdf'?'PDF':'Word'}`,async()=>{try{const result=await generate();if(popup)popup.location.href=result.links[kind];else window.location.assign(result.links[kind]);}catch(e){popup?.close();throw e;}});
  };
  const print=async()=>{
    const popup=window.open('about:blank','_blank');
    await run('Preparing print files',async()=>{try{const result=await generate('print');if(popup)popup.location.href=result.links.pdf;setNotice('Word and PDF are ready. Use the PDF viewer’s Print action to choose a printer or save a copy.');}catch(e){popup?.close();throw e;}});
  };
  const send=async()=>run('Sending email with PDF',async()=>{
    if(!files)throw new Error('Generate the current letter before sending.');
    const result=await correspondenceRequest<{delivery:Delivery}>({action:'send',id,version:files.version,revision,reviewed:true});
    setFiles({...files,delivery:result.delivery});await history();setReview(false);
    setNotice(result.delivery.status==='accepted'?'Email accepted by the provider with this PDF attached.':`Delivery ${result.delivery.status}. Do not resend an uncertain delivery; check the provider using the message ID in history.`);
  });
  const recipient=(key:'name'|'organisation'|'email',value:string)=>change({recipient:{...letter.recipient,[key]:value}});
  const sender=(key:'name'|'role',value:string)=>change({sender:{...letter.sender,[key]:value}});
  const field=(label:string,value:string,onChange:(v:string)=>void,required=false,type='text')=><Field label={label} required={required}><input className="ts-input" type={type} value={value} onChange={e=>onChange(e.target.value)}/></Field>;
  return <div className="ad-page iw-correspondence">
    <PageHeader title="Correspondence" description="Prepare, print and send letters on Heritage Frame."/>
    <div className="iw-letter-toolbar"><Field label="Saved drafts"><select className="ts-select" value={revision?id:''} disabled={dirty||!!busy} onChange={e=>void openDraft(e.target.value)}><option value="">New letter</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.letter.subject} · {d.letter.date}</option>)}</select></Field><Button disabled={dirty||!!busy} onClick={()=>{setId(crypto.randomUUID());setRevision(0);setLetter(empty());setBody('');setEmailBody('');setFiles(null);setVersions([]);setNotice('');}}>New letter</Button></div>
    {loadFailed?<Notice tone="danger">Saved drafts could not be loaded. <Button onClick={()=>void load()}>Retry loading</Button></Notice>:null}
    {error?<Notice tone="danger">{error}</Notice>:null}{notice?<Notice tone="info">{notice}</Notice>:null}
    <div className="iw-letter-desk"><form className="ad-card-box" onSubmit={e=>{e.preventDefault();void run('Saving draft',async()=>{await save();setNotice('Draft saved privately.');});}}>
      <div className="ad-card-box__head"><h2>Letter details</h2><span>{dirty?'Unsaved changes':revision?'Saved draft':'New draft'}</span></div>
      <fieldset className="ad-card-box__body ts-stack iw-letter-fields" disabled={!!busy}>
        <div className="iw-letter-row">{field('Date',letter.date,v=>change({date:v}),true,'date')}{field('Reference',letter.reference||'',v=>change({reference:v}))}</div>
        {field('Recipient name',letter.recipient.name||'',v=>recipient('name',v))}{field('Organisation',letter.recipient.organisation||'',v=>recipient('organisation',v))}{field('Recipient email',letter.recipient.email||'',v=>recipient('email',v),false,'email')}
        <Field label="Recipient address" optional><textarea className="ts-textarea" rows={3} value={(letter.recipient.address||[]).join('\n')} onChange={e=>change({recipient:{...letter.recipient,address:e.target.value.split('\n')}})}/></Field>
        {field('Subject',letter.subject,v=>change({subject:v}),true)}{field('Salutation',letter.salutation||'',v=>change({salutation:v}))}
        <Field label="Letter body" required hint="Blank lines separate paragraphs. Use - or 1. for lists, **bold**, *emphasis*, [label](https://…), and ---page--- on its own line for a page break."><textarea className="ts-textarea" rows={12} value={body} onChange={e=>changeBody(e.target.value)}/></Field>
        {field('Closing',letter.closing||'',v=>change({closing:v}))}<div className="iw-letter-row">{field('Sender name',letter.sender.name,v=>sender('name',v),true)}{field('Sender role',letter.sender.role||'',v=>sender('role',v))}</div>
        {field('Enclosures',letter.enclosures||'',v=>change({enclosures:v}))}
        <Field label="Separate email introduction" optional hint="When supplied, this is the concise email body; the attachment contains the complete letter. Otherwise the letter text is used in the email."><textarea className="ts-textarea" rows={3} value={emailBody} onChange={e=>{setEmailBody(e.target.value);setDirty(true);setFiles(null);}}/></Field>
        <Button type="submit" busy={busy==='Saving draft'}>Save draft</Button>
      </fieldset>
    </form><aside className="iw-letter-preview"><h2>Letterhead preview</h2><p className="ts-muted">The generated PDF shows final pagination.</p>
      {files?<iframe title="Generated letter PDF" src={files.links.pdf}/>:<div className="iw-letter-page"><div className="iw-letter-art" dangerouslySetInnerHTML={{__html:heritageSvg()}}/><div className="iw-letter-brand"><strong>INDIGEN</strong> WORLD</div><div className="iw-letter-copy"><p>{letter.date}{letter.reference?` · ${letter.reference}`:''}</p><p>{letter.recipient.name}<br/>{letter.recipient.organisation}<br/>{(letter.recipient.address||[]).map((s,i)=><span key={i}>{s}<br/></span>)}{letter.recipient.email}</p><p><strong>{letter.subject||'Letter subject'}</strong></p><p>{letter.salutation}</p>{letter.body.map((b,i)=><p key={i}>{b.list?'• ':''}<Runs runs={b.runs}/></p>)}<p>{letter.closing}<br/><strong>{letter.sender.name}</strong><br/>{letter.sender.role}</p>{letter.enclosures?<p>Enclosures: {letter.enclosures}</p>:null}</div><span className="iw-letter-footer">indigenworld.com</span></div>}
      <div className="iw-letter-actions"><Button disabled={!!busy} onClick={()=>void download('docx')}>Download Word</Button><Button disabled={!!busy} onClick={()=>void download('pdf')}>Download PDF</Button><Button disabled={!!busy} onClick={()=>void print()}>Print PDF</Button><Button variant="primary" disabled={!!busy||!letter.recipient.email} onClick={()=>void run('Preparing email review',async()=>{await generate();setReview(true);})}>Review and send email</Button></div>
      <p role="status" aria-live="polite">{busy||`${HERITAGE_FRAME.version} · A4 · private documents`}</p>
      {files?<p className="iw-letter-hash">PDF SHA-256: {files.pdfSha256}</p>:null}
    </aside></div>
    {versions.length?<section className="ad-card-box"><div className="ad-card-box__head"><h2>Document versions</h2></div><div className="ad-card-box__body ts-stack">{versions.map(v=><article key={v.version} className="iw-letter-version"><div><strong>{v.subject}</strong><p>{v.createdAt} · {v.delivery?.status||'Generated, not sent'}</p><small>{v.delivery?.messageId||v.pdfSha256}</small></div><Button disabled={!!busy} onClick={()=>void run('Loading version',async()=>{const result=await correspondenceRequest<LetterFiles>({action:'download',id,version:v.version});setFiles(result);setNotice('Viewing this historical PDF. Download and send actions generate the current draft.');})}>View saved PDF</Button></article>)}</div></section>:null}
    {review&&files?<Dialog title="Send email with PDF attached" lede="Review the recipient, email body and generated PDF before sending." busy={!!busy} onClose={()=>setReview(false)} footer={<><Button disabled={!!busy} onClick={()=>setReview(false)}>Back to edit</Button><Button variant="primary" busy={!!busy} disabled={['accepted','unknown','sending','preparing'].includes(files.delivery?.status||'')} onClick={()=>void send()}>Send email with PDF</Button></>}><p><strong>To:</strong> {letter.recipient.email}</p><p><strong>Subject:</strong> {letter.subject}</p><p className="iw-email-review">{emailBody||[letter.salutation,bodyPlainText(letter.body),letter.closing,letter.sender.name,letter.sender.role].filter(Boolean).join('\n\n')}</p><a href={files.links.pdf} target="_blank" rel="noreferrer">Review PDF attachment</a>{files.delivery?<Notice tone="info">Delivery: {files.delivery.status}. Accepted and uncertain sends cannot be retried.</Notice>:null}{error?<Notice tone="danger">{error}</Notice>:null}</Dialog>:null}
  </div>;
}

