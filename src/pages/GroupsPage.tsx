import { useCallback, useEffect, useState } from 'react';
import {
  getGroups, addGroup, updateGroup, deleteGroup, getProducts, updateProduct,
  type Group, type Product,
} from '@/lib/db';
import {
  Layers, Plus, Trash2, Pencil, Check, X, Package, ChevronRight, Search,
} from 'lucide-react';

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grps, prods] = await Promise.all([getGroups(), getProducts()]);
      setGroups(grps);
      setProducts(prods);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      setError('This group name is already in use.');
      return;
    }
    try {
      await addGroup(name);
      setNewName('');
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add group.');
    }
  }

  async function handleSaveEdit(id: string) {
    const name = editingName.trim();
    if (!name) return;
    if (groups.some((g) => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
      setError('This group name is already in use.');
      return;
    }
    try {
      await updateGroup(id, name);
      setEditingId(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update group.');
    }
  }

  async function handleDelete(g: Group) {
    const inUse = products.some((p) => p.group_id === g.id);
    if (inUse) {
      setError(`Cannot delete "${g.name}" — products are still assigned to it. Reassign them first.`);
      setConfirmDelete(null);
      return;
    }
    try {
      await deleteGroup(g.id);
      if (selectedGroup === g.id) setSelectedGroup(null);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete group.');
    }
  }

  async function handleAssign(productId: string, groupId: string) {
    setAssigning((a) => ({ ...a, [productId]: 'saving' }));
    try {
      await updateProduct(productId, { group_id: groupId || null });
      setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, group_id: groupId || null } : p));
      setAssigning((a) => ({ ...a, [productId]: 'done' }));
      setTimeout(() => setAssigning((a) => { const n = { ...a }; delete n[productId]; return n; }), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign product.');
      setAssigning((a) => { const n = { ...a }; delete n[productId]; return n; });
    }
  }

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;
  const selectedGroupName = groupName(selectedGroup);

  const unassignedProducts = products.filter((p) => !p.group_id);
  const groupProducts = selectedGroup ? products.filter((p) => p.group_id === selectedGroup) : [];
  const searchResults = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.brand ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : [];

  function stockBadge(qty: number) {
    if (qty <= 0) return 'bg-danger-700/20 text-danger border border-danger-700/40';
    if (qty <= 3) return 'bg-warning/15 text-warning border border-warning/40';
    return 'bg-success-700/15 text-success border border-success-700/30';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent border border-accent/20 shadow-glow-sm">
          <Layers size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Groups</h1>
          <p className="text-sm text-ink-400">Organize products into groups</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-error/70 hover:text-error"><X size={16} /></button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Groups list */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-ink-800/90 bg-ink-900/90 p-4 shadow-card">
            <div className="flex gap-2 mb-4">
              <input
                className="input flex-1"
                placeholder="New group name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <button onClick={handleAdd} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent/90">
                <Plus size={16} /> Add
              </button>
            </div>

            <div className="space-y-1.5">
              {groups.length === 0 && (
                <p className="text-sm text-ink-400 py-4 text-center">No groups yet. Create one above.</p>
              )}
              {groups.map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-all cursor-pointer ${
                    selectedGroup === g.id
                      ? 'border-accent/60 bg-accent/10 shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]'
                      : 'border-ink-800/80 bg-ink-850/80 hover:border-ink-700 hover:bg-ink-800'
                  }`}
                  onClick={() => setSelectedGroup(selectedGroup === g.id ? null : g.id)}
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-800">
                    {g.image_url ? (
                      <img src={g.image_url} alt={g.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-ink-400"><Layers size={15} /></div>
                    )}
                  </div>
                  {editingId === g.id ? (
                    <input
                      className="input flex-1 py-1 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(g.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{g.name}</p>
                      <p className="text-xs text-ink-400">{products.filter((p) => p.group_id === g.id).length} products</p>
                    </div>
                  )}
                  {editingId === g.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(g.id); }} className="p-1.5 rounded-md text-success hover:bg-success/10"><Check size={15} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1.5 rounded-md text-ink-400 hover:bg-ink-800"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setEditingId(g.id); setEditingName(g.name); }} className="p-1.5 rounded-md text-ink-300 hover:bg-ink-800 hover:text-accent"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDelete(g)} className="p-1.5 rounded-md text-ink-300 hover:bg-ink-800 hover:text-error"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Unassigned products */}
          {unassignedProducts.length > 0 && (
            <div className="rounded-2xl border border-ink-800/90 bg-ink-900/90 p-4 shadow-card">
              <p className="text-xs font-semibold text-ink-400 mb-3">Unassigned Products ({unassignedProducts.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {unassignedProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2">
                    <div className="h-7 w-7 shrink-0 rounded-md overflow-hidden border border-ink-800 bg-ink-800">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center"><Package size={13} className="text-ink-500" /></div>
                      )}
                    </div>
                    <p className="text-xs flex-1 truncate">{p.name}</p>
                    <span className={`badge text-[10px] ${stockBadge(p.quantity)}`}>{p.quantity}</span>
                    <select
                      className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-100 focus:outline-none"
                      value=""
                      onChange={(e) => handleAssign(p.id, e.target.value)}
                    >
                      <option value="">Assign…</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: group products or search */}
        <div className="rounded-2xl border border-ink-800/90 bg-ink-900/90 p-4 shadow-card">
          {selectedGroup ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <ChevronRight size={18} className="text-ink-400" />
                  <h2 className="font-semibold">{selectedGroupName}</h2>
                  <span className="text-xs text-ink-400">({groupProducts.length} products)</span>
                </div>
                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
                >
                  <Plus size={14} /> Add Products
                </button>
              </div>

              {showPicker && (
                <div className="mb-4 rounded-lg border border-ink-700 bg-ink-850 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-ink-300">Assign unassigned products to {selectedGroupName}</p>
                    <button onClick={() => setShowPicker(false)} className="text-ink-400 hover:text-ink-200"><X size={15} /></button>
                  </div>
                  {unassignedProducts.length === 0 ? (
                    <p className="text-xs text-ink-400 py-4 text-center">All products are already assigned to a group.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {unassignedProducts.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-lg bg-ink-900 px-3 py-2">
                          <div className="h-9 w-9 shrink-0 rounded-md overflow-hidden border border-ink-800 bg-ink-800">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full grid place-items-center"><Package size={14} className="text-ink-500" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{p.name}</p>
                            <p className="text-xs text-ink-400">{p.brand ?? 'No brand'} · {p.sale_price} DH</p>
                          </div>
                          <span className={`badge text-[10px] ${stockBadge(p.quantity)}`}>{p.quantity}</span>
                          {assigning[p.id] === 'saving' ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-accent" />
                          ) : assigning[p.id] === 'done' ? (
                            <Check size={16} className="text-success" />
                          ) : (
                            <button
                              onClick={() => handleAssign(p.id, selectedGroup)}
                              className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {groupProducts.length === 0 && !showPicker ? (
                <p className="text-sm text-ink-400 py-8 text-center">No products in this group. Use the search below to find and assign products.</p>
              ) : (
                <div className="space-y-2">
                  {groupProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-ink-850 px-3 py-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-800">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-ink-400"><Package size={16} /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-ink-400">{p.brand ?? 'No brand'} · {p.sale_price} DH · Qty: {p.quantity}</p>
                      </div>
                      <span className={`badge text-[10px] ${stockBadge(p.quantity)}`}>
                        {p.quantity <= 0 ? 'Out' : p.quantity <= 3 ? 'Low' : 'In Stock'}
                      </span>
                      {assigning[p.id] === 'saving' ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-accent" />
                      ) : assigning[p.id] === 'done' ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <select
                          className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-100 focus:outline-none"
                          value={p.group_id ?? ''}
                          onChange={(e) => handleAssign(p.id, e.target.value)}
                        >
                          <option value="">— None —</option>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Layers size={40} className="mx-auto text-ink-700 mb-3" />
              <p className="text-sm text-ink-400">Select a group to view and manage its products.</p>
            </div>
          )}

          {/* Search to assign products to selected group */}
          {selectedGroup && (
            <div className="mt-6 pt-4 border-t border-ink-800">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  placeholder="Search products to assign to this group…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {searchResults.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-ink-850 px-3 py-2">
                      <div className="h-8 w-8 shrink-0 rounded-md overflow-hidden border border-ink-800 bg-ink-800">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center"><Package size={14} className="text-ink-500" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-ink-400">
                          {p.brand ?? 'No brand'} · Current: {groupName(p.group_id) ?? 'None'}
                        </p>
                      </div>
                      <span className={`badge text-[10px] ${stockBadge(p.quantity)}`}>{p.quantity}</span>
                      {p.group_id === selectedGroup ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <button
                          onClick={() => handleAssign(p.id, selectedGroup)}
                          className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-xl bg-ink-900 border border-ink-800 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-error/10 text-error"><Trash2 size={20} /></div>
              <h3 className="font-bold">Delete group?</h3>
            </div>
            <p className="text-sm text-ink-300 mb-5">
              Are you sure you want to delete "{confirmDelete.name}"? Products in this group will become unassigned.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-300 hover:bg-ink-800">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white hover:bg-error/90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
