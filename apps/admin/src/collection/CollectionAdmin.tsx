import { useCallback, useEffect, useState } from 'react';
import { Button } from '@indigen-world/web-ui';
import {
  APP_CATEGORIES,
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

type Tab = 'apps' | 'shop' | 'orders';

/**
 * The Collection tab's two catalogues, plus the orders they produce.
 *
 * Apps are links out — Kasem apps, scripture apps, the other Indigen World
 * releases. Shop is the physical side: souvenirs, books, shea butter. Neither
 * takes money in the app; a member sends an order request and somebody here
 * answers it, which is what the Orders tab is for.
 */
export function CollectionAdmin() {
  const [tab, setTab] = useState<Tab>('apps');
  return (
    <div className="collection-admin">
      <section className="panel">
        <h2>Collection</h2>
        <p className="panel__hint">
          What the mobile Collection tab shows beyond the archive itself: a directory of apps worth
          having, and a shop of things the project sells. Nothing here is charged for in the app —
          a member sends a request and you reply.
        </p>
        <div className="seg-toggle">
          {(
            [
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
