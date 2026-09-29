import { useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, ScanLine, Package, Receipt, LogOut, Menu, X, ShieldCheck, UserCircle, Users, Layers, Home } from 'lucide-react';

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
    <div className="min-h-screen flex bg-ink-950 text-ink-100 no-print-root">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-64 transform bg-ink-900 border-r border-ink-800 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-ink-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg overflow-hidden">
                <img src="/assets/images/c08e1bac-aa1a-48da-9c70-a5993f28df8c.jpg" alt="BZ POS" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="font-bold tracking-tight leading-none">BZ POS</p>
                <p className="text-[10px] text-ink-400 mt-0.5">Bouznad Electronic Store</p>
              </div>
            </div>
            <button className="lg:hidden text-ink-300" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {nav.map((n) => {
              const isActive = page === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/30'
                      : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100 border border-transparent'
                  }`}
                >
                  <n.icon size={18} />
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div className="px-3 pb-4">
            <div className="rounded-xl border border-ink-800 bg-ink-850 p-3">
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
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-ink-800 hover:bg-ink-700 px-3 py-2 text-xs font-semibold text-ink-200"
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
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 h-16 px-4 sm:px-6 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-ink-300" onClick={() => setMobileOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <active.icon size={18} className="text-accent" />
              <h1 className="text-base font-semibold">{active.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${isAdmin ? 'bg-accent/10 text-accent border border-accent/30' : 'bg-ink-800 text-ink-300 border border-ink-700'}`}>
              {isAdmin ? <ShieldCheck size={12} /> : <UserCircle size={12} />}
              {profile?.role}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
