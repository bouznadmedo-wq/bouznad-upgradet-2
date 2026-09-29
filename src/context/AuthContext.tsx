import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, updatePassword,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getProfile, createProfile, updateProfilePassword, type Profile, type Role } from '@/lib/db';

type AuthContextValue = {
  session: { uid: string; email: string | null } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isCashier: boolean;
  role: Role | null;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updateUserPassword: (newPassword: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ uid: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileLoaded = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setSession({ uid: user.uid, email: user.email });
        try {
          let p = await getProfile(user.uid);
          if (!p && user.email) {
            p = await createProfile(user.uid, user.email, user.displayName ?? '');
          }
          profileLoaded.current = true;
          setProfile(p);
        } catch {
          // Firestore rules may block access; still let the user in
          profileLoaded.current = true;
        }
      } else {
        profileLoaded.current = false;
        setSession(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Real-time profile listener: if an admin deletes this user's profile from
  // another device, force sign-out immediately. But don't sign out during the
  // signup window where the profile hasn't been created yet.
  useEffect(() => {
    if (!session) return;
    const ref = doc(db, 'profiles', session.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        if (profileLoaded.current) {
          fbSignOut(auth).catch(() => {});
          setSession(null);
          setProfile(null);
        }
      } else {
        const data = snap.data() as Record<string, unknown>;
        const role = (data.role as Role) ?? 'cashier';
        profileLoaded.current = true;
        setProfile({
          id: session.uid,
          email: data.email as string,
          full_name: (data.full_name as string) ?? null,
          role,
          password: (data.password as string) ?? null,
          created_at: (data.created_at as string) ?? '',
        });
      }
    });
    return () => unsub();
  }, [session?.uid]);

  async function signIn(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign in failed.' };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await createProfile(cred.user.uid, email.trim(), fullName.trim(), password);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign up failed.' };
    }
  }

  async function signOut() {
    await fbSignOut(auth);
    setProfile(null);
  }

  async function resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Password reset failed.' };
    }
  }

  async function updateUserPassword(newPassword: string) {
    try {
      const user = auth.currentUser;
      if (!user) return { error: 'Not signed in.' };
      await updatePassword(user, newPassword);
      if (profile) await updateProfilePassword(profile.id, newPassword);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Password update failed.' };
    }
  }

  const role = profile?.role ?? null;

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: role === 'admin',
    isCashier: role === 'cashier',
    role,
    resetPassword,
    updateUserPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
