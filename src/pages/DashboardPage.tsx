import { useCallback, useEffect, useState } from 'react';
import { getSales, getProducts, getSaleItems, renumberInvoices, type Sale, type SaleItem } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import {
  TrendingUp, ShoppingBag, AlertTriangle, Receipt, ArrowUpRight, Boxes, Wallet, Database, Loader2, Check, ListOrdered, X, User, CreditCard, Calendar, Hash, Printer,
} from 'lucide-react';
import { createPortal } from 'react-dom';

export default function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [stockUnits, setStockUnits] = useState(0);
  const [lowStock, setLowStock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [renumbering, setRenumbering] = useState(false);
  const [renumberMsg, setRenumberMsg] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [printData, setPrintData] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, prods] = await Promise.all([getSales(), getProducts()]);
      setSales(s);
      setProductCount(prods.length);
      setStockUnits(prods.reduce((sum, p) => sum + p.quantity, 0));
      setLowStock(prods.filter((p) => p.quantity <= 3).length);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRenumber() {
    setRenumbering(true);
    setRenumberMsg(null);
    try {
      const { renumbered, skipped } = await renumberInvoices();
      if (skipped) {
        setRenumberMsg('Renumber skipped — invoices already in order.');
      } else {
        setRenumberMsg(`Renumbered ${renumbered} invoice${renumbered !== 1 ? 's' : ''}.`);
      }
      await load();
    } catch (e) {
      setRenumberMsg(e instanceof Error ? e.message : 'Renumbering failed.');
    } finally {
      setRenumbering(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await seedDatabase();
      if (res.skipped) {
        setSeedMsg('Database already has data — seeding skipped.');
      } else {
        setSeedMsg(`Created collections: ${res.created.join(', ')}`);
        await load();
      }
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : 'Seeding failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function viewSale(sale: Sale) {
    setItemsBusy(true);
    setViewing({ sale, items: [] });
    try {
      const items = await getSaleItems(sale.id);
      setViewing({ sale, items });
    } catch (e) {
      console.error(e);
    } finally {
      setItemsBusy(false);
    }
  }

  const now = new Date();
  const today = sales.filter((s) => new Date(s.created_at).toDateString() === now.toDateString());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = sales.filter((s) => new Date(s.created_at) >= weekAgo);

  const revenueToday = today.reduce((s, x) => s + x.total, 0);
  const revenueWeek = thisWeek.reduce((s, x) => s + x.total, 0);
  const avgSale = sales.length ? sales.reduce((s, x) => s + x.total, 0) / sales.length : 0;

  const days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const daySales = sales.filter((s) => new Date(s.created_at).toDateString() === d.toDateString());
    days.push({
      label: d.toLocaleDateString('en', { weekday: 'short' }),
      value: daySales.reduce((sum, x) => sum + x.total, 0),
    });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.value));

  function barHeight(value: number): string {
    if (value <= 0) return '0px';
    const pct = (value / maxDay) * 100;
    return `${pct}%`;
  }

  const recent = sales.slice(0, 6);

  function printInvoice(sale: Sale, items: SaleItem[]) {
    setPrintData({ sale, items });
    setTimeout(() => {
      document.body.classList.add('printing-receipt');
      window.print();
    }, 50);
  }

  useEffect(() => {
    const handler = () => {
      document.body.classList.remove('printing-receipt');
      setPrintData(null);
    };
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div>
          <p className="font-semibold text-lg">Store Overview</p>
          <p className="text-xs text-ink-400 mt-0.5">Performance and inventory at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          {renumberMsg && (
            <span className={`text-xs flex items-center gap-1.5 ${renumberMsg.includes('failed') ? 'text-danger' : renumberMsg.includes('skipped') ? 'text-warning' : 'text-success'}`}>
              {renumberMsg.includes('failed') ? <AlertTriangle size={13} /> : <Check size={13} />}
              {renumberMsg}
            </span>
          )}
          {seedMsg && (
            <span className={`text-xs flex items-center gap-1.5 ${seedMsg.includes('failed') || seedMsg.includes('skipped') ? 'text-warning' : 'text-success'}`}>
              {seedMsg.includes('failed') ? <AlertTriangle size={13} /> : <Check size={13} />}
              {seedMsg}
            </span>
          )}
          <button onClick={handleRenumber} disabled={renumbering} className="btn-ghost">
            {renumbering ? <Loader2 size={15} className="animate-spin" /> : <ListOrdered size={15} />}
            Renumber Invoices
          </button>
          <button onClick={handleSeed} disabled={seeding} className="btn-ghost">
            {seeding ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            Seed Database
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Revenue", value: `${revenueToday.toFixed(2)} DH`, sub: `${today.length} sales today`, trend: '+12%', icon: TrendingUp, color: 'text-success', glow: 'border-success-700/40 shadow-[0_0_24px_-8px_rgba(52,211,153,0.6)]', bg: 'bg-success-700/12' },
          { label: 'This Week', value: `${revenueWeek.toFixed(2)} DH`, sub: `${thisWeek.length} sales this week`, trend: '+8%', icon: TrendingUp, color: 'text-accent', glow: 'border-accent/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.6)]', bg: 'bg-accent/12' },
          { label: 'Avg. Sale', value: `${avgSale.toFixed(2)} DH`, sub: `${sales.length} total sales`, trend: '+3%', icon: ShoppingBag, color: 'text-warning', glow: 'border-warning/40 shadow-[0_0_24px_-8px_rgba(251,191,36,0.55)]', bg: 'bg-warning/12' },
          { label: 'Stock Units', value: String(stockUnits), sub: `${productCount} products`, trend: `${lowStock} low`, icon: Boxes, color: 'text-ink-200', glow: 'border-ink-700 shadow-card', bg: 'bg-ink-800' },
        ].map((s) => (
          <div key={s.label} className={`card p-5 border ${s.glow} transition-transform hover:-translate-y-0.5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-ink-400">{s.label}</p>
                <p className="mt-2 text-2xl font-bold font-mono">{loading ? '—' : s.value}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`badge ${s.bg} ${s.color} text-[10px]`}><ArrowUpRight size={10} /> {s.trend}</span>
                  <span className="text-[11px] text-ink-500">{s.sub}</span>
                </div>
              </div>
              <div className={`grid h-11 w-11 place-items-center rounded-xl ${s.bg} ${s.color}`}>
                <s.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-semibold tracking-tight">Revenue — Last 7 Days</p>
              <p className="text-xs text-ink-400 mt-0.5">Daily sales totals</p>
            </div>
            <span className="badge bg-success-700/12 text-success border border-success-700/30"><span className="h-1.5 w-1.5 rounded-full bg-success pulse-glow" /> Live</span>
          </div>
          <div className="flex items-end justify-between gap-2 h-48">
            {days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-accent-600 to-accent transition-all duration-500 hover:from-accent hover:to-accent-400 relative group"
                    style={{ height: barHeight(d.value), minHeight: d.value > 0 ? '6px' : '0px' }}
                  >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {d.value.toFixed(0)} DH
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-ink-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-warning/10 text-warning">
              <AlertTriangle size={18} />
            </div>
            <p className="font-semibold">Stock Health</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-3">
              <span className="text-sm text-ink-300">Total products</span>
              <span className="font-mono font-semibold">{productCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-3">
              <span className="text-sm text-ink-300">Units in stock</span>
              <span className="font-mono font-semibold">{stockUnits}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-danger-700/10 border border-danger-700/30 px-3.5 py-3">
              <span className="text-sm text-danger">Low / out of stock</span>
              <span className="font-mono font-semibold text-danger">{lowStock}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
          <div className="flex items-center gap-2.5">
            <Receipt size={18} className="text-accent" />
            <p className="font-semibold">Recent Sales</p>
          </div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-ink-400">Loading…</div>
        ) : recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-850 border-b border-ink-800">
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold hidden sm:table-cell">Customer</th>
                  <th className="px-5 py-3 font-semibold hidden md:table-cell">Date</th>
                  <th className="px-5 py-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-b border-ink-800/60 table-row-hover cursor-pointer" onClick={() => viewSale(s)}>
                    <td className="px-5 py-3 font-mono text-accent">{s.invoice_number}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-ink-300">{s.customer_name || 'Walk-in'}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-ink-300">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">{s.total.toFixed(2)} DH</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-ink-400">
            <Wallet size={32} className="mx-auto mb-2 text-ink-600" />
            No sales yet. Complete a sale from the POS to see it here.
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => !itemsBusy && setViewing(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 sticky top-0 bg-ink-900 z-10">
              <div className="flex items-center gap-2.5">
                <Receipt size={18} className="text-accent" />
                <p className="font-semibold">Invoice {viewing.sale.invoice_number}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-ink-300 hover:text-ink-100"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4">
              <button
                onClick={() => printInvoice(viewing.sale, viewing.items)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/10 border border-accent/30 text-accent py-2.5 text-sm font-medium hover:bg-accent/20 transition-colors"
              >
                <Printer size={16} />
                Print Receipt
              </button>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-2.5">
                  <User size={15} className="text-ink-400" />
                  <div><p className="text-[11px] text-ink-400">Customer</p><p className="text-sm font-medium">{viewing.sale.customer_name || 'Walk-in'}</p></div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-2.5">
                  <Calendar size={15} className="text-ink-400" />
                  <div><p className="text-[11px] text-ink-400">Date</p><p className="text-sm font-medium">{new Date(viewing.sale.created_at).toLocaleString()}</p></div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-2.5">
                  <CreditCard size={15} className="text-ink-400" />
                  <div><p className="text-[11px] text-ink-400">Payment</p><p className="text-sm font-medium capitalize">{viewing.sale.payment_method}</p></div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 border border-ink-800 px-3.5 py-2.5">
                  <Hash size={15} className="text-ink-400" />
                  <div><p className="text-[11px] text-ink-400">Items</p><p className="text-sm font-medium">{viewing.items.length}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-ink-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-ink-400 bg-ink-850 border-b border-ink-800">
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 font-semibold hidden sm:table-cell">Serial / Specs</th>
                      <th className="px-4 py-2.5 font-semibold text-center">Qty</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsBusy ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-400"><Loader2 className="animate-spin inline" /></td></tr>
                    ) : viewing.items.length ? (
                      viewing.items.map((it) => (
                        <tr key={it.id} className="border-b border-ink-800/60">
                          <td className="px-4 py-3">
                            <p className="font-medium">{it.product_name}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-ink-300 text-xs">
                            {it.serial_number && <p>SN: {it.serial_number}</p>}
                            {it.specs && <p className="text-ink-400">{it.specs}</p>}
                          </td>
                          <td className="px-4 py-3 text-center">{it.quantity}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">{it.line_total.toFixed(2)} DH</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-400">No items.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-ink-300"><span>Subtotal</span><span className="font-mono">{viewing.sale.subtotal.toFixed(2)} DH</span></div>
                <div className="flex justify-between text-ink-300"><span>Discount</span><span className="font-mono">-{viewing.sale.discount.toFixed(2)} DH</span></div>
                <div className="flex justify-between text-ink-300"><span>Tax</span><span className="font-mono">{viewing.sale.tax.toFixed(2)} DH</span></div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-ink-800"><span>Total</span><span className="font-mono text-accent">{viewing.sale.total.toFixed(2)} DH</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {printData && createPortal(
        <div className="print-overlay">
          <div className="print-receipt bg-white text-neutral-900 p-4">
            <div className="text-center mb-3 pb-3 border-b border-dashed border-neutral-300">
              <p className="font-bold text-base">BZ POS</p>
              <p className="text-xs text-neutral-500">Bouznad Electronic Store</p>
              <p className="text-xs text-neutral-400 mt-1">{new Date(printData.sale.created_at).toLocaleString()}</p>
              <p className="text-xs text-neutral-500">Invoice: {printData.sale.invoice_number}</p>
              <p className="text-xs text-neutral-500">Customer: {printData.sale.customer_name || 'Walk-in'}</p>
            </div>
            <div className="py-2 border-b border-dashed border-neutral-300">
              {printData.items.map((it, i) => (
                <div key={i} className="mb-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{it.product_name}</span>
                    <span>{it.line_total.toFixed(2)} DH</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>{it.quantity} × {it.unit_price.toFixed(2)} DH</span>
                    {it.serial_number && <span>SN: {it.serial_number}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="py-2 text-xs space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{printData.sale.subtotal.toFixed(2)} DH</span></div>
              {printData.sale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{printData.sale.discount.toFixed(2)} DH</span></div>}
              {printData.sale.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{printData.sale.tax.toFixed(2)} DH</span></div>}
              <div className="flex justify-between font-bold text-sm pt-1"><span>Total</span><span>{printData.sale.total.toFixed(2)} DH</span></div>
              <div className="flex justify-between text-neutral-500"><span>Payment</span><span className="capitalize">{printData.sale.payment_method}</span></div>
              {printData.sale.payment_method === 'card' && printData.sale.card_auth_ref && (
                <div className="flex justify-between text-neutral-500"><span>Auth Ref</span><span className="font-mono">{printData.sale.card_auth_ref}</span></div>
              )}
            </div>
            <p className="text-center text-xs text-neutral-500 mt-3">Thank you for your purchase!</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
