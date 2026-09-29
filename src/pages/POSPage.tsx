import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useAuth } from '@/context/AuthContext';
import {
  getProducts, createSale, decrementStock, getHeldCarts, addHeldCart, deleteHeldCart, getNextInvoiceNumber, getGroups,
  type Product, type CartItem, type HeldCart, type Group,
} from '@/lib/db';
import {
  ScanLine, Camera, CameraOff, Search, Plus, Minus, Trash2, Pause, Play, X,
  Package, Barcode, Receipt, Check, Loader2, ShoppingCart, Tag, User, Printer, CreditCard,
} from 'lucide-react';

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

export default function POSPage() {
  const { profile } = useAuth();
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) as CartItem[] : [];
    } catch { return []; }
  });
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [search, setSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('pos_customer') ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>(() => (localStorage.getItem('pos_payment_method') as 'cash' | 'card') ?? 'cash');
  const [discount, setDiscount] = useState(() => Number(localStorage.getItem('pos_discount')) || 0);
  const [taxRate] = useState(0); // kept for type compat but not displayed
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMsg, setCheckoutMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editingSerial, setEditingSerial] = useState<number | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [groups, setGroups] = useState<Group[]>([]);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [cardAuthRef, setCardAuthRef] = useState('');

  const CART_KEY = 'pos_cart';
  const CUST_KEY = 'pos_customer';
  const DISC_KEY = 'pos_discount';
  const PM_KEY = 'pos_payment_method';

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const loadData = useCallback(async () => {
    const [prods, held, grps] = await Promise.all([
      getProducts(),
      profile ? getHeldCarts(profile.id) : Promise.resolve([] as HeldCart[]),
      getGroups(),
    ]);
    setProducts(prods);
    setHeldCarts(held);
    setGroups(grps);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => { localStorage.setItem('pos_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('pos_customer', customerName); }, [customerName]);
  useEffect(() => { localStorage.setItem('pos_discount', String(discount)); }, [discount]);
  useEffect(() => { localStorage.setItem('pos_payment_method', paymentMethod); }, [paymentMethod]);

  const stopScanner = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop?.();
      controlsRef.current = null;
    }
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScanError(null);
    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      const reader = readerRef.current;
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices.length) {
        setScanError('No camera found on this device.');
        return;
      }
      const deviceId = devices[0].deviceId;
      setScanning(true);
      controlsRef.current = reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
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

  useEffect(() => {
    const handler = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  useEffect(() => {
    if (!scanning) return;
    return () => stopScanner();
  }, [scanning, stopScanner]);

  function getStockFor(productId: string): number {
    return products.find((p) => p.id === productId)?.quantity ?? 0;
  }

  function addToCart(p: Product) {
    const stock = p.quantity;
    const inCart = cart.find((c) => c.product_id === p.id)?.quantity ?? 0;
    if (inCart + 1 > stock) {
      setCheckoutMsg({ kind: 'err', text: 'Invalid request: Quantity exceeds available stock.' });
      return;
    }
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.product_id === p.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      const specs = [p.cpu, p.ram, p.storage].filter(Boolean).join(' · ');
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          brand: p.brand,
          barcode: p.barcode,
          group_id: p.group_id,
          unit_price: p.sale_price,
          quantity: 1,
          serial_number: '',
          specs: specs || p.specs || '',
        },
      ];
    });
    setCheckoutMsg(null);
  }

  async function addByBarcode(code: string) {
    const codeTrim = code.trim();
    if (!codeTrim) return;
    const prod = products.find((p) => p.barcode === codeTrim);
    if (!prod) {
      setCheckoutMsg({ kind: 'err', text: `No product matches barcode ${codeTrim}.` });
      return;
    }
    if (prod.quantity <= 0) {
      setCheckoutMsg({ kind: 'err', text: `${prod.name} is out of stock.` });
      return;
    }
    addToCart(prod);
  }

  function changeQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const q = next[idx].quantity + delta;
      if (q <= 0) {
        next.splice(idx, 1);
      } else {
        const stock = getStockFor(next[idx].product_id);
        if (q > stock) {
          setCheckoutMsg({ kind: 'err', text: 'Invalid request: Quantity exceeds available stock.' });
          return prev;
        }
        next[idx] = { ...next[idx], quantity: q };
      }
      return next;
    });
  }

  function setQtyDirect(idx: number, value: string) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return;
    setCart((prev) => {
      const next = [...prev];
      if (n === 0) {
        next.splice(idx, 1);
        return next;
      }
      const stock = getStockFor(next[idx].product_id);
      if (n > stock) {
        setCheckoutMsg({ kind: 'err', text: 'Invalid request: Quantity exceeds available stock.' });
        return prev;
      }
      next[idx] = { ...next[idx], quantity: n };
      return next;
    });
  }

  function removeItem(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  function setSerial(idx: number, serial: string) {
    setCart((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], serial_number: serial };
      return next;
    });
  }

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const tax = 0;
  const total = Math.max(0, subtotal - discount);

  async function holdCart() {
    if (!cart.length || !profile) return;
    const label = customerName ? `Cart — ${customerName}` : `Held Cart ${heldCarts.length + 1}`;
    const created = await addHeldCart(profile.id, label, cart);
    setHeldCarts((prev) => [created, ...prev]);
    setCart([]);
    setCustomerName('');
    setDiscount(0);
    setShowHeld(false);
    localStorage.removeItem('pos_cart');
    localStorage.removeItem('pos_customer');
    localStorage.removeItem('pos_discount');
  }

  async function resumeCart(id: string) {
    const held = heldCarts.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart_data);
    setCustomerName(held.label.replace(/^Cart — /, '').replace(/^Held Cart \d+$/, ''));
    await deleteHeldCart(id);
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
    setShowHeld(false);
  }

  async function deleteHeld(id: string) {
    await deleteHeldCart(id);
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
  }

  async function checkout() {
    if (!cart.length || !profile) return;
    if (paymentMethod === 'card') {
      setCardModal(true);
      return;
    }
    await doCheckout(null);
  }

  async function doCheckout(authRef: string | null) {
    if (!cart.length || !profile) return;
    setCheckoutBusy(true);
    setCheckoutMsg(null);
    setCardModal(false);
    try {
      const invoiceNumber = await getNextInvoiceNumber();
      await createSale(
        {
          invoice_number: invoiceNumber,
          cashier_id: profile.id,
          customer_name: customerName || null,
          subtotal,
          tax,
          discount,
          total,
          payment_method: paymentMethod,
          card_auth_ref: authRef,
        },
        cart.map((c) => ({
          product_id: c.product_id,
          product_name: c.name,
          barcode: c.barcode,
          serial_number: c.serial_number || null,
          specs: c.specs || null,
          unit_price: c.unit_price,
          quantity: c.quantity,
          line_total: c.unit_price * c.quantity,
        })),
      );

      for (const c of cart) {
        await decrementStock(c.product_id, c.quantity);
      }

      await loadData();
      setCheckoutMsg({ kind: 'ok', text: `Sale ${invoiceNumber} completed.` });
      setReceipt({
        invoiceNumber,
        customerName: customerName || 'Walk-in',
        items: cart,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        cardAuthRef: authRef,
        cashierName: profile.full_name ?? profile.email,
        date: new Date().toLocaleString(),
      });
      setCart([]);
      setCustomerName('');
      setDiscount(0);
      setCardAuthRef('');
      localStorage.removeItem('pos_cart');
      localStorage.removeItem('pos_customer');
      localStorage.removeItem('pos_discount');
    } catch (e) {
      setCheckoutMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Checkout failed.' });
    } finally {
      setCheckoutBusy(false);
    }
  }

  function printReceipt() {
    document.body.classList.add('printing-receipt');
    window.print();
  }

  const categories = ['All', ...groups.map((g) => g.name)];

  const filteredGroups = groupSearch.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
    : groups;

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = (
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    );
    const groupName = groups.find((g) => g.id === p.group_id)?.name;
    const matchesCategory = activeCategory === 'All' || groupName === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="grid lg:grid-cols-[1fr_460px] gap-5 h-full">
      <div className="space-y-5 min-w-0">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                <ScanLine size={18} />
              </div>
              <div>
                <p className="font-semibold leading-none">Barcode Scanner</p>
                <p className="text-xs text-ink-400 mt-1">Point the camera at a product barcode</p>
              </div>
            </div>
            <button onClick={scanning ? stopScanner : startScanner} className={scanning ? 'btn-danger' : 'btn-primary'}>
              {scanning ? <CameraOff size={16} /> : <Camera size={16} />}
              {scanning ? 'Stop' : 'Start'} Camera
            </button>
          </div>

          <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-950 border border-ink-800">
            <video ref={videoRef} className={`w-full h-full object-cover ${scanning ? 'block' : 'hidden'}`} />
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-x-8 inset-y-12 border-2 border-accent/70 rounded-lg" />
                <div className="absolute left-8 right-8 h-0.5 bg-accent scanline" style={{ top: '0%' }} />
                <div className="absolute top-2 left-2 badge bg-black/60 text-accent border border-accent/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-glow" /> Scanning
                </div>
              </div>
            )}
            {!scanning && (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <Camera size={40} className="mx-auto text-ink-600" />
                  <p className="mt-3 text-sm text-ink-400">Camera is off. Press Start to scan barcodes.</p>
                </div>
              </div>
            )}
          </div>

          {scanError && <p className="mt-3 text-sm text-danger">{scanError}</p>}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); addByBarcode(manualBarcode); setManualBarcode(''); }}
          >
            <div className="relative flex-1">
              <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Enter barcode manually" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} />
            </div>
            <button type="submit" className="btn-ghost"><Plus size={16} /> Add</button>
          </form>
        </div>

        <div className="card p-5">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800 text-ink-200">
                <Package size={18} />
              </div>
              <p className="font-semibold">Products</p>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search groups…" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
            </div>
          </div>

          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setActiveCategory('All')}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeCategory === 'All'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700 hover:bg-ink-800'
                }`}
              >
                <Package size={13} /> All
              </button>
              {filteredGroups.map((g) => {
                const active = activeCategory === g.name;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveCategory(g.name)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700 hover:bg-ink-800'
                    }`}
                  >
                    <Package size={13} /> {g.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 max-h-[680px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const out = p.quantity <= 0;
              return (
                <button
                  key={p.id}
                  disabled={out}
                  onClick={() => addToCart(p)}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    out ? 'border-ink-800 bg-ink-900/40 opacity-50 cursor-not-allowed'
                        : 'border-ink-800 bg-ink-850 hover:border-accent/40 hover:bg-ink-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-900">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center"><Package size={18} className="text-ink-600" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      <p className="text-xs text-ink-400 truncate">{p.brand}</p>
                      <p className="text-[11px] font-mono text-ink-500 truncate mt-0.5">{p.barcode || '—'}</p>
                    </div>
                    <span className={`badge ${out ? 'bg-danger-700/20 text-danger' : p.quantity <= 3 ? 'bg-warning/15 text-warning' : 'bg-success-700/15 text-success'}`}>
                      {out ? 'Out' : `${p.quantity}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-ink-400 truncate max-w-[60%]">{p.specs || p.cpu || '—'}</span>
                    <span className="font-mono font-semibold text-accent">{p.sale_price.toFixed(2)} DH</span>
                  </div>
                </button>
              );
            })}
            {!filteredProducts.length && (
              <p className="col-span-full text-center text-sm text-ink-400 py-8">No products found.</p>
            )}
          </div>
        </div>
      </div>

     <div className="card flex flex-col lg:sticky lg:top-20 h-[calc(100vh-8rem)] overflow-hidden">
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
              <ShoppingCart size={18} />
            </div>
            <div>
              <p className="font-semibold leading-none">Current Cart</p>
              <p className="text-xs text-ink-400 mt-1">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={() => setShowHeld(true)} className="relative btn-ghost px-3 py-2" title="Held carts">
            <Pause size={15} /> Held
            {heldCarts.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent text-ink-950 text-[10px] font-bold px-1">
                {heldCarts.length}
              </span>
            )}
          </button>
        </div>

        {/* Customer name — fixed */}
        <div className="px-5 py-3 border-b border-ink-800 shrink-0">
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
        </div>

        {/* Scrollable cart items — takes remaining space */}
        <div className="flex-1 overflow-y-auto max-h-[350px] px-4 py-3 scroll-smooth min-h-0">
          {cart.length === 0 ? (
            <div className="h-full grid place-items-center text-center px-6">
              <div>
                <ShoppingCart size={36} className="mx-auto text-ink-600" />
                <p className="mt-3 text-sm text-ink-400">Cart is empty. Scan a barcode or tap a product.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {cart.map((c, idx) => {
                const prod = products.find((p) => p.id === c.product_id);
                return (
                <li key={idx} className="rounded-xl border border-ink-800 bg-ink-850 p-3.5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-ink-800 bg-ink-900">
                      {prod?.image_url ? (
                        <img src={prod.image_url} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center"><Package size={18} className="text-ink-600" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      <p className="text-xs text-ink-400 truncate">{c.brand} · {c.specs}</p>
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-ink-400 hover:text-danger p-1">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="mt-2 space-y-2">
                    <button
                      onClick={() => setEditingSerial(editingSerial === idx ? null : idx)}
                      className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <Tag size={12} />
                      {c.serial_number ? `Serial: ${c.serial_number}` : 'Add serial number / specs'}
                    </button>
                    {editingSerial === idx && (
                      <input
                        autoFocus
                        className="input py-2 text-xs"
                        placeholder="e.g. SN-2024-A001 / Core i7, 16GB"
                        value={c.serial_number}
                        onChange={(e) => setSerial(idx, e.target.value)}
                        onBlur={() => setEditingSerial(null)}
                      />
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => changeQty(idx, -1)} className="grid h-8 w-8 place-items-center rounded-md bg-ink-800 hover:bg-ink-700 text-ink-200">
                        <Minus size={15} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={c.quantity}
                        onChange={(e) => setQtyDirect(idx, e.target.value)}
                        className="w-14 rounded-md bg-ink-800 border border-ink-700 px-2 py-1 text-center text-sm font-semibold text-ink-100 outline-none focus:border-accent"
                      />
                      <button onClick={() => changeQty(idx, 1)} className="grid h-8 w-8 place-items-center rounded-md bg-ink-800 hover:bg-ink-700 text-ink-200">
                        <Plus size={15} />
                      </button>
                    </div>
                    <span className="font-mono font-semibold text-sm">{(c.unit_price * c.quantity).toFixed(2)} DH</span>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — fixed, always visible */}
        <div className="border-t border-ink-800 p-4 space-y-3 bg-ink-900 shrink-0 overflow-y-auto max-h-[45vh]">
          {checkoutMsg && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${checkoutMsg.kind === 'ok' ? 'bg-success-700/15 text-success border border-success-700/30' : 'bg-danger-700/15 text-danger border border-danger-700/30'}`}>
              {checkoutMsg.kind === 'ok' ? <Check size={12} className="inline mr-1" /> : null}
              {checkoutMsg.text}
            </div>
          )}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-300"><span>Subtotal</span><span className="font-mono">{subtotal.toFixed(2)} DH</span></div>
            <div className="flex justify-between text-ink-300 items-center">
              <span>Discount</span>
              <input
                type="number"
                min={0}
                max={subtotal}
                value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, Math.min(subtotal, Number(e.target.value) || 0)))}
                className="w-24 rounded-md bg-ink-850 border border-ink-700 px-2 py-1 text-right font-mono text-sm outline-none focus:border-accent"
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-ink-800"><span>Total</span><span className="font-mono text-accent">{total.toFixed(2)} DH</span></div>
          </div>

          <div className="flex gap-2">
            {(['cash', 'card'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  paymentMethod === m ? 'border-accent bg-accent/10 text-accent' : 'border-ink-700 bg-ink-850 text-ink-300 hover:bg-ink-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={holdCart} disabled={!cart.length} className="btn-ghost flex-1">
              <Pause size={15} /> Hold
            </button>
            <button onClick={checkout} disabled={!cart.length || checkoutBusy} className="btn-success flex-[2]">
              {checkoutBusy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
              Complete Sale
            </button>
          </div>
          {/*<button onClick={printReceipt} disabled={!cart.length} className={`w-full flex items-center justify-center gap-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 px-3 py-2 text-xs font-semibold text-ink-200 disabled:opacity-40 ${!cart.length ? 'hidden' : ''}`}>
            <Printer size={14} /> Print Receipt
          </button>*/}
        </div>
      </div>

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
                <p className="text-center text-sm text-ink-400 py-10">No held carts.</p>
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

      {/* Card auth confirmation modal */}
      {cardModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => setCardModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><CreditCard size={20} /></div>
              <div>
                <p className="font-semibold">Card Payment</p>
                <p className="text-xs text-ink-400">Enter the TPE Reference / Auth Code</p>
              </div>
            </div>
            <input
              autoFocus
              className="input mb-4"
              placeholder="e.g. AUTH-12345"
              value={cardAuthRef}
              onChange={(e) => setCardAuthRef(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setCardModal(false); setCardAuthRef(''); }} className="btn-ghost">Cancel</button>
              <button
                onClick={() => doCheckout(cardAuthRef.trim() || null)}
                className="btn-primary"
                disabled={checkoutBusy}
              >
                {checkoutBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receipt && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 print-overlay">
          <div className="w-full max-w-sm bg-white text-neutral-900 rounded-lg shadow-2xl overflow-hidden print-receipt">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 no-print">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-neutral-700" />
                <p className="font-bold text-sm">Receipt</p>
              </div>
              <button onClick={() => setReceipt(null)} className="text-neutral-400 hover:text-neutral-700">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 text-center border-b border-dashed border-neutral-300">
              <p className="font-bold text-base">BZ POS</p>
              <p className="text-xs text-neutral-500">Bouznad Electronic Store</p>
              <p className="text-xs text-neutral-400 mt-1">{receipt.date}</p>
              <p className="text-xs text-neutral-500">Invoice: {receipt.invoiceNumber}</p>
              <p className="text-xs text-neutral-500">Customer: {receipt.customerName}</p>
            </div>

         <div className="px-5 py-3 border-b border-dashed border-neutral-300 max-h-[200px] overflow-y-auto print:max-h-none print:overflow-visible print:h-auto">
              {receipt.items.map((it, i) => (
                <div key={i} className="mb-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{it.name}</span>
                    <span>{(it.unit_price * it.quantity).toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>{it.quantity} × {it.unit_price.toFixed(2)} DH</span>
                    {it.serial_number && <span>SN: {it.serial_number}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 text-xs space-y-1 border-b border-dashed border-neutral-300">
              <div className="flex justify-between"><span>Subtotal</span><span>{receipt.subtotal.toFixed(2)} DH</span></div>
              {receipt.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{receipt.tax.toFixed(2)} DH</span></div>}
              {receipt.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{receipt.discount.toFixed(2)} DH</span></div>}
              <div className="flex justify-between font-bold text-sm pt-1"><span>Total</span><span>{receipt.total.toFixed(2)} DH</span></div>
              <div className="flex justify-between text-neutral-500"><span>Payment</span><span className="capitalize">{receipt.paymentMethod}</span></div>
              {receipt.cardAuthRef && (
                <div className="flex justify-between text-neutral-500"><span>Auth Ref</span><span className="font-mono">{receipt.cardAuthRef}</span></div>
              )}
            </div>

            <div className="px-5 py-3 text-center no-print">
              <p className="text-xs text-neutral-500 mb-3">Thank you for your purchase!</p>
              <button
                onClick={printReceipt}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-900"
              >
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
