import { useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, ScanLine, Package, Receipt, LogOut, Menu, X, ShieldCheck, UserCircle, Users, Layers, Home, Search, Bell, Moon, ChevronDown, Sparkles } from 'lucide-react';

export type Page = 'home' | 'dashboard' | 'pos' | 'inventory' | 'sales' | 'groups' | 'users';

export default function AppShell({
  page,
  onNavigate,
  children,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  children: ReactNode;
}) {
  const { profile, signOut, isAdmin, isCashier } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allNav: { id: Page; label: string; icon: typeof LayoutDashboard; show: boolean }[] = [
    { id: 'home', label: 'Home', icon: Home, show: true },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: isAdmin },
    { id: 'pos', label: 'POS / Scanner', icon: ScanLine, show: true },
    { id: 'inventory', label: 'Inventory', icon: Package, show: isAdmin },
    { id: 'sales', label: 'Sales History', icon: Receipt, show: true },
    { id: 'groups', label: 'Groups', icon: Layers, show: isAdmin },
    { id: 'users', label: 'User Management', icon: Users, show: isAdmin },
  ];
  const nav = allNav.filter((n) => n.show);

  const active = nav.find((n) => n.id === page) ?? nav[0];

  function go(p: Page) {
    onNavigate(p);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen flex bg-app text-ink-100 no-print-root">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-[236px] transform sidebar-surface border-r border-ink-800/80 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-4 h-[72px] border-b border-ink-800/80">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl overflow-hidden ring-1 ring-accent/30 shadow-glow-sm">
                <img src="/assets/images/c08e1bac-aa1a-48da-9c70-a5993f28df8c.jpg" alt="BZ POS" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="font-bold tracking-tight leading-none text-[15px]">BZ POS</p>
                <p className="text-[10px] text-ink-400 mt-0.5">Bouznad Electronic Store</p>
              </div>
            </div>
            <button className="lg:hidden text-ink-300" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="px-4 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">Workspace</div>
          <nav className="flex-1 px-3 space-y-1">
            {nav.map((n) => {
              const isActive = page === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'nav-active text-accent border border-accent/50'
                      : 'text-ink-300 hover:bg-ink-850/80 hover:text-ink-100 border border-transparent'
                  }`}
                >
                  <n.icon size={18} />
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto px-3 pb-3">
            <div className="promo-card mb-3 rounded-2xl border border-accent/20 p-3.5 overflow-hidden relative">
              <Sparkles size={15} className="text-accent mb-2" />
              <p className="text-sm font-bold text-ink-100">Better store management</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">Keep every sale, product, and customer in sync.</p>
            </div>
            <div className="rounded-2xl border border-ink-700/80 bg-ink-850/90 p-3 shadow-card">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink-700 text-ink-100">
                  {isAdmin ? <ShieldCheck size={18} className="text-accent" /> : <UserCircle size={18} />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{profile?.full_name || profile?.email}</p>
                  <p className="text-[11px] text-ink-400 capitalize">{profile?.role}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-ink-800 hover:bg-ink-700 px-3 py-2 text-xs font-semibold text-ink-200 transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 h-[72px] px-4 sm:px-7 border-b border-ink-800/80 bg-app/85 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-ink-300" onClick={() => setMobileOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent border border-accent/20"><active.icon size={16} /></div>
              <div><h1 className="text-base font-semibold tracking-tight">{active.label}</h1><p className="hidden sm:block text-[11px] text-ink-500">Bouznad Electronic Store / Workspace</p></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-ink-700/80 bg-ink-900/70 px-3 py-2 text-xs text-ink-500 w-56 lg:w-64">
              <Search size={14} className="text-ink-400" /><span className="flex-1">Search anything...</span><kbd className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400">⌘ K</kbd>
            </div>
            <button className="relative grid h-9 w-9 place-items-center rounded-xl border border-ink-700/80 bg-ink-900/70 text-ink-300 hover:text-accent hover:border-accent/40 transition-colors"><Bell size={16} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger shadow-[0_0_8px_rgba(248,113,113,0.8)]" /></button>
            <button className="hidden sm:grid h-9 w-9 place-items-center rounded-xl border border-ink-700/80 bg-ink-900/70 text-ink-300 hover:text-accent transition-colors"><Moon size={16} /></button>
            <div className="flex items-center gap-2 rounded-xl border border-ink-700/80 bg-ink-900/70 px-2 py-1.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-ink-950 text-xs font-bold">{(profile?.full_name || profile?.email || 'A').slice(0, 1).toUpperCase()}</div>
              <span className="hidden sm:block text-xs font-semibold capitalize">{profile?.role}</span><ChevronDown size={13} className="text-ink-500" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 page-canvas">{children}</main>
      </div>
    </div>
  );
}
