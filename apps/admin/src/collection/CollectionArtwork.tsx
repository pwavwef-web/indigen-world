import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Button, PageHeader } from '../ui/primitives';
import { MediaPicker, type MediaAsset } from './MediaPicker';
import '../shop/shop.css';
type Row = Record<string, any>;
const api = async (data: Row) => (await httpsCallable<Row, Row>(functions, 'collectionMedia')(data)).data;
export function CollectionArtwork() {
  const [kind, setKind] = useState('music'), [rows, setRows] = useState<Row[]>([]), [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<Row | null>(null), [assets, setAssets] = useState<MediaAsset[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load(more = false) { setBusy(true); try { const data = await api({ operation: 'content', kind, ...(more ? { cursor } : {}) }); setRows((old) => more ? [...old, ...data.items] : data.items); setCursor(data.cursor); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  useEffect(() => { setSelected(null); void load(); }, [kind]);
  return <div className="shop-workspace"><PageHeader title="Collection artwork" description="Replace covers for published music, literature, audiobooks and films. Publication, attribution and media remain in their existing review workflows." />
    {error && <p role="alert">{error}</p>}<label>Collection<select value={kind} onChange={(e) => setKind(e.target.value)}>{['music', 'literature', 'audiobooks', 'video'].map((v) => <option key={v}>{v}</option>)}</select></label>
    {selected ? <section className="panel"><h2>{selected.title}</h2><p>Publication: {selected.publicationStatus}</p><MediaPicker label="Cover artwork" value={assets} onChange={setAssets} /><div className="shop-shortcuts"><Button onClick={() => setSelected(null)}>Back</Button><Button busy={busy} variant="primary" onClick={async () => { setBusy(true); setError(''); try { await api({ operation: 'setCover', contentId: selected.id, assetId: assets[0]?.status === 'published' ? assets[0].id : null, url: assets[0]?.url ?? '', alt: assets[0]?.alt ?? '' }); setSelected(null); await load(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>Save cover</Button></div></section> : <><div className="shop-records">{rows.map((row) => <article className="panel shop-record" key={row.id}>{row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" />}<div><h3>{row.title}</h3><p>{row.publicationStatus}</p></div><Button onClick={() => { setSelected(row); setAssets(row.thumbnailUrl ? [{ id: row.coverAssetId ?? row.id, url: row.thumbnailUrl, alt: row.title, credit: '', rights: '', status: row.coverAssetId ? 'published' : 'external' }] : []); }}>Edit cover</Button></article>)}</div>{!busy && !rows.length && <p>No records in this collection.</p>}{cursor && <Button busy={busy} onClick={() => void load(true)}>Load more</Button>}</>}
    <p className="muted">Heroes and app-directory images live in their own editors. Place-story photographs are licensed bundled assets; their credits and replacements are maintained with the app.</p>
  </div>;
}
