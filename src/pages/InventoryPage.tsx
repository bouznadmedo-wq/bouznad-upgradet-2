import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getProducts, addProduct, updateProduct, deleteProduct, getGroups,
  type Product, type Group,
} from '@/lib/db';
import {
  Package, Plus, Search, Pencil, Trash2, X, Loader2, AlertTriangle, Barcode, Printer, TrendingUp, DollarSign, Minus,
} from 'lucide-react';
import ImagePicker from '@/components/ImagePicker';

type Draft = {
  id?: string;
  name: string;
  barcode: string;
  sale_price: string;
  quantity: string;
  image_url: string;
  [key: string]: string | undefined;
};

function emptyDraft(): Draft {
  return { name: '', barcode: '', sale_price: '', quantity: '', image_url: '' };
}

type StockFilter = 'all' | 'low' | 'out';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [customFields, setCustomFields] = useState<{ label: string; value: string }[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [imageWarningConfirmed, setImageWarningConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, grps] = await Promise.all([getProducts(), getGroups()]);
      setProducts(data);
      setGroups(grps);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(emptyDraft());
    setCustomFields([]);
    setNewFieldLabel('');
    setError(null);
    setImageWarning(null);
    setImageWarningConfirmed(false);
  }

  function openEdit(p: Product) {
    const draft: Draft = {
      id: p.id,
      name: p.name,
      barcode: p.barcode ?? '',
      sale_price: String(p.sale_price),
      quantity: String(p.quantity),
      image_url: p.image_url ?? '',
    };
    setEditing(draft);
    const cf: { label: string; value: string }[] = [];
    if (p.brand) cf.push({ label: 'Brand', value: p.brand });
    if (p.specs) cf.push({ label: 'General specs', value: p.specs });
    if (p.cpu) cf.push({ label: 'CPU', value: p.cpu });
    if (p.ram) cf.push({ label: 'RAM', value: p.ram });
    if (p.storage) cf.push({ label: 'Storage', value: p.storage });
    if (p.group_id) {
      const g = groups.find((g) => g.id === p.group_id);
      if (g) cf.push({ label: 'Group', value: g.name });
    }
    if (p.cost_price !== undefined && p.cost_price !== p.sale_price) cf.push({ label: 'Cost price (DH)', value: String(p.cost_price) });
    if (p.custom_fields) {
      for (const [k, v] of Object.entries(p.custom_fields)) {
        cf.push({ label: k, value: v });
      }
    }
    setCustomFields(cf);
    setNewFieldLabel('');
    setError(null);
    setImageWarning(null);
    setImageWarningConfirmed(false);
  }

  function addCustomField() {
    const label = newFieldLabel.trim();
    if (!label) return;
    if (customFields.some((f) => f.label.toLowerCase() === label.toLowerCase())) return;
    setCustomFields([...customFields, { label, value: '' }]);
    setNewFieldLabel('');
  }

  function removeCustomField(idx: number) {
    setCustomFields(customFields.filter((_, i) => i !== idx));
  }

  function updateCustomField(idx: number, value: string) {
    setCustomFields(customFields.map((f, i) => (i === idx ? { ...f, value } : f)));
  }

  function checkDuplicateProductName(name: string, excludeId?: string): boolean {
    return products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId);
  }

  function checkDuplicateBarcode(barcode: string, excludeId?: string): boolean {
    return products.some((p) => p.barcode === barcode && p.id !== excludeId);
  }

  function checkDuplicateImage(url: string, excludeId?: string): boolean {
    if (!url.trim() || url.startsWith('data:')) return false;
    return products.some((p) => p.image_url === url.trim() && p.id !== excludeId);
  }

  async function save() {
    if (!editing) return;
    setError(null);
    setImageWarning(null);

    const name = editing.name.trim();
    const barcode = editing.barcode.trim();
    const salePrice = editing.sale_price === '' ? NaN : Number(editing.sale_price);
    const quantity = editing.quantity === '' ? NaN : Number(editing.quantity);

    if (!name) { setError('Name is required.'); return; }
    if (!barcode) { setError('Barcode is required.'); return; }
    if (isNaN(salePrice) || salePrice < 0) { setError('Sale price is required.'); return; }
    if (isNaN(quantity) || quantity < 0) { setError('Quantity is required.'); return; }
    if (checkDuplicateProductName(name, editing.id)) { setError('A product with this name already exists.'); return; }
    if (checkDuplicateBarcode(barcode, editing.id)) { setError('A product with this barcode already exists.'); return; }
    if (checkDuplicateImage(editing.image_url, editing.id) && !imageWarningConfirmed) {
      setImageWarning('This image is already used by another product. Click save again to confirm.');
      setImageWarningConfirmed(true);
      return;
    }

    setBusy(true);
    try {
      const knownKeys = ['brand', 'specs', 'cpu', 'ram', 'storage', 'cost_price', 'group'];
      const payload: Record<string, unknown> = {
        name,
        barcode,
        sale_price: salePrice,
        quantity,
        cost_price: salePrice,
        image_url: editing.image_url.trim() || null,
      };
      for (const k of ['brand', 'specs', 'cpu', 'ram', 'storage', 'group_id']) payload[k] = null;

      const customFieldsObj: Record<string, string> = {};
      for (const cf of customFields) {
        const val = cf.value.trim();
        const labelLower = cf.label.toLowerCase();
        if (labelLower === 'brand') payload['brand'] = val || null;
        else if (labelLower === 'general specs' || labelLower === 'specs') payload['specs'] = val || null;
        else if (labelLower === 'cpu') payload['cpu'] = val || null;
        else if (labelLower === 'ram') payload['ram'] = val || null;
        else if (labelLower === 'storage') payload['storage'] = val || null;
        else if (labelLower === 'cost price (dh)' || labelLower === 'cost price') {
          payload['cost_price'] = val ? Number(val) : salePrice;
        } else if (labelLower === 'group') {
          const g = groups.find((g) => g.name.toLowerCase() === val.toLowerCase());
          payload['group_id'] = g?.id ?? null;
        } else {
          if (val) customFieldsObj[cf.label] = val;
        }
      }
      payload['custom_fields'] = Object.keys(customFieldsObj).length > 0 ? customFieldsObj : null;
      if (payload['cost_price'] === null) payload['cost_price'] = salePrice;

      if (editing.id) {
        await updateProduct(editing.id, payload);
      } else {
        await addProduct(payload as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
      }
      setEditing(null);
      setImageWarningConfirmed(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteProduct(id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (stockFilter === 'low') return p.quantity > 0 && p.quantity <= 3;
    if (stockFilter === 'out') return p.quantity <= 0;
    return true;
  });

  const totalValue = products.reduce((s, p) => s + p.cost_price * p.quantity, 0);
  const totalRetail = products.reduce((s, p) => s + p.sale_price * p.quantity, 0);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= 3).length;
  const outStock = products.filter((p) => p.quantity <= 0).length;

  function printInventory() {
    document.body.classList.add('printing-inventory');
    setTimeout(() => window.print(), 50);
  }

  useEffect(() => {
    const handler = () => document.body.classList.remove('printing-inventory');
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  function priceColor(p: Product): string {
    if (p.sale_price < p.cost_price) return 'text-danger';
    const margin = p.cost_price > 0 ? ((p.sale_price - p.cost_price) / p.cost_price) * 100 : 100;
    if (margin < 10) return 'text-warning';
    return 'text-success';
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Products', value: String(products.length), sub: 'in catalog', icon: Package, color: 'text-accent', glow: 'border-accent/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.55)]', bg: 'bg-accent/12' },
          { label: 'Inventory Cost', value: `${totalValue.toFixed(0)} DH`, sub: 'cost basis', icon: DollarSign, color: 'text-warning', glow: 'border-warning/40 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]', bg: 'bg-warning/12' },
          { label: 'Inventory Price', value: `${totalRetail.toFixed(0)} DH`, sub: 'retail value', icon: TrendingUp, color: 'text-accent', glow: 'border-accent/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.55)]', bg: 'bg-accent/12' },
          { label: 'Low / Out of Stock', value: `${lowStock} / ${outStock}`, sub: 'needs attention', icon: AlertTriangle, color: 'text-danger', glow: 'border-danger-700/40 shadow-[0_0_24px_-8px_rgba(248,113,113,0.55)]', bg: 'bg-danger-700/12' },
        ].map((s) => (
          <div key={s.label} className={`card p-4 border ${s.glow} transition-transform hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-ink-400">{s.label}</p>
                <p className="mt-2 text-2xl font-bold font-mono">{s.value}</p>
                <p className="mt-1 text-[11px] text-ink-500">{s.sub}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.bg} ${s.color}`}><s.icon size={18} /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex flex-1 gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search by name, brand, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'low', 'out'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                    stockFilter === f
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={printInventory} className="btn-ghost">
              <Printer size={16} /> Print
            </button>
            <button onClick={openAdd} className="btn-primary">
              <Plus size={16} /> Add Product
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 grid place-items-center text-ink-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-400 border-b border-ink-800 bg-ink-850">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Attributes</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Barcode</th>
                  <th className="px-4 py-3 font-semibold text-right">Price</th>
                  <th className="px-4 py-3 font-semibold text-center">Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const out = p.quantity <= 0;
                  const low = p.quantity > 0 && p.quantity <= 3;
                  const attrs: { k: string; v: string }[] = [];
                  if (p.brand) attrs.push({ k: 'Brand', v: p.brand });
                  if (p.specs) attrs.push({ k: 'Specs', v: p.specs });
                  if (p.cpu) attrs.push({ k: 'CPU', v: p.cpu });
                  if (p.ram) attrs.push({ k: 'RAM', v: p.ram });
                  if (p.storage) attrs.push({ k: 'Storage', v: p.storage });
                  if (p.custom_fields) {
                    for (const [k, v] of Object.entries(p.custom_fields)) {
                      attrs.push({ k, v });
                    }
                  }
                  return (
                    <tr key={p.id} className="border-b border-ink-800/60 table-row-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-900">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full grid place-items-center"><Package size={18} className="text-ink-600" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold">{p.name}</p>
                            <p className="text-xs text-ink-400">{p.brand ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {attrs.length === 0 ? (
                            <span className="text-xs text-ink-500">—</span>
                          ) : (
                            attrs.slice(0, 5).map((a, i) => (
                              <span key={i} className="badge bg-ink-800 text-ink-300 text-[10px]">{a.k}: {a.v}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-ink-300">{p.barcode || '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${priceColor(p)}`}>{p.sale_price.toFixed(2)} DH</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${out ? 'bg-danger-700/20 text-danger border border-danger-700/40' : low ? 'bg-warning/15 text-warning border border-warning/40' : 'bg-success-700/15 text-success border border-success-700/30'}`}>
                            {out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock'} · {p.quantity}
                          </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="p-2 rounded-md text-ink-300 hover:bg-ink-800 hover:text-accent">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => setConfirmDelete(p)} className="p-2 rounded-md text-ink-300 hover:bg-ink-800 hover:text-danger">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-400">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit/Add modal */}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !busy && setEditing(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900 z-10">
              <p className="font-semibold">{editing.id ? 'Edit Product' : 'Add Product'}</p>
              <button onClick={() => setEditing(null)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Required fields only */}
              <div>
                <label className="label">Product name *</label>
                <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Milk 1L" />
              </div>
              <div>
                <label className="label">Barcode *</label>
                <div className="relative">
                  <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" value={editing.barcode} onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} placeholder="e.g. 8901234567890" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Sale price (DH) *</label>
                  <input type="number" min={0} step="0.01" className="input" value={editing.sale_price} onChange={(e) => setEditing({ ...editing, sale_price: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="label">Quantity *</label>
                  <input type="number" min={0} className="input" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} placeholder="0" />
                </div>
              </div>

              {/* Image picker */}
              <ImagePicker
                value={editing.image_url}
                onChange={(url) => { setEditing({ ...editing, image_url: url }); setImageWarning(null); setImageWarningConfirmed(false); }}
                label="Product image (optional)"
              />
              {imageWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {imageWarning}
                </div>
              )}

              {/* Custom fields */}
              {customFields.map((cf, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="label">{cf.label}</label>
                    <input className="input" value={cf.value} onChange={(e) => updateCustomField(idx, e.target.value)} placeholder={`Enter ${cf.label.toLowerCase()}`} />
                  </div>
                  <button onClick={() => removeCustomField(idx)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-800 text-ink-400 hover:bg-ink-700 hover:text-danger" title="Remove field">
                    <Minus size={16} />
                  </button>
                </div>
              ))}

              {/* Add custom field */}
              <div className="pt-2 border-t border-ink-800">
                <p className="text-xs text-ink-400 mb-2">Add a custom field (e.g. Quality, Volume, Color…):</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Field name"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
                  />
                  <button onClick={addCustomField} className="btn-ghost shrink-0">
                    <Plus size={16} /> Add field
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-800 sticky bottom-0 bg-ink-900">
              <button onClick={() => setEditing(null)} className="btn-ghost" disabled={busy}>Cancel</button>
              <button onClick={save} className="btn-primary" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {editing.id ? 'Save changes' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !busy && setConfirmDelete(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-danger-700/15 text-danger"><AlertTriangle size={20} /></div>
              <p className="font-semibold">Delete product?</p>
            </div>
            <p className="text-sm text-ink-300">Are you sure you want to delete <span className="font-semibold text-ink-100">{confirmDelete.name}</span>? This cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost" disabled={busy}>Cancel</button>
              <button onClick={() => remove(confirmDelete.id)} className="btn-danger" disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print inventory portal */}
      {typeof window !== 'undefined' && createPortal(
        <div className="print-inventory-overlay" style={{ display: 'none' }}>
          <div className="bg-white text-neutral-900">
            <h1 className="font-bold text-lg mb-1 text-center">BZ POS — Stock Report</h1>
            <p className="text-xs text-neutral-500 mb-4 text-center">{new Date().toLocaleString()}</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-300">
                  <th className="text-left py-1.5 pr-2">Product</th>
                  <th className="text-left py-1.5 px-2">Brand</th>
                  <th className="text-center py-1.5 px-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-200">
                    <td className="py-1.5 pr-2">{p.name}</td>
                    <td className="py-1.5 px-2">{p.brand ?? '—'}</td>
                    <td className="text-center py-1.5 px-2">{p.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
