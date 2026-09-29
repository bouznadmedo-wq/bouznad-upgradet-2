import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppShell, { type Page } from '@/components/AppShell';
import AuthPage from '@/pages/AuthPage';
import HomePage from '@/pages/HomePage';
import POSPage from '@/pages/POSPage';
import InventoryPage from '@/pages/InventoryPage';
import SalesHistoryPage from '@/pages/SalesHistoryPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import GroupsPage from '@/pages/GroupsPage';
import { Loader2 } from 'lucide-react';

function Shell() {
  const { session, profile, loading, isAdmin } = useAuth();
  const [page, setPage] = useState<Page>('home');

  useEffect(() => {
    if (profile?.role === 'cashier') setPage('home');
    else if (profile?.role === 'admin') setPage('home');
  }, [profile?.role]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink-950 text-ink-300">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthPage />;
  }

  // Guard: cashier cannot reach admin-only pages (Dashboard = profits, Inventory = materials).
  let effectivePage = page;
  if (!isAdmin && (page === 'dashboard' || page === 'inventory' || page === 'users' || page === 'groups')) {
    effectivePage = 'home';
  }

  return (
    <AppShell page={effectivePage} onNavigate={setPage}>
      {effectivePage === 'home' && <HomePage />}
      {effectivePage === 'dashboard' && <DashboardPage />}
      {effectivePage === 'pos' && <POSPage />}
      {effectivePage === 'inventory' && <InventoryPage />}
      {effectivePage === 'sales' && <SalesHistoryPage />}
      {effectivePage === 'groups' && <GroupsPage />}
      {effectivePage === 'users' && <UsersPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
