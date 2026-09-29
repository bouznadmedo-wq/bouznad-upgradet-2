import { useCallback, useEffect, useState } from 'react';
import { getAllProfiles, updateProfileRole, deleteProfile, updateProfilePassword, type Profile, type Role } from '@/lib/db';
import { useAuth } from '@/context/AuthContext';
import { Users, ShieldCheck, UserCircle, Search, Loader2, Check, X, Trash2, KeyRound, Eye, EyeOff, Copy, Mail } from 'lucide-react';

export default function UsersPage() {
  const { profile: me, updateUserPassword, resetPassword } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<'ok' | 'err'>('ok');
  const [passwordModal, setPasswordModal] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [resetConfirm, setResetConfirm] = useState<Profile | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await getAllProfiles());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setMsgSafe(kind: 'ok' | 'err', text: string) {
    setMsgKind(kind);
    setMsg(text);
  }

  async function handleDelete(p: Profile) {
    if (p.id === me?.id) return;
    if (!confirm(`Remove ${p.email}? They will lose access immediately. The Firebase auth account remains and must be removed from the Firebase console if needed.`)) return;
    setBusyId(p.id);
    setMsg(null);
    try {
      await deleteProfile(p.id);
      setProfiles((prev) => prev.filter((x) => x.id !== p.id));
      setMsgSafe('ok', `${p.email} removed. They will be signed out automatically.`);
    } catch (e) {
      setMsgSafe('err', e instanceof Error ? e.message : 'Failed to remove user.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRole(p: Profile) {
    if (p.id === me?.id) return;
    const next: Role = p.role === 'admin' ? 'cashier' : 'admin';
    setBusyId(p.id);
    setMsg(null);
    try {
      await updateProfileRole(p.id, next);
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, role: next } : x)));
      setMsgSafe('ok', `${p.email} is now ${next}.`);
    } catch (e) {
      setMsgSafe('err', e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetPassword() {
    if (!passwordModal) return;
    if (newPassword.length < 6) {
      setMsgSafe('err', 'Password must be at least 6 characters.');
      return;
    }
    setPwBusy(true);
    setMsg(null);
    try {
      if (passwordModal.id === me?.id) {
        const res = await updateUserPassword(newPassword);
        if (res.error) { setMsgSafe('err', res.error); setPwBusy(false); return; }
      } else {
        await updateProfilePassword(passwordModal.id, newPassword);
      }
      setProfiles((prev) => prev.map((x) => (x.id === passwordModal.id ? { ...x, password: newPassword } : x)));
      setMsgSafe('ok', `Password updated for ${passwordModal.email}.`);
      setPasswordModal(null);
      setNewPassword('');
      setShowPassword(false);
    } catch (e) {
      setMsgSafe('err', e instanceof Error ? e.message : 'Failed to update password.');
    } finally {
      setPwBusy(false);
    }
  }

  async function handleResetEmail(p: Profile) {
    setResetBusy(true);
    setMsg(null);
    const res = await resetPassword(p.email);
    setResetBusy(false);
    setResetConfirm(null);
    if (res.error) {
      setMsgSafe('err', res.error);
    } else {
      setMsgSafe('ok', `Password reset email sent to ${p.email}.`);
    }
  }

  function togglePasswordVisibility(id: string) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  const filtered = profiles.filter((p) => {
    if (p.id === 'seed-placeholder' || p.email === 'seed@placeholder.local') return false;
    const q = search.toLowerCase();
    return p.email.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q);
  });

  const adminCount = profiles.filter((p) => p.role === 'admin').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div>
          <p className="font-semibold text-lg">User Management</p>
          <p className="text-xs text-ink-400 mt-0.5">Manage roles, access, and passwords for your team</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && (
            <span className={`text-xs flex items-center gap-1.5 ${msgKind === 'ok' ? 'text-success' : 'text-danger'}`}>
              {msgKind === 'ok' ? <Check size={13} /> : <X size={13} />} {msg}
            </span>
          )}
          <button
            onClick={() => { setPasswordModal(me); setNewPassword(''); setShowPassword(false); }}
            className="btn-ghost"
          >
            <KeyRound size={15} /> Change my password
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: String(profiles.length), icon: Users, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Admins', value: String(adminCount), icon: ShieldCheck, color: 'text-success', bg: 'bg-success-700/10' },
          { label: 'Cashiers', value: String(profiles.length - adminCount), icon: UserCircle, color: 'text-warning', bg: 'bg-warning/10' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-400">{s.label}</p>
              <div className={`grid h-8 w-8 place-items-center rounded-lg ${s.bg} ${s.color}`}>
                <s.icon size={16} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold font-mono">{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold hidden sm:table-cell">Email</th>
                  <th className="px-5 py-3 font-semibold hidden lg:table-cell">Password</th>
                  <th className="px-5 py-3 font-semibold hidden md:table-cell">Joined</th>
                  <th className="px-5 py-3 font-semibold text-center">Role</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isMe = p.id === me?.id;
                  const pwVisible = visiblePasswords.has(p.id);
                  return (
                    <tr key={p.id} className="border-b border-ink-800/60 table-row-hover">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`grid h-8 w-8 place-items-center rounded-lg ${p.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-ink-800 text-ink-300'}`}>
                            {p.role === 'admin' ? <ShieldCheck size={15} /> : <UserCircle size={15} />}
                          </div>
                          <span className="font-medium">{p.full_name || '—'}</span>
                          {isMe && <span className="badge bg-ink-800 text-ink-400 text-[10px]">You</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell text-ink-300">{p.email}</td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-ink-300 bg-ink-850 px-2 py-1 rounded">
                            {pwVisible ? (p.password || '—') : '••••••••'}
                          </code>
                          <button
                            onClick={() => togglePasswordVisibility(p.id)}
                            className="text-ink-400 hover:text-ink-200 p-1"
                            title={pwVisible ? 'Hide' : 'Show'}
                          >
                            {pwVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {p.password && pwVisible && (
                            <button
                              onClick={() => copyToClipboard(p.password!)}
                              className="text-ink-400 hover:text-ink-200 p-1"
                              title="Copy"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell text-ink-400">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge capitalize ${p.role === 'admin' ? 'bg-accent/10 text-accent border border-accent/30' : 'bg-ink-800 text-ink-300 border border-ink-700'}`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {busyId === p.id ? (
                          <Loader2 size={15} className="animate-spin inline text-ink-400" />
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setPasswordModal(p); setNewPassword(''); setShowPassword(false); }}
                              className="btn-ghost px-3 py-1.5 text-xs text-accent"
                              title="Set new password directly"
                            >
                              <KeyRound size={13} /> {isMe ? 'Change' : 'Set PW'}
                            </button>
                            {!isMe && (
                              <>
                                <button
                                  onClick={() => toggleRole(p)}
                                  className={`btn-ghost px-3 py-1.5 text-xs ${p.role === 'admin' ? 'text-warning' : 'text-success'}`}
                                >
                                  {p.role === 'admin' ? (
                                    <><UserCircle size={13} /> Cashier</>
                                  ) : (
                                    <><ShieldCheck size={13} /> Admin</>
                                  )}
                                </button>
                                <button
                                  onClick={() => setResetConfirm(p)}
                                  className="btn-ghost px-3 py-1.5 text-xs text-accent"
                                  title="Send password reset email"
                                >
                                  <Mail size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(p)}
                                  className="btn-ghost px-3 py-1.5 text-xs text-danger"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-400">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Set/Change password modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => !pwBusy && setPasswordModal(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><KeyRound size={20} /></div>
              <div>
                <p className="font-semibold">
                  {passwordModal.id === me?.id ? 'Change your password' : `Reset password for ${passwordModal.full_name || passwordModal.email}`}
                </p>
                <p className="text-xs text-ink-400">Enter a new password (min 6 characters)</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-9 pr-10"
                  placeholder="New password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordModal.password && (
                <div className="rounded-lg bg-ink-850 border border-ink-700 px-3 py-2">
                  <p className="text-xs text-ink-400 mb-1">Current password:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-ink-200 flex-1">{showPassword ? passwordModal.password : '••••••••'}</code>
                    <button
                      onClick={() => copyToClipboard(passwordModal.password!)}
                      className="text-ink-400 hover:text-ink-200 p-1"
                      title="Copy"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
              {msg && msgKind === 'err' && (
                <p className="text-sm text-danger">{msg}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setPasswordModal(null); setNewPassword(''); setShowPassword(false); }} className="btn-ghost" disabled={pwBusy}>Cancel</button>
              <button onClick={handleSetPassword} className="btn-primary" disabled={pwBusy}>
                {pwBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Update password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email reset confirmation */}
      {resetConfirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" onClick={() => !resetBusy && setResetConfirm(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative card w-full max-w-sm p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent"><Mail size={20} /></div>
              <div>
                <p className="font-semibold">Reset password?</p>
                <p className="text-xs text-ink-400">A reset link will be emailed to this user.</p>
              </div>
            </div>
            <p className="text-sm text-ink-300 mb-1">Send a password reset email to:</p>
            <p className="text-sm font-mono font-semibold text-ink-100 mb-5">{resetConfirm.email}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetConfirm(null)} className="btn-ghost" disabled={resetBusy}>Cancel</button>
              <button onClick={() => handleResetEmail(resetConfirm)} className="btn-primary" disabled={resetBusy}>
                {resetBusy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send reset email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
