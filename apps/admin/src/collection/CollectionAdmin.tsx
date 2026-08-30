import { useCallback, useEffect, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import {
  APP_CATEGORIES,
  deleteHero,
  deleteKasemName,
  foldKasemToAscii,
  HERO_FIELDS,
  listHeroes,
  listKasemNames,
  NAME_KINDS,
  saveHero,
  saveKasemName,
  slug,
  type KasemHero,
  type KasemNameEntry,
  type NameKind,
  APP_PLATFORMS,
  appProblems,
  deleteApp,
  deleteProduct,
  emptyApp,
  emptyProduct,
  formatPrice,
  listApps,
  listOrders,
  listProducts,
  ORDER_STATUSES,
  PRODUCT_CATEGORIES,
  productProblems,
  saveApp,
  saveProduct,
  setOrderStatus,
  type DirectoryApp,
  type OrderStatus,
  type ShopOrder,
  type ShopProduct,
} from './data';
import './collection.css';

type Tab = 'heroes' | 'names' | 'apps' | 'shop' | 'orders';

/**
 * Everything the Collection tab shows beyond the archive itself.
 *
 * Heroes are the people the Kassena remember, and Names is the list a member's
 * handle can earn its kente ring from — both curated here because neither is
 * something to crowd-source in a feed. Apps are links out; Shop is the physical
 * side. Neither takes money in the app: a member sends an order request and
 * somebody here answers it, which is what the Orders tab is for.
 */
export function CollectionAdmin() {
  const [tab, setTab] = useState<Tab>('heroes');
  return (
    <div className="collection-admin">
      <section className="panel">
        <h2>Collection</h2>
        <p className="panel__hint">
          The people the Kassena remember, the names a handle can carry, a directory of apps worth
          having, and a shop of things the project sells. Nothing here is charged for in the app —
          a member sends a request and you reply.
        </p>
        <div className="seg-toggle">
          {(
            [
              ['heroes', 'Heroes'],
              ['names', 'Names'],
              ['apps', 'Apps'],
              ['shop', 'Shop'],
              ['orders', 'Orders'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`seg${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'heroes' ? <HeroesPanel /> : null}
      {tab === 'names' ? <NamesPanel /> : null}
      {tab === 'apps' ? <AppsPanel /> : null}
      {tab === 'shop' ? <ShopPanel /> : null}
      {tab === 'orders' ? <OrdersPanel /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Apps */

function AppsPanel() {
  const [apps, setApps] = useState<DirectoryApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DirectoryApp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await listApps());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the app directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nextOrder = apps.reduce((highest, app) => Math.max(highest, app.order), 0) + 1;

  if (editing) {
    return (
      <AppEditor
        app={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <section className="panel">
      <h3>App directory</h3>
      <p className="panel__hint">
        Each entry becomes a card in Collection → Apps and opens the store link on the member's
        device. Unpublished entries are invisible to the app.
      </p>
      <div className="collection-actions">
        <Button onClick={() => setEditing(emptyApp(nextOrder))}>New app</Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && apps.length === 0 ? <p className="muted">No apps listed yet.</p> : null}
      {apps.length > 0 ? (
        <table className="collection-table">
          <thead>
            <tr>
              <th>#</th>
              <th>App</th>
              <th>Category</th>
              <th>Links</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id}>
                <td>{app.order}</td>
                <td>
                  <strong>{app.name}</strong>
                  <div className="muted">{app.developer}</div>
                </td>
                <td>{app.category}</td>
                <td>{Object.keys(app.links).join(', ') || '—'}</td>
                <td>
                  <StatusPill published={app.published} />
                </td>
                <td className="collection-table__actions">
                  <Button variant="ghost" onClick={() => setEditing(app)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Remove "${app.name}" from the directory?`)) return;
                      await deleteApp(app.id);
                      await load();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function AppEditor({
  app: initial,
  onCancel,
  onSaved,
}: {
  app: DirectoryApp;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [app, setApp] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = appProblems(app);
  const update = (patch: Partial<DirectoryApp>) => setApp((current) => ({ ...current, ...patch }));

  return (
    <section className="panel">
      <h3>{app.id ? 'Edit app' : 'New app'}</h3>
      <div className="collection-grid">
        <label>
          Name
          <input value={app.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          Developer or publisher
          <input value={app.developer} onChange={(e) => update({ developer: e.target.value })} />
        </label>
        <label>
          Category
          <select value={app.category} onChange={(e) => update({ category: e.target.value })}>
            {APP_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Position
          <input
            type="number"
            min={0}
            value={app.order}
            onChange={(e) => update({ order: Number(e.target.value) })}
          />
        </label>
        <label className="collection-grid__wide">
          Icon URL
          <input
            value={app.iconUrl}
            onChange={(e) => update({ iconUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className="collection-grid__wide">
          Description
          <textarea
            rows={2}
            value={app.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        {APP_PLATFORMS.map((platform) => (
          <label key={platform} className="collection-grid__wide">
            {platform === 'android'
              ? 'Google Play link'
              : platform === 'ios'
                ? 'App Store link'
                : 'Web link'}
            <input
              value={app.links[platform] ?? ''}
              onChange={(e) => update({ links: { ...app.links, [platform]: e.target.value } })}
              placeholder="https://…"
            />
          </label>
        ))}
        <label className="collection-checkbox">
          <input
            type="checkbox"
            checked={app.published}
            onChange={(e) => update({ published: e.target.checked })}
          />
          Published
        </label>
      </div>
      <Problems problems={problems} error={error} />
      <div className="collection-actions">
        <Button
          disabled={saving || problems.length > 0}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await saveApp(app);
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'The app could not be saved.');
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save app'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- Shop */

function ShopPanel() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShopProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the shop.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nextOrder = products.reduce((highest, p) => Math.max(highest, p.order), 0) + 1;

  if (editing) {
    return (
      <ProductEditor
        product={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <section className="panel">
      <h3>Shop catalogue</h3>
      <p className="panel__hint">
        Souvenirs, books, shea butter and anything else the project sells. Members browse these in
        Collection → Shop and send an order request; payment is arranged with them directly.
      </p>
      <div className="collection-actions">
        <Button onClick={() => setEditing(emptyProduct(nextOrder))}>New product</Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && products.length === 0 ? <p className="muted">Nothing listed yet.</p> : null}
      {products.length > 0 ? (
        <table className="collection-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.order}</td>
                <td>
                  <strong>{product.name}</strong>
                  <div className="muted">{product.summary}</div>
                </td>
                <td>{product.category}</td>
                <td>{formatPrice(product.priceMinor, product.currency)}</td>
                <td>{product.inStock ? 'In stock' : 'Out of stock'}</td>
                <td>
                  <StatusPill published={product.published} />
                </td>
                <td className="collection-table__actions">
                  <Button variant="ghost" onClick={() => setEditing(product)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Remove "${product.name}" from the shop?`)) return;
                      await deleteProduct(product.id);
                      await load();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function ProductEditor({
  product: initial,
  onCancel,
  onSaved,
}: {
  product: ShopProduct;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [product, setProduct] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = productProblems(product);
  const update = (patch: Partial<ShopProduct>) =>
    setProduct((current) => ({ ...current, ...patch }));

  return (
    <section className="panel">
      <h3>{product.id ? 'Edit product' : 'New product'}</h3>
      <div className="collection-grid">
        <label>
          Name
          <input value={product.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          Category
          <select value={product.category} onChange={(e) => update({ category: e.target.value })}>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price (major units — 0 means "ask")
          <input
            type="number"
            min={0}
            step="0.01"
            value={(product.priceMinor / 100).toFixed(2)}
            onChange={(e) => update({ priceMinor: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
        <label>
          Currency
          <input
            value={product.currency}
            maxLength={3}
            onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
          />
        </label>
        <label>
          Maker or origin
          <input value={product.maker} onChange={(e) => update({ maker: e.target.value })} />
        </label>
        <label>
          Position
          <input
            type="number"
            min={0}
            value={product.order}
            onChange={(e) => update({ order: Number(e.target.value) })}
          />
        </label>
        <label className="collection-grid__wide">
          Image URL
          <input
            value={product.imageUrl}
            onChange={(e) => update({ imageUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className="collection-grid__wide">
          One-line summary
          <input value={product.summary} onChange={(e) => update({ summary: e.target.value })} />
        </label>
        <label className="collection-grid__wide">
          Description
          <textarea
            rows={3}
            value={product.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <label className="collection-checkbox">
          <input
            type="checkbox"
            checked={product.inStock}
            onChange={(e) => update({ inStock: e.target.checked })}
          />
          In stock
        </label>
        <label className="collection-checkbox">
          <input
            type="checkbox"
            checked={product.published}
            onChange={(e) => update({ published: e.target.checked })}
          />
          Published
        </label>
      </div>
      <Problems problems={problems} error={error} />
      <div className="collection-actions">
        <Button
          disabled={saving || problems.length > 0}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await saveProduct(product);
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'The product could not be saved.');
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save product'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Orders */

function OrdersPanel() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <h3>Order requests</h3>
      <p className="panel__hint">
        Every order is a request to buy, not a payment. Contact the member on the details they left,
        arrange payment and delivery, then move the request along so nobody is chased twice.
      </p>
      <div className="collection-actions">
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && orders.length === 0 ? <p className="muted">No orders yet.</p> : null}
      {orders.map((order) => (
        <article className="collection-order" key={order.id}>
          <header>
            <strong>{order.contact}</strong>
            <span className="muted">
              {order.createdAt ? order.createdAt.toDate().toLocaleString() : '—'}
            </span>
          </header>
          <ul>
            {order.items.map((item, index) => (
              <li key={`${item.productId}-${index}`}>
                {item.quantity} × {item.name} — {formatPrice(item.priceMinor, item.currency)}
              </li>
            ))}
          </ul>
          {order.note ? <p className="collection-order__note">{order.note}</p> : null}
          <footer>
            <span>Total {formatPrice(order.totalMinor, order.currency)}</span>
            <select
              value={order.status}
              onChange={async (event) => {
                await setOrderStatus(order.id, event.target.value as OrderStatus);
                await load();
              }}
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </footer>
        </article>
      ))}
    </section>
  );
}

/* -------------------------------------------------------- Kassena heroes */

function emptyHero(order: number): KasemHero {
  return {
    id: '',
    name: '',
    alsoKnownAs: '',
    era: '',
    field: 'Other',
    summary: '',
    story: '',
    birthplace: '',
    portraitUrl: '',
    sourceUrl: '',
    order,
    published: false,
  };
}

/**
 * The people the Kassena remember, as Collection shows them and as Learn's
 * hero-of-the-week card picks from.
 *
 * Nothing here is contributed from the app: a claim about who somebody was is
 * not something to crowd-source in a feed, and the project answers for every
 * word of it. Which is also why a published account has to carry a source.
 */
function HeroesPanel() {
  const [heroes, setHeroes] = useState<KasemHero[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<KasemHero | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHeroes(await listHeroes());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the heroes.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const nextOrder = heroes.reduce((highest, hero) => Math.max(highest, hero.order), 0) + 1;

  if (editing) {
    return (
      <HeroEditor
        hero={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  return (
    <section className="panel">
      <h3>Kassena heroes</h3>
      <p className="panel__hint">
        Each entry becomes a card in Collection &rarr; Heroes and can be the hero of the week on
        Learn. Unpublished entries are invisible to the app.
      </p>
      <div className="collection-actions">
        <Button onClick={() => setEditing(emptyHero(nextOrder))}>New hero</Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <p className="muted">Loading&hellip;</p> : null}
      {!loading && heroes.length === 0 ? <p className="muted">Nobody added yet.</p> : null}
      {heroes.length > 0 ? (
        <table className="collection-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Remembered for</th>
              <th>Source</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {heroes.map((hero) => (
              <tr key={hero.id}>
                <td>{hero.order}</td>
                <td>
                  <strong>{hero.name}</strong>
                  {hero.alsoKnownAs ? <div className="muted">{hero.alsoKnownAs}</div> : null}
                </td>
                <td>{[hero.field, hero.era].filter(Boolean).join(' · ') || '—'}</td>
                <td>{hero.sourceUrl ? 'Cited' : <span className="muted">None</span>}</td>
                <td>
                  <StatusPill published={hero.published} />
                </td>
                <td className="collection-table__actions">
                  <Button variant="ghost" onClick={() => setEditing(hero)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Remove "${hero.name}" from the heroes?`)) return;
                      await deleteHero(hero.id);
                      await load();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function HeroEditor({
  hero: initial,
  onCancel,
  onSaved,
}: {
  hero: KasemHero;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [hero, setHero] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<KasemHero>) => setHero((current) => ({ ...current, ...patch }));

  const problems: string[] = [];
  if (!hero.name.trim()) problems.push('A name is required.');
  if (!hero.summary.trim()) problems.push('A summary is required — it is what the list shows.');
  if (hero.published && !hero.sourceUrl.trim()) {
    // Not a rule about data, a rule about the archive: a life published with
    // nothing behind it is a rumour with a logo on it.
    problems.push('A published hero needs a source, so the account can be checked.');
  }

  return (
    <section className="panel">
      <h3>{hero.id ? 'Edit hero' : 'New hero'}</h3>
      <div className="collection-grid">
        <label>
          Name
          <input value={hero.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label>
          Also known as
          <input
            value={hero.alsoKnownAs}
            onChange={(e) => update({ alsoKnownAs: e.target.value })}
          />
        </label>
        <label>
          Remembered for
          <select value={hero.field} onChange={(e) => update({ field: e.target.value })}>
            {HERO_FIELDS.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <label>
          When
          <input
            value={hero.era}
            placeholder="c. 1890–1961, or: born 1948"
            onChange={(e) => update({ era: e.target.value })}
          />
        </label>
        <label>
          Birthplace
          <input value={hero.birthplace} onChange={(e) => update({ birthplace: e.target.value })} />
        </label>
        <label>
          Portrait URL
          <input
            value={hero.portraitUrl}
            onChange={(e) => update({ portraitUrl: e.target.value })}
          />
        </label>
        <label className="collection-grid__wide">
          Summary
          <textarea
            rows={2}
            value={hero.summary}
            onChange={(e) => update({ summary: e.target.value })}
          />
        </label>
        <label className="collection-grid__wide">
          The account
          <textarea
            rows={8}
            value={hero.story}
            onChange={(e) => update({ story: e.target.value })}
          />
        </label>
        <label className="collection-grid__wide">
          Source
          <input value={hero.sourceUrl} onChange={(e) => update({ sourceUrl: e.target.value })} />
        </label>
        <label>
          Order
          <input
            type="number"
            value={hero.order}
            onChange={(e) => update({ order: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="collection-check">
          <input
            type="checkbox"
            checked={hero.published}
            onChange={(e) => update({ published: e.target.checked })}
          />
          Published
        </label>
      </div>
      <Problems problems={problems} error={error} />
      <div className="collection-actions">
        <Button
          disabled={saving || problems.length > 0}
          onClick={async () => {
            setSaving(true);
            try {
              await saveHero(hero, hero.id || slug(hero.name, 'hero'));
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save.');
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save hero'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Kassena names */

function emptyName(order: number): KasemNameEntry {
  return { id: '', name: '', ascii: '', meaning: '', kind: 'given', order, published: false };
}

/**
 * The names a handle can earn its kente ring from.
 *
 * The folded ASCII is derived from the name and shown but never typed: the
 * mobile client and the handle-claim callable both read the stored value, and
 * if either derived its own and disagreed by a single letter, somebody would
 * claim a name and then not get the ring for it.
 */
function NamesPanel() {
  const [names, setNames] = useState<KasemNameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<KasemNameEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNames(await listKasemNames());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the names.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const nextOrder = names.reduce((highest, entry) => Math.max(highest, entry.order), 0) + 1;

  if (editing) {
    const ascii = foldKasemToAscii(editing.name);
    const problems: string[] = [];
    if (!editing.name.trim()) problems.push('A name is required.');
    if (ascii.length < 3) {
      problems.push('This folds to fewer than three usable letters, so no handle could carry it.');
    }
    return (
      <section className="panel">
        <h3>{editing.id ? 'Edit name' : 'New name'}</h3>
        <div className="collection-grid">
          <label>
            Name, written properly
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label>
            As a handle
            <input value={ascii} readOnly disabled />
          </label>
          <label>
            Kind
            <select
              value={editing.kind}
              onChange={(e) => setEditing({ ...editing, kind: e.target.value as NameKind })}
            >
              {NAME_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <input
              type="number"
              value={editing.order}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="collection-grid__wide">
            Meaning (leave blank rather than guess)
            <input
              value={editing.meaning}
              onChange={(e) => setEditing({ ...editing, meaning: e.target.value })}
            />
          </label>
          <label className="collection-check">
            <input
              type="checkbox"
              checked={editing.published}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
            />
            Published
          </label>
        </div>
        <Problems problems={problems} error={error} />
        <div className="collection-actions">
          <Button
            disabled={problems.length > 0}
            onClick={async () => {
              try {
                await saveKasemName(editing, editing.id || ascii);
                setEditing(null);
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save.');
              }
            }}
          >
            Save name
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>Kassena names</h3>
      <p className="panel__hint">
        A member whose handle carries one of these wears the kente ring, and members who joined
        before the ring existed can take one here as their single name change.
      </p>
      <div className="collection-actions">
        <Button onClick={() => setEditing(emptyName(nextOrder))}>New name</Button>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error ? <p className="error-line">{error}</p> : null}
      {loading ? <p className="muted">Loading&hellip;</p> : null}
      {!loading && names.length === 0 ? (
        <p className="muted">
          No names yet. Until there are, the app falls back to a short list bundled with it.
        </p>
      ) : null}
      {names.length > 0 ? (
        <table className="collection-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>As a handle</th>
              <th>Kind</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {names.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.order}</td>
                <td>
                  <strong>{entry.name}</strong>
                  {entry.meaning ? <div className="muted">{entry.meaning}</div> : null}
                </td>
                <td>
                  <code>{entry.ascii}</code>
                </td>
                <td>{entry.kind}</td>
                <td>
                  <StatusPill published={entry.published} />
                </td>
                <td className="collection-table__actions">
                  <Button variant="ghost" onClick={() => setEditing(entry)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Remove "${entry.name}" from the names?`)) return;
                      await deleteKasemName(entry.id);
                      await load();
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ Shared */

function StatusPill({ published }: { published: boolean }) {
  return (
    <span className={`collection-status collection-status--${published ? 'live' : 'draft'}`}>
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

function Problems({ problems, error }: { problems: string[]; error: string | null }) {
  if (problems.length === 0 && !error) return null;
  return (
    <>
      {problems.length > 0 ? (
        <ul className="collection-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="error-line">{error}</p> : null}
    </>
  );
}
