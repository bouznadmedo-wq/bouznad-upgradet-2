import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Lock, Mail, User, ScanLine, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, fullName.trim());
    setBusy(false);
    if (res.error) setError(res.error);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-ink-950">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(60% 50% at 20% 10%, rgba(34,211,238,0.25), transparent), radial-gradient(50% 50% at 80% 90%, rgba(8,145,178,0.18), transparent)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl overflow-hidden">
            <img src="/assets/images/c08e1bac-aa1a-48da-9c70-a5993f28df8c.jpg" alt="BZ POS" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">BZ POS</p>
            <p className="text-xs text-ink-400">Bouznad Electronic Store</p>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Run your store <span className="text-accent">at the speed of light.</span>
          </h1>
          <p className="text-ink-300 leading-relaxed">
            Scan barcodes, hold carts for waiting customers, track inventory, and review every sale —
            all from one fast, dark-mode dashboard built for computer shops.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { icon: ScanLine, label: 'Barcode scanning' },
              { icon: User, label: 'Role-based access' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 rounded-xl border border-ink-800 bg-ink-900/60 px-3.5 py-3">
                <f.icon size={18} className="text-accent" />
                <span className="text-sm text-ink-200">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-ink-500">First account created becomes the admin.</p>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-ink-900">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl overflow-hidden">
              <img src="/assets/images/c08e1bac-aa1a-48da-9c70-a5993f28df8c.jpg" alt="BZ POS" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">BZ POS</p>
              <p className="text-xs text-ink-400">Bouznad Electronic Store</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-400">
            {mode === 'signin'
              ? 'Sign in to access the register or dashboard.'
              : 'The first account becomes the admin. Others join as cashiers.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    id="name"
                    className="input pl-9"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="email"
                  type="email"
                  className="input pl-9"
                  placeholder="you@store.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  id="password"
                  type="password"
                  className="input pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-danger-700/50 bg-danger-700/10 px-3.5 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {mode === 'signin' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-400">
            {mode === 'signin' ? "Don't have an account?" : 'Already registered?'}{' '}
            <button
              className="font-semibold text-accent hover:underline"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
              }}
            >
              {mode === 'signin' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
