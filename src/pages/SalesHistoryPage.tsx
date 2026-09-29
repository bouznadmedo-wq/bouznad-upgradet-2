import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSales, getSaleItems, type Sale, type SaleItem } from '@/lib/db';
import { useAuth } from '@/context/AuthContext';
import { Receipt, Search, Eye, X, Loader2, User, CreditCard, Banknote, Calendar, Hash, Printer } from 'lucide-react';

export default function SalesHistoryPage() {
  const { isAdmin } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [printData, setPrintData] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSales();
      setSales(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => {
      document.body.classList.remove('printing-receipt');
      setPrintData(null);
    };
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sales.filter((s) => {
      const matchesSearch =
        s.invoice_number.toLowerCase().includes(q) ||
        (s.customer_name ?? '').toLowerCase().includes(q) ||
        s.payment_method.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (dateFilter) {
        const d = new Date(s.created_at);
        const filter = new Date(dateFilter);
        if (d.toDateString() !== filter.toDateString()) return false;
      }
      return true;
    });
  }, [sales, search, dateFilter]);

  function printInvoice(sale: Sale, items: SaleItem[]) {
    setPrintData({ sale, items });
    setTimeout(() => {
      document.body.classList.add('printing-receipt');
      window.print();
    }, 50);
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Sales', value: String(sales.length), sub: 'all time', icon: Receipt, color: 'text-accent', glow: 'border-accent/40 shadow-[0_0_24px_-8px_rgba(34,211,238,0.55)]', bg: 'bg-accent/12' },
            { label: 'Avg. Sale', value: sales.length ? `${(sales.reduce((s, x) => s + x.total, 0) / sales.length).toFixed(2)} DH` : '0.00 DH', sub: 'per transaction', icon: Banknote, color: 'text-warning', glow: 'border-warning/40 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]', bg: 'bg-warning/12' },
            { label: 'Total Revenue', value: `${sales.reduce((s, x) => s + x.total, 0).toFixed(2)} DH`, sub: 'gross', icon: CreditCard, color: 'text-success', glow: 'border-success-700/40 shadow-[0_0_24px_-8px_rgba(52,211,153,0.55)]', bg: 'bg-success-700/12' },
          ].map((s) => (
            <div key={s.label} className={`card p-4 border ${s.glow} transition-transform hover:-translate-y-0.5`}>
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-ink-400">{s.label}</p><p className="mt-2 text-2xl font-bold font-mono">{s.value}</p><p className="mt-1 text-[11px] text-ink-500">{s.sub}</p></div>
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.bg} ${s.color}`}><s.icon size={18} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Search invoice, customer, or payment method…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input type="date" className="input pl-9 max-w-[180px]" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} title="Filter by date" />
            </div>
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="btn-ghost px-2 py-2 text-xs">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 grid place-items-center text-ink-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-400 border-b border-ink-800 bg-ink-850">
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold hidden md:table-cell">Customer</th>
                  <th className="px-4 py-3 font-semibold hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 font-semibold hidden lg:table-cell">Payment</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-ink-800/60 table-row-hover">
                    <td className="px-4 py-3 font-mono font-semibold text-accent">{s.invoice_number}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-300">{s.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-ink-300">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`badge capitalize ${s.payment_method === 'cash' ? 'bg-success-700/15 text-success border border-success-700/30' : 'bg-accent/10 text-accent border border-accent/30'}`}>{s.payment_method}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{s.total.toFixed(2)} DH</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => viewSale(s)} className="p-2 rounded-md text-ink-300 hover:bg-ink-800 hover:text-accent">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-400">No sales found.</td></tr>
                )}
              </tbody>
            </table>
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
                {viewing.sale.payment_method === 'card' && viewing.sale.card_auth_ref && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-accent/5 border border-accent/20 px-3.5 py-2.5 sm:col-span-2">
                    <CreditCard size={15} className="text-accent" />
                    <div><p className="text-[11px] text-ink-400">Card Auth Reference</p><p className="text-sm font-mono font-semibold text-accent">{viewing.sale.card_auth_ref}</p></div>
                  </div>
                )}
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
