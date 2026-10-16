import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { functions, storage } from '../firebase';
import { Button } from '../ui/primitives';
import './media-picker.css';
export interface MediaAsset { id: string; url: string; thumbnailUrl?: string; alt: string; credit: string; rights: string; status: string; focalX?: number; focalY?: number }
type Pending = { id: string; name: string; progress: number; status: string; task?: UploadTask };
const api = async (data: Record<string, unknown>) => (await httpsCallable<Record<string, unknown>, Record<string, any>>(functions, 'collectionMedia')(data)).data;
export function MediaPicker({ value, onChange, multiple = false, label = 'Images' }: { value: MediaAsset[]; onChange: (assets: MediaAsset[]) => void; multiple?: boolean; label?: string }) {
  const [tab, setTab] = useState('upload'), [pending, setPending] = useState<Pending[]>([]), [library, setLibrary] = useState<MediaAsset[]>([]);
  const [error, setError] = useState(''), [alt, setAlt] = useState(''), [rights, setRights] = useState(''), [credit, setCredit] = useState(''), [link, setLink] = useState('');
  const input = useRef<HTMLInputElement>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const update = (id: string, patch: Partial<Pending>) => { if (alive.current) setPending((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)); };
  async function finish(id: string) {
    for (let attempt = 0; attempt < 90 && alive.current; attempt++) {
      const result = await api({ operation: 'status', id });
      if (result.status === 'failed') throw new Error(result.error);
      if (['ready', 'published'].includes(result.status)) { update(id, { status: 'ready', progress: 100 }); return; }
      update(id, { status: result.status }); await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error('Processing is delayed. Check status to recover the upload.');
  }
  async function upload(files: FileList | File[]) {
    setError('');
    for (const file of Array.from(files).slice(0, multiple ? 12 : 1)) {
      let assetId: string | undefined;
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose JPG, PNG or WebP images up to 10 MB each.');
        const bitmap = await createImageBitmap(file), valid = bitmap.width >= 32 && bitmap.height >= 32 && bitmap.width * bitmap.height <= 40_000_000;
        bitmap.close(); if (!valid) throw new Error('Choose an image between 32 pixels and 40 megapixels.');
        const started = await api({ operation: 'begin', mime: file.type, bytes: file.size }); assetId = started.id;
        setPending((rows) => [...rows, { id: started.id, name: file.name, progress: 0, status: 'uploading' }]);
        const task = uploadBytesResumable(ref(storage, started.storagePath), file, { contentType: file.type }); update(started.id, { task });
        await new Promise<void>((resolve, reject) => task.on('state_changed', (s) => update(started.id, { progress: Math.round(s.bytesTransferred / s.totalBytes * 100) }), reject, resolve));
        await finish(started.id);
      } catch (err) { if (assetId) update(assetId, { status: 'failed' }); setError(err instanceof Error ? err.message : 'Upload failed. Your form text is preserved.'); }
    }
  }
  function select(asset: MediaAsset) { onChange(multiple ? [...value.filter((a) => a.id !== asset.id), asset].slice(0, 12) : [asset]); }
  return <fieldset className="media-picker"><legend>{label}</legend>
    <div className="media-picker__tabs" aria-label="Image source">{[['upload', 'Upload files'], ['library', 'Media library'], ['link', 'Add link']].map(([key, title]) => <Button key={key} variant={tab === key ? 'soft' : 'ghost'} aria-pressed={tab === key} onClick={async () => { setTab(key); if (key === 'library') try { setLibrary((await api({ operation: 'library' })).items); } catch { setError('Could not load the media library. Try again.'); } }}>{title}</Button>)}</div>
    <Button onClick={async () => { try { const result = await api({ operation: 'pending' }); setPending(result.items.map((a: any) => ({ id: a.id, name: 'Recovered image ' + a.id.slice(0, 8), progress: a.status === 'ready' ? 100 : 0, status: a.status }))); } catch { setError('Could not recover pending uploads. Try again.'); } }}>Recover pending uploads</Button>
    {tab === 'upload' && <div className="media-picker__drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}><p>Drop images here or choose files</p><small>JPG, PNG, WebP · up to 10 MB · originals stay private</small><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} /><Button onClick={() => input.current?.click()}>Browse files</Button></div>}
    {tab === 'library' && <div className="media-picker__gallery">{library.length ? library.map((a) => <button type="button" key={a.id} onClick={() => select(a)}><img src={a.thumbnailUrl || a.url} alt={a.alt} loading="lazy" /><span>{a.alt}</span></button>) : <p>No published images yet.</p>}</div>}
    {tab === 'link' && <div><label>HTTPS image link<input type="url" value={link} onChange={(e) => setLink(e.target.value)} /></label><Button disabled={!/^https:\/\//.test(link)} onClick={() => { if (!alt.trim()) return setError('Add descriptive alt text.'); select({ id: `external-${Date.now()}`, url: link, alt, credit, rights, status: 'external' }); }}>Use link</Button><small>External links stay external; the server does not download them.</small></div>}
    <div className="media-picker__metadata"><label>Alt text<input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image" /></label><label>Rights / permission<input value={rights} onChange={(e) => setRights(e.target.value)} placeholder="Owner or licence permitting this use" /></label><label>Credit<input value={credit} onChange={(e) => setCredit(e.target.value)} /></label></div>
    {pending.map((row) => <div key={row.id} className="media-picker__progress"><strong>{row.name}</strong><progress max={100} value={row.progress} aria-label={`Upload ${row.name}`} /><span>{row.status}</span>{row.status === 'uploading' ? <><Button onClick={() => row.task?.pause()}>Pause</Button><Button onClick={() => row.task?.resume()}>Resume</Button><Button onClick={() => { row.task?.cancel(); update(row.id, { status: 'cancelled' }); }}>Cancel</Button></> : row.status === 'ready' ? <Button disabled={!alt.trim() || !rights.trim()} onClick={async () => { try { select(await api({ operation: 'publish', id: row.id, alt, credit, rights }) as MediaAsset); setPending((rows) => rows.filter((r) => r.id !== row.id)); } catch (err) { setError(err instanceof Error ? err.message : 'Could not use image.'); } }}>Use image</Button> : <Button onClick={() => void finish(row.id).catch((e) => setError(e.message))}>Check status</Button>}</div>)}
    <div className="media-picker__gallery">{value.map((asset, index) => <div key={asset.id}><img src={asset.thumbnailUrl || asset.url} alt={asset.alt} style={{ objectPosition: `${(asset.focalX ?? .5) * 100}% ${(asset.focalY ?? .5) * 100}%` }} /><small>{index === 0 ? 'Cover' : `Image ${index + 1}`}</small><input aria-label={`Alt text for image ${index + 1}`} value={asset.alt} onChange={(e) => onChange(value.map((a) => a.id === asset.id ? { ...a, alt: e.target.value } : a))} /><label>Horizontal focal point<input type="range" min={0} max={1} step={.05} value={asset.focalX ?? .5} onChange={(e) => onChange(value.map((a) => a.id === asset.id ? { ...a, focalX: Number(e.target.value) } : a))} /></label><label>Vertical focal point<input type="range" min={0} max={1} step={.05} value={asset.focalY ?? .5} onChange={(e) => onChange(value.map((a) => a.id === asset.id ? { ...a, focalY: Number(e.target.value) } : a))} /></label>{index > 0 && <Button size="sm" onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>Move earlier</Button>}{index > 0 && <Button size="sm" onClick={() => onChange([asset, ...value.filter((a) => a.id !== asset.id)])}>Make cover</Button>}<Button size="sm" onClick={() => onChange(value.filter((a) => a.id !== asset.id))}>Remove</Button></div>)}</div>{error && <p role="alert">{error}</p>}
  </fieldset>;
}
export function ImageField({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  return <MediaPicker label={label} value={value ? [{ id: value, url: value, alt: label, rights: '', credit: '', status: 'external' }] : []} onChange={(assets) => onChange(assets[0]?.url ?? '')} />;
}
