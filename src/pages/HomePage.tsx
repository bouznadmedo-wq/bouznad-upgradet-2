import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useAuth } from '@/context/AuthContext';
import {
  getProducts, getGroups, addGroup, updateGroup, deleteGroup, addProduct, updateProduct, deleteProduct, createSale, decrementStock, getNextInvoiceNumber, getHeldCarts, addHeldCart, deleteHeldCart,
  type Product, type Group, type CartItem, type HeldCart,
} from '@/lib/db';
import {
  Layers, Plus, Search, X, Package, Barcode, ScanLine, Camera, CameraOff,
  ShoppingCart, Trash2, Minus, Receipt, Check, Loader2, CreditCard, Printer, ChevronRight, ChevronDown, Pencil, Settings, Link2, AlertTriangle, Pause, Play,
} from 'lucide-react';
import ImagePicker from '@/components/ImagePicker';

type ReceiptData = {
  invoiceNumber: string;
  customerName: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  cardAuthRef: string | null;
  cashierName: string;
  date: string;
};

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

export default function HomePage() {
  const { profile, isAdmin } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [search, setSearch] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('home_cart');
      return saved ? JSON.parse(saved) as CartItem[] : [];
    } catch { return []; }
  });
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [discount, setDiscount] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMsg, setCheckoutMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [cardAuthRef, setCardAuthRef] = useState('');

  // Scanner
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [productDraft, setProductDraft] = useState<Draft>(emptyDraft());
  const [productError, setProductError] = useState<string | null>(null);
  const [productBusy, setProductBusy] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<{ label: string; value: string }[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [productWarning, setProductWarning] = useState<string | null>(null);
  const [productWarningConfirmed, setProductWarningConfirmed] = useState(false);
  const [groupWarningConfirmed, setGroupWarningConfirmed] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [deleteProductBusy, setDeleteProductBusy] = useState(false);
  const [cartCollapsed, setCartCollapsed] = useState(false);
  const [holdCustomerName, setHoldCustomerName] = useState('');

  // Group modals
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupImage, setNewGroupImage] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupWarning, setGroupWarning] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupImage, setEditGroupImage] = useState('');
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);

  // Assign product modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignBusy, setAssignBusy] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [grps, prods] = await Promise.all([getGroups(), getProducts()]);
      setGroups(grps);
      setProducts(prods);
      if (profile) {
        try {
          const held = await getHeldCarts(profile.id);
          setHeldCarts(held);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist cart to localStorage so it survives navigation away from Home
  useEffect(() => {
    try { localStorage.setItem('home_cart', JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  // Auto-collapse cart when leaving a group (deselecting)
  useEffect(() => {
    if (!selectedGroup) setCartCollapsed(true);
  }, [selectedGroup]);

  // ---------- Scanner ----------
  const stopScanner = useCallback(() => {
    if (controlsRef.current) { controlsRef.current.stop?.(); controlsRef.current = null; }
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); if (videoRef.current) videoRef.current.srcObject = null; }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScanError(null);
    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      const reader = readerRef.current;
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices.length) { setScanError('No camera found on this device.'); return; }
      setScanning(true);
      controlsRef.current = reader.decodeFromVideoDevice(devices[0].deviceId, videoRef.current!, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        if (code === lastScanRef.current.code && now - lastScanRef.current.time < 1200) return;
        lastScanRef.current = { code, time: now };
        addByBarcode(code);
      }) as unknown as { stop: () => void };
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Could not access camera.');
      setScanning(false);
    }
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);
  useEffect(() => { if (scanning) return () => stopScanner(); }, [scanning, stopScanner]);
  useEffect(() => {
    const handler = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  // ---------- Cart ----------
  function getStockFor(productId: string): number {
    return products.find((p) => p.id === productId)?.quantity ?? 0;
  }

  function addToCart(p: Product) {
    const stock = p.quantity;
    const inCart = cart.find((c) => c.product_id === p.id)?.quantity ?? 0;
    if (inCart + 1 > stock) { setCheckoutMsg({ kind: 'err', text: 'Quantity exceeds available stock.' }); return; }
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.product_id === p.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      const specs = [p.cpu, p.ram, p.storage].filter(Boolean).join(' · ');
      return [...prev, {
        product_id: p.id, name: p.name, brand: p.brand, barcode: p.barcode,
        group_id: p.group_id, unit_price: p.sale_price, quantity: 1, serial_number: '',
        specs: specs || p.specs || '',
      }];
    });
    setCheckoutMsg(null);
  }

  async function addByBarcode(code: string) {
    const codeTrim = code.trim();
    if (!codeTrim) return;
    const prod = products.find((p) => p.barcode === codeTrim);
    if (!prod) { setCheckoutMsg({ kind: 'err', text: `No product matches barcode ${codeTrim}.` }); return; }
    if (prod.quantity <= 0) { setCheckoutMsg({ kind: 'err', text: `${prod.name} is out of stock.` }); return; }
    addToCart(prod);
  }

  function changeQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const q = next[idx].quantity + delta;
      if (q <= 0) { next.splice(idx, 1); }
      else {
        const stock = getStockFor(next[idx].product_id);
        if (q > stock) { setCheckoutMsg({ kind: 'err', text: 'Quantity exceeds available stock.' }); return prev; }
        next[idx] = { ...next[idx], quantity: q };
      }
      return next;
    });
  }

  function removeItem(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)); }

  // ---------- Held carts (multi-customer) ----------
  async function holdCart() {
    if (!cart.length || !profile) return;
    const label = holdCustomerName.trim() ? holdCustomerName.trim() : `Held Cart ${heldCarts.length + 1}`;
    const created = await addHeldCart(profile.id, label, cart);
    setHeldCarts((prev) => [created, ...prev]);
    setCart([]); setDiscount(0); setHoldCustomerName('');
    setCheckoutMsg({ kind: 'ok', text: `Cart held for ${label}.` });
  }

  async function resumeCart(id: string) {
    const held = heldCarts.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart_data);
    setHoldCustomerName(held.label.replace(/^Held Cart \d+$/, ''));
    await deleteHeldCart(id);
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
    setShowHeld(false);
  }

  async function deleteHeld(id: string) {
    await deleteHeldCart(id);
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
  }

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  // ---------- Checkout ----------
  async function checkout() {
    if (!cart.length || !profile) return;
    if (paymentMethod === 'card') { setCardModal(true); return; }
    await doCheckout(null);
  }

  async function doCheckout(authRef: string | null) {
    if (!cart.length || !profile) return;
    setCheckoutBusy(true); setCheckoutMsg(null); setCardModal(false);
    try {
      const invoiceNumber = await getNextInvoiceNumber();
      await createSale(
        { invoice_number: invoiceNumber, cashier_id: profile.id, customer_name: null, subtotal, tax: 0, discount, total, payment_method: paymentMethod, card_auth_ref: authRef },
        cart.map((c) => ({ product_id: c.product_id, product_name: c.name, barcode: c.barcode, serial_number: c.serial_number || null, specs: c.specs || null, unit_price: c.unit_price, quantity: c.quantity, line_total: c.unit_price * c.quantity })),
      );
      for (const c of cart) { await decrementStock(c.product_id, c.quantity); }
      await loadData();
      setCheckoutMsg({ kind: 'ok', text: `Sale ${invoiceNumber} completed.` });
      setReceipt({ invoiceNumber, customerName: 'Walk-in', items: cart, subtotal, tax: 0, discount, total, paymentMethod, cardAuthRef: authRef, cashierName: profile.full_name ?? profile.email, date: new Date().toLocaleString() });
      setCart([]); setDiscount(0); setCardAuthRef('');
    } catch (e) {
      setCheckoutMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Checkout failed.' });
    } finally { setCheckoutBusy(false); }
  }

  function printReceipt() { document.body.classList.add('printing-receipt'); window.print(); }

  // ---------- Group management ----------
  function checkDuplicateGroupName(name: string, excludeId?: string): boolean {
    return groups.some((g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== excludeId);
  }

  function checkDuplicateImage(url: string, excludeId?: string): boolean {
    if (!url.trim()) return false;
    return groups.some((g) => g.image_url === url.trim() && g.id !== excludeId);
  }

  async function handleCreateGroup() {
    setGroupError(null);
    const name = newGroupName.trim();
    if (!name) { setGroupError('Group name is required.'); return; }
    if (checkDuplicateGroupName(name)) { setGroupError('A group with this name already exists.'); return; }
    if (checkDuplicateImage(newGroupImage) && !groupWarningConfirmed) {
      setGroupWarning('This image is already used by another group. Click Create again to confirm.');
      setGroupWarningConfirmed(true);
      return;
    }
    setGroupBusy(true);
    try {
      await addGroup(name, newGroupImage.trim() || undefined);
      setShowNewGroupModal(false);
      setNewGroupName(''); setNewGroupImage(''); setGroupWarning(null); setGroupWarningConfirmed(false);
      await loadData();
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Failed to create group.');
    } finally { setGroupBusy(false); }
  }

  function openEditGroup(g: Group) {
    setEditingGroup(g);
    setEditGroupName(g.name);
    setEditGroupImage(g.image_url ?? '');
    setGroupError(null); setGroupWarning(null);
    setDeleteGroupConfirm(false);
  }

  async function handleSaveGroup() {
    if (!editingGroup) return;
    setGroupError(null);
    const name = editGroupName.trim();
    if (!name) { setGroupError('Group name is required.'); return; }
    if (checkDuplicateGroupName(name, editingGroup.id)) { setGroupError('A group with this name already exists.'); return; }
    if (checkDuplicateImage(editGroupImage, editingGroup.id) && !groupWarningConfirmed) {
      setGroupWarning('This image is already used by another group. Click Save again to confirm.');
      setGroupWarningConfirmed(true);
      return;
    }
    setGroupBusy(true);
    try {
      await updateGroup(editingGroup.id, name, editGroupImage.trim() || undefined);
      setEditingGroup(null); setGroupWarningConfirmed(false);
      await loadData();
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Failed to update group.');
    } finally { setGroupBusy(false); }
  }

  async function handleDeleteProduct() {
    if (!confirmDeleteProduct) return;
    setDeleteProductBusy(true);
    try {
      await deleteProduct(confirmDeleteProduct.id);
      setConfirmDeleteProduct(null);
      await loadData();
    } catch {
      /* ignore */
    } finally { setDeleteProductBusy(false); }
  }

  async function handleDeleteGroup() {
    if (!editingGroup) return;
    setGroupBusy(true);
    try {
      await deleteGroup(editingGroup.id);
      setEditingGroup(null);
      setSelectedGroup(null);
      await loadData();
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Failed to delete group.');
    } finally { setGroupBusy(false); }
  }

  // ---------- Product modal ----------
  function openAddProduct() {
    setProductDraft(emptyDraft());
    setEditingProductId(null);
    setCustomFields([]);
    setNewFieldLabel('');
    setProductError(null); setProductWarning(null); setProductWarningConfirmed(false);
    setShowProductModal(true);
  }

  function openEditProduct(p: Product) {
    const draft: Draft = {
      id: p.id, name: p.name, barcode: p.barcode ?? '', sale_price: String(p.sale_price), quantity: String(p.quantity),
      image_url: p.image_url ?? '',
    };
    setProductDraft(draft);
    setEditingProductId(p.id);
    const cf: { label: string; value: string }[] = [];
    if (p.brand) cf.push({ label: 'Brand', value: p.brand });
    if (p.specs) cf.push({ label: 'General specs', value: p.specs });
    if (p.cpu) cf.push({ label: 'CPU', value: p.cpu });
    if (p.ram) cf.push({ label: 'RAM', value: p.ram });
    if (p.storage) cf.push({ label: 'Storage', value: p.storage });
    if (p.cost_price !== undefined && p.cost_price !== p.sale_price) cf.push({ label: 'Cost price (DH)', value: String(p.cost_price) });
    if (p.custom_fields) {
      for (const [k, v] of Object.entries(p.custom_fields)) {
        cf.push({ label: k, value: v });
      }
    }
    setCustomFields(cf);
    setNewFieldLabel('');
    setProductError(null); setProductWarning(null); setProductWarningConfirmed(false);
    setShowProductModal(true);
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
    setCustomFields(customFields.map((f, i) => i === idx ? { ...f, value } : f));
  }

  function checkDuplicateProductName(name: string, excludeId?: string | null): boolean {
    return products.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId);
  }

  function checkDuplicateBarcode(barcode: string, excludeId?: string | null): boolean {
    return products.some((p) => p.barcode === barcode && p.id !== excludeId);
  }

  function checkDuplicateProductImage(url: string, excludeId?: string | null): boolean {
    if (!url.trim() || url.startsWith('data:')) return false;
    return products.some((p) => p.image_url === url.trim() && p.id !== excludeId);
  }

  async function saveProduct() {
    setProductError(null); setProductWarning(null);
    const name = productDraft.name.trim();
    const barcode = productDraft.barcode.trim();
    const salePrice = productDraft.sale_price === '' ? NaN : Number(productDraft.sale_price);
    const quantity = productDraft.quantity === '' ? NaN : Number(productDraft.quantity);

    if (!name) { setProductError('Name is required.'); return; }
    if (!barcode) { setProductError('Barcode is required.'); return; }
    if (isNaN(salePrice) || salePrice < 0) { setProductError('Sale price is required.'); return; }
    if (isNaN(quantity) || quantity < 0) { setProductError('Quantity is required.'); return; }
    if (checkDuplicateProductName(name, editingProductId)) { setProductError('A product with this name already exists.'); return; }
    if (checkDuplicateBarcode(barcode, editingProductId)) { setProductError('A product with this barcode already exists.'); return; }
    if (checkDuplicateProductImage(productDraft.image_url, editingProductId) && !productWarningConfirmed) {
      setProductWarning('This image is already used by another product. Click save again to confirm.');
      setProductWarningConfirmed(true);
      return;
    }

    setProductBusy(true);
    try {
      const knownKeys = ['brand', 'specs', 'cpu', 'ram', 'storage', 'cost_price'];
      const payload: Record<string, unknown> = {
        name, barcode, sale_price: salePrice, quantity,
        group_id: selectedGroup?.id ?? null,
        cost_price: salePrice,
        image_url: productDraft.image_url.trim() || null,
      };
      // Reset all known fields to null first
      for (const k of knownKeys) payload[k] = null;
      // Build custom_fields object from user-defined fields
      const customFieldsObj: Record<string, string> = {};
      for (const cf of customFields) {
        const val = cf.value.trim();
        const labelLower = cf.label.toLowerCase();
        if (knownKeys.includes(labelLower)) {
          payload[labelLower] = val || null;
          if (labelLower === 'cost_price' && val) payload['cost_price'] = Number(val);
        } else {
          if (val) customFieldsObj[cf.label] = val;
        }
      }
      payload.custom_fields = Object.keys(customFieldsObj).length > 0 ? customFieldsObj : null;
      // If cost_price not set by custom fields, default to sale_price
      if (payload.cost_price === null) payload.cost_price = salePrice;

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
      } else {
        await addProduct(payload as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
      }
      setShowProductModal(false); setProductWarningConfirmed(false);
      await loadData();
    } catch (e) {
      setProductError(e instanceof Error ? e.message : 'Save failed.');
    } finally { setProductBusy(false); }
  }

  // ---------- Assign product ----------
  async function handleAssignProduct(productId: string) {
    if (!selectedGroup) return;
    setAssignBusy(productId);
    try {
      await updateProduct(productId, { group_id: selectedGroup.id });
      await loadData();
    } catch { /* ignore */ } finally { setAssignBusy(null); }
  }

  async function handleUnassignProduct(productId: string) {
    setAssignBusy(productId);
    try {
      await updateProduct(productId, { group_id: null });
      await loadData();
    } catch { /* ignore */ } finally { setAssignBusy(null); }
  }

  // ---------- Derived ----------
  const groupProducts = selectedGroup ? products.filter((p) => p.group_id === selectedGroup.id) : [];
  const filteredGroupProducts = search.trim()
    ? groupProducts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand ?? '').toLowerCase().includes(search.toLowerCase()) || (p.barcode ?? '').toLowerCase().includes(search.toLowerCase()))
    : groupProducts;

  const filteredAssignable = assignSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(assignSearch.toLowerCase()) || (p.barcode ?? '').toLowerCase().includes(assignSearch.toLowerCase()))
    : products;

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
            <Layers size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Groups</h1>
            <p className="text-sm text-ink-400">Tap a group to view products and sell</p>
          </div>
        </div>
        {!selectedGroup && isAdmin && (
          <button onClick={() => { setNewGroupName(''); setNewGroupImage(''); setGroupError(null); setGroupWarning(null); setShowNewGroupModal(true); }} className="btn-primary">
            <Plus size={16} /> New Group
          </button>
        )}
      </div>

      {/* Groups grid */}
      {!selectedGroup && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {groups.length === 0 && (
            <div className="col-span-full text-center py-16">
              <Layers size={48} className="mx-auto text-ink-700 mb-3" />
              <p className="text-sm text-ink-400">No groups yet. Click "New Group" to create one.</p>
            </div>
          )}
          {groups.map((g) => {
            const count = products.filter((p) => p.group_id === g.id).length;
            return (
              <div key={g.id} className="group relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-850 hover:border-accent/40 hover:bg-ink-800 transition-all">
                <button onClick={() => setSelectedGroup(g)} className="w-full text-left">
                  <div className="aspect-[4/3] relative overflow-hidden">
                    {g.image_url ? (
                      <img src={g.image_url} alt={g.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="h-full w-full grid place-items-center bg-gradient-to-br from-ink-800 to-ink-900">
                        <Layers size={40} className="text-ink-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-bold text-sm truncate">{g.name}</p>
                    <p className="text-xs text-ink-400">{count} product{count !== 1 ? 's' : ''}</p>
                  </div>
                </button>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditGroup(g); }}
                    className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-lg bg-black/50 text-ink-200 hover:bg-black/70 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Settings size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group detail */}
      {selectedGroup && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedGroup(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100">
                <ChevronRight size={18} className="rotate-180" />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Layers size={18} />
                </div>
                <div>
                  <p className="font-semibold leading-none">{selectedGroup.name}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{groupProducts.length} product{groupProducts.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {isAdmin && (
                <button onClick={() => openEditGroup(selectedGroup)} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-accent">
                  <Settings size={15} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {isAdmin && (
                <button onClick={() => { setAssignSearch(''); setShowAssignModal(true); }} className="btn-ghost">
                  <Link2 size={16} /> Assign
                </button>
              )}
              {isAdmin && (
                <button onClick={openAddProduct} className="btn-primary">
                  <Plus size={16} /> New Product
                </button>
              )}
            </div>
          </div>

          {/* Products grid */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredGroupProducts.length === 0 && (
              <div className="col-span-full text-center py-12">
                <Package size={36} className="mx-auto text-ink-600 mb-2" />
                <p className="text-sm text-ink-400">No products in this group. Add one or assign existing products.</p>
              </div>
            )}
            {filteredGroupProducts.map((p) => {
              const out = p.quantity <= 0;
              return (
                <div key={p.id} className={`rounded-xl border p-4 transition-all ${out ? 'border-ink-800 bg-ink-900/40 opacity-60' : 'border-ink-800 bg-ink-850 hover:border-accent/40 hover:bg-ink-800'}`}>
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-900">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center"><Package size={20} className="text-ink-600" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-ink-400 truncate">{p.brand}</p>
                          <p className="text-[11px] font-mono text-ink-500 truncate mt-0.5">{p.barcode || '—'}</p>
                        </div>
                        <span className={`badge ${stockBadge(p.quantity)}`}>{out ? 'Out' : `${p.quantity}`}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-ink-400 truncate max-w-[55%]">{p.specs || p.cpu || '—'}</span>
                        <span className="font-mono font-semibold text-accent">{p.sale_price.toFixed(2)} DH</span>
                      </div>
                      {p.custom_fields && Object.keys(p.custom_fields).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(p.custom_fields).slice(0, 4).map(([k, v]) => (
                            <span key={k} className="badge bg-ink-800 text-ink-400 text-[10px]">{k}: {v}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <button disabled={out} onClick={() => addToCart(p)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed">
                      <ShoppingCart size={14} /> Add to Cart
                    </button>
                    {isAdmin && (
                      <button onClick={() => openEditProduct(p)} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-accent">
                        <Pencil size={14} />
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setConfirmDeleteProduct(p)} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-800 text-ink-300 hover:bg-danger-700/20 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cart panel — always visible when cart has items */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-full max-w-sm">
          <div className="card overflow-hidden animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800 bg-ink-900 cursor-pointer select-none" onClick={() => setCartCollapsed((v) => !v)}>
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent"><ShoppingCart size={16} /></div>
                <p className="font-semibold text-sm">Cart ({cart.length})</p>
                <span className="font-mono text-xs text-accent">{total.toFixed(2)} DH</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); setCart([]); }} className="text-ink-400 hover:text-danger p-1 rounded-md hover:bg-ink-800"><Trash2 size={15} /></button>
                <button onClick={(e) => { e.stopPropagation(); setShowHeld(true); }} className="relative text-ink-400 hover:text-accent p-1 rounded-md hover:bg-ink-800" title="Held carts">
                  <Pause size={15} />
                  {heldCarts.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent text-ink-950 text-[9px] font-bold px-1">{heldCarts.length}</span>
                  )}
                </button>
                <ChevronDown size={18} className={`text-ink-400 transition-transform ${cartCollapsed ? '' : 'rotate-180'}`} />
              </div>
            </div>
            {!cartCollapsed && (
              <>
                <div className="max-h-56 overflow-y-auto px-3 py-2">
                  <ul className="space-y-1.5">
                    {cart.map((c, idx) => {
                      const prod = products.find((p) => p.id === c.product_id);
                      return (
                      <li key={idx} className="rounded-lg border border-ink-800 bg-ink-850 p-2.5">
                        <div className="flex items-start gap-2">
                          <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden border border-ink-800 bg-ink-900">
                            {prod?.image_url ? (
                              <img src={prod.image_url} alt={c.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full grid place-items-center"><Package size={14} className="text-ink-600" /></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs truncate">{c.name}</p>
                            <p className="text-[11px] text-ink-400 truncate">{c.brand} · {c.specs}</p>
                          </div>
                          <button onClick={() => removeItem(idx)} className="text-ink-400 hover:text-danger p-0.5"><X size={13} /></button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button onClick={() => changeQty(idx, -1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 hover:bg-ink-700 text-ink-200"><Minus size={12} /></button>
                            <span className="w-8 text-center text-xs font-semibold">{c.quantity}</span>
                            <button onClick={() => changeQty(idx, 1)} className="grid h-6 w-6 place-items-center rounded-md bg-ink-800 hover:bg-ink-700 text-ink-200"><Plus size={12} /></button>
                          </div>
                          <span className="font-mono font-semibold text-xs">{(c.unit_price * c.quantity).toFixed(2)} DH</span>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="border-t border-ink-800 p-3 bg-ink-900 space-y-2">
                  {checkoutMsg && (
                    <div className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${checkoutMsg.kind === 'ok' ? 'bg-success-700/15 text-success border border-success-700/30' : 'bg-danger-700/15 text-danger border border-danger-700/30'}`}>{checkoutMsg.text}</div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-ink-300">Total</span>
                    <span className="font-mono font-bold text-accent">{total.toFixed(2)} DH</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['cash', 'card'] as const).map((m) => (
                      <button key={m} onClick={() => setPaymentMethod(m)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${paymentMethod === m ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'}`}>{m}</button>
                    ))}
                  </div>
                  <input
                    className="input px-2.5 py-1.5 text-xs"
                    placeholder="Customer name (for Hold)"
                    value={holdCustomerName}
                    onChange={(e) => setHoldCustomerName(e.target.value)}
                  />
                  <div className="flex gap-1.5">
                    <button onClick={holdCart} disabled={checkoutBusy} className="btn-ghost flex-1">
                      <Pause size={14} /> Hold
                    </button>
                    <button onClick={checkout} disabled={checkoutBusy} className="btn-success flex-[2]">
                      {checkoutBusy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />} Complete Sale
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Held carts drawer */}
      {showHeld && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowHeld(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-md h-full bg-ink-900 border-l border-ink-800 shadow-2xl flex flex-col animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
              <div className="flex items-center gap-2.5">
                <Pause size={18} className="text-accent" />
                <p className="font-semibold">Held Carts</p>
              </div>
              <button onClick={() => setShowHeld(false)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {heldCarts.length === 0 ? (
                <p className="text-center text-sm text-ink-400 py-10">No held carts. Use the Hold button to park a cart for another customer.</p>
              ) : (
                heldCarts.map((h) => (
                  <div key={h.id} className="rounded-xl border border-ink-800 bg-ink-850 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{h.label}</p>
                        <p className="text-xs text-ink-400 mt-0.5">
                          {h.cart_data.length} item{h.cart_data.length !== 1 ? 's' : ''} · {h.cart_data.reduce((s, c) => s + c.unit_price * c.quantity, 0).toFixed(2)} DH
                        </p>
                        <p className="text-[11px] text-ink-500 mt-1">{new Date(h.created_at).toLocaleString()}</p>
                      </div>
                      <button onClick={() => deleteHeld(h.id)} className="text-ink-400 hover:text-danger p-1"><Trash2 size={15} /></button>
                    </div>
                    <button onClick={() => resumeCart(h.id)} className="mt-3 w-full btn-primary py-2">
                      <Play size={14} /> Resume
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Barcode scanner */}
      {selectedGroup && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent"><ScanLine size={18} /></div>
              <div>
                <p className="font-semibold leading-none">Barcode Scanner</p>
                <p className="text-xs text-ink-400 mt-1">Scan to add products to cart</p>
              </div>
            </div>
            <button onClick={scanning ? stopScanner : startScanner} className={scanning ? 'btn-danger' : 'btn-primary'}>
              {scanning ? <CameraOff size={16} /> : <Camera size={16} />} {scanning ? 'Stop' : 'Start'} Camera
            </button>
          </div>
          <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-950 border border-ink-800 max-w-md">
            <video ref={videoRef} className={`w-full h-full object-cover ${scanning ? 'block' : 'hidden'}`} />
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-8 inset-y-12 border-2 border-accent/70 rounded-lg" />
                <div className="absolute left-8 right-8 h-0.5 bg-accent scanline" style={{ top: '0%' }} />
                <div className="absolute top-2 left-2 badge bg-black/60 text-accent border border-accent/40"><span className="h-1.5 w-1.5 rounded-full bg-accent pulse-glow" /> Scanning</div>
              </div>
            )}
            {!scanning && (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div><Camera size={36} className="mx-auto text-ink-600" /><p className="mt-2 text-sm text-ink-400">Camera is off. Press Start to scan.</p></div>
              </div>
            )}
          </div>
          {scanError && <p className="mt-3 text-sm text-danger">{scanError}</p>}
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); addByBarcode(manualBarcode); setManualBarcode(''); }}>
            <div className="relative flex-1 max-w-md">
              <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Enter barcode manually" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} />
            </div>
            <button type="submit" className="btn-ghost"><Plus size={16} /> Add</button>
          </form>
        </div>
      )}

      {/* New group modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !groupBusy && setShowNewGroupModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-md p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold">New Group</p>
              <button onClick={() => setShowNewGroupModal(false)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Group name *</label>
                <input className="input" value={newGroupName} onChange={(e) => { setNewGroupName(e.target.value); setGroupError(null); }} placeholder="e.g. Laptops" autoFocus />
              </div>
              <ImagePicker
                value={newGroupImage}
                onChange={(url) => { setNewGroupImage(url); setGroupWarning(null); setGroupWarningConfirmed(false); }}
                label="Group image (optional)"
              />
              {groupWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {groupWarning}
                </div>
              )}
              {groupError && <p className="text-sm text-danger">{groupError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNewGroupModal(false)} className="btn-ghost" disabled={groupBusy}>Cancel</button>
              <button onClick={handleCreateGroup} className="btn-primary" disabled={groupBusy}>
                {groupBusy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit group modal */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !groupBusy && setEditingGroup(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-md max-h-[90vh] overflow-y-auto p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold">Group Settings</p>
              <button onClick={() => setEditingGroup(null)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Group name *</label>
                <input className="input" value={editGroupName} onChange={(e) => { setEditGroupName(e.target.value); setGroupError(null); }} autoFocus />
              </div>
              <ImagePicker
                value={editGroupImage}
                onChange={(url) => { setEditGroupImage(url); setGroupWarning(null); setGroupWarningConfirmed(false); }}
                label="Group image"
              />
              {groupWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {groupWarning}
                </div>
              )}
              {groupError && <p className="text-sm text-danger">{groupError}</p>}
            </div>

            {/* Delete section */}
            {!deleteGroupConfirm ? (
              <button onClick={() => setDeleteGroupConfirm(true)} className="mt-4 flex items-center gap-2 text-sm text-danger hover:text-danger-700">
                <Trash2 size={15} /> Delete this group
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-danger-700/40 bg-danger-700/10 p-3 space-y-2">
                <p className="text-sm text-danger font-semibold">Are you sure? Products in this group will become unassigned.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteGroupConfirm(false)} className="btn-ghost flex-1" disabled={groupBusy}>Cancel</button>
                  <button onClick={handleDeleteGroup} className="btn-danger flex-1" disabled={groupBusy}>
                    {groupBusy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-ink-800">
              <button onClick={() => setEditingGroup(null)} className="btn-ghost" disabled={groupBusy}>Cancel</button>
              <button onClick={handleSaveGroup} className="btn-primary" disabled={groupBusy}>
                {groupBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign product modal */}
      {showAssignModal && selectedGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !assignBusy && setShowAssignModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900 z-10">
              <p className="font-semibold">Assign products to {selectedGroup.name}</p>
              <button onClick={() => setShowAssignModal(false)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-9" placeholder="Search products…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredAssignable.length === 0 && (
                  <p className="text-center text-sm text-ink-400 py-8">No products found.</p>
                )}
                {filteredAssignable.map((p) => {
                  const inThisGroup = p.group_id === selectedGroup.id;
                  const group = groups.find((g) => g.id === p.group_id);
                  return (
                    <div key={p.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${inThisGroup ? 'border-accent/50 bg-accent/10 shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.15)]' : 'border-ink-800 bg-ink-850'}`}>
                      <Package size={16} className="text-ink-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-ink-400 truncate">{p.brand ?? 'No brand'} · {p.sale_price.toFixed(2)} DH · Qty: {p.quantity}</p>
                        <p className="text-[10px] mt-0.5">
                          {inThisGroup ? (
                            <span className="text-accent font-semibold">In this group</span>
                          ) : group ? (
                            <span className="text-ink-400">In: {group.name}</span>
                          ) : (
                            <span className="text-warning">Unassigned</span>
                          )}
                        </p>
                      </div>
                      <span className={`badge text-[10px] ${stockBadge(p.quantity)}`}>{p.quantity}</span>
                      {assignBusy === p.id ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink-700 border-t-accent" />
                      ) : inThisGroup ? (
                        <button onClick={() => handleUnassignProduct(p.id)} className="rounded-md bg-ink-700 px-3 py-1.5 text-xs font-semibold text-ink-200 hover:bg-ink-600">
                          Remove
                        </button>
                      ) : (
                        <button onClick={() => handleAssignProduct(p.id)} className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20">
                          Assign
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete product confirmation */}
      {confirmDeleteProduct && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => !deleteProductBusy && setConfirmDeleteProduct(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-danger-700/15 text-danger"><AlertTriangle size={20} /></div>
              <p className="font-semibold">Delete product?</p>
            </div>
            <p className="text-sm text-ink-300 mb-5">Are you sure you want to delete <span className="font-semibold text-ink-100">{confirmDeleteProduct.name}</span>? This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteProduct(null)} className="btn-ghost" disabled={deleteProductBusy}>Cancel</button>
              <button onClick={handleDeleteProduct} className="btn-danger" disabled={deleteProductBusy}>
                {deleteProductBusy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product add/edit modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !productBusy && setShowProductModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900 z-10">
              <p className="font-semibold">{editingProductId ? 'Edit Product' : 'New Product'}</p>
              <button onClick={() => setShowProductModal(false)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Required fields */}
              <div>
                <label className="label">Product name *</label>
                <input className="input" value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} placeholder="e.g. Dell XPS 15" />
              </div>
              <div>
                <label className="label">Barcode *</label>
                <div className="relative">
                  <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" value={productDraft.barcode} onChange={(e) => setProductDraft({ ...productDraft, barcode: e.target.value })} placeholder="e.g. 8901234567890" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Sale price (DH) *</label>
                  <input type="number" min={0} step="0.01" className="input" value={productDraft.sale_price} onChange={(e) => setProductDraft({ ...productDraft, sale_price: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="label">Quantity *</label>
                  <input type="number" min={0} className="input" value={productDraft.quantity} onChange={(e) => setProductDraft({ ...productDraft, quantity: e.target.value })} placeholder="0" />
                </div>
              </div>

              {/* Image field */}
              <ImagePicker
                value={productDraft.image_url}
                onChange={(url) => { setProductDraft({ ...productDraft, image_url: url }); setProductWarning(null); setProductWarningConfirmed(false); }}
                label="Product image (optional)"
              />
              {productWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {productWarning}
                </div>
              )}

              {/* Custom fields added by user */}
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

              {/* Add custom field by name */}
              <div className="pt-2 border-t border-ink-800">
                <p className="text-xs text-ink-400 mb-2">Add a custom field:</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Field name (e.g. Color, Weight…)"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
                  />
                  <button onClick={addCustomField} className="btn-ghost shrink-0">
                    <Plus size={16} /> Add field
                  </button>
                </div>
              </div>

              {productError && <p className="text-sm text-danger">{productError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-800 sticky bottom-0 bg-ink-900">
              <button onClick={() => setShowProductModal(false)} className="btn-ghost" disabled={productBusy}>Cancel</button>
              <button onClick={saveProduct} className="btn-primary" disabled={productBusy}>
                {productBusy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {editingProductId ? 'Save changes' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card auth modal */}
      {cardModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => setCardModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><CreditCard size={20} /></div>
              <div><p className="font-semibold">Card Payment</p><p className="text-xs text-ink-400">Enter the TPE Reference / Auth Code</p></div>
            </div>
            <input autoFocus className="input mb-4" placeholder="e.g. AUTH-12345" value={cardAuthRef} onChange={(e) => setCardAuthRef(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setCardModal(false); setCardAuthRef(''); }} className="btn-ghost">Cancel</button>
              <button onClick={() => doCheckout(cardAuthRef.trim() || null)} className="btn-primary" disabled={checkoutBusy}>
                {checkoutBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receipt && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 print-overlay" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-sm bg-white text-neutral-900 rounded-lg shadow-2xl overflow-hidden print-receipt" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 no-print">
              <div className="flex items-center gap-2"><Receipt size={18} className="text-neutral-700" /><p className="font-bold text-sm">Receipt</p></div>
              <button onClick={() => setReceipt(null)} className="text-neutral-400 hover:text-neutral-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 text-center border-b border-dashed border-neutral-300">
              <p className="font-bold text-base">BZ POS</p>
              <p className="text-xs text-neutral-500">Bouznad Electronic Store</p>
              <p className="text-xs text-neutral-400 mt-1">{receipt.date}</p>
              <p className="text-xs text-neutral-500">Invoice: {receipt.invoiceNumber}</p>
              <p className="text-xs text-neutral-500">Customer: {receipt.customerName}</p>
            </div>
            <div className="px-5 py-3 border-b border-dashed border-neutral-300">
              {receipt.items.map((it, i) => (
                <div key={i} className="mb-2">
                  <div className="flex justify-between text-xs"><span className="font-semibold">{it.name}</span><span>{(it.unit_price * it.quantity).toFixed(2)} DH</span></div>
                  <div className="flex justify-between text-xs text-neutral-500"><span>{it.quantity} × {it.unit_price.toFixed(2)} DH</span>{it.serial_number && <span>SN: {it.serial_number}</span>}</div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-xs space-y-1 border-b border-dashed border-neutral-300">
              <div className="flex justify-between"><span>Subtotal</span><span>{receipt.subtotal.toFixed(2)} DH</span></div>
              {receipt.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{receipt.discount.toFixed(2)} DH</span></div>}
              <div className="flex justify-between font-bold text-sm pt-1"><span>Total</span><span>{receipt.total.toFixed(2)} DH</span></div>
              <div className="flex justify-between text-neutral-500"><span>Payment</span><span className="capitalize">{receipt.paymentMethod}</span></div>
              {receipt.cardAuthRef && <div className="flex justify-between text-neutral-500"><span>Auth Ref</span><span className="font-mono">{receipt.cardAuthRef}</span></div>}
            </div>
            <div className="px-5 py-3 text-center no-print">
              <p className="text-xs text-neutral-500 mb-3">Thank you for your purchase!</p>
              <button onClick={printReceipt} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900">
                <Printer size={14} /> Print
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
