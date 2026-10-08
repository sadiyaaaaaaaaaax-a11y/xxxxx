import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User as UserIcon,
  LogIn,
  UserPlus,
  Sparkles,
  AlertCircle,
  Zap,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  UserProfile,
  fetchOrCreateUserProfile,
  signInWithDemoUser,
} from '../lib/firebase';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

interface AuthPageProps {
  onSuccess: (profile: UserProfile) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const profile = await fetchOrCreateUserProfile(userCred.user);
        onSuccess(profile);
      } else {
        if (!displayName.trim()) {
          setErrorMsg('দয়া করে আপনার নাম প্রদান করুন');
          setLoading(false);
          return;
        }

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName });
        const profile = await fetchOrCreateUserProfile(userCred.user, displayName);
        onSuccess(profile);
      }
    } catch (err: any) {
      console.warn('Auth error:', err);
      let msg = err.message || 'অথেনটিকেশন ব্যর্থ হয়েছে';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'ইমেইল বা পাসওয়ার্ড সঠিক নয়';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'এই ইমেইলটি ইতিপূর্বে নিবন্ধিত হয়েছে। লগইন করুন।';
      } else if (err.code === 'auth/weak-password') {
        msg = 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'ইমেইল এড্রেসটি সঠিক নয়';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const userCred = await signInWithPopup(auth, googleProvider);
      const profile = await fetchOrCreateUserProfile(userCred.user);
      onSuccess(profile);
    } catch (err: any) {
      console.warn('Google sign-in error:', err);
      setErrorMsg(err.message || 'গুগল সাইন-ইন সম্পন্ন করা যায়নি');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoSession = async () => {
    const demoProfile = signInWithDemoUser();
    onSuccess(demoProfile);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon */}
        <div className="inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-xl shadow-cyan-500/25 border border-cyan-400/30 mb-3 animate-pulse">
          <Zap className="h-8 w-8 sm:h-9 sm:w-9" />
        </div>

        <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
          NXV <span className="text-cyan-400">SMS</span>
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-400">
          উচ্চগতির ভার্চুয়াল নাম্বার ও লাইভ ওটিপি রিসিভার প্যানেল
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 sm:p-8 shadow-2xl shadow-cyan-950/50 backdrop-blur-md">
          {/* Tabs */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1 mb-5 sm:mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition-all ${
                mode === 'login'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              লগইন (Sign In)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`flex-1 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition-all ${
                mode === 'register'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              রেজিস্ট্রেশন (Sign Up)
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  আপনার নাম (Full Name)
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="যেমন: Sabbir Ahmed"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/90 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ইমেইল এড্রেস (Email Address)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/90 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                পাসওয়ার্ড (Password)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/90 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-3 text-xs sm:text-sm font-black text-white shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>লোড হচ্ছে...</span>
              ) : mode === 'login' ? (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>লগইন করুন</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>রেজিস্ট্রেশন করুন</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-4 sm:my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-slate-900 px-2 text-slate-500">অথবা</span>
            </div>
          </div>

          {/* Social Sign-in & Fast Entry */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>গুগল দিয়ে প্রবেশ করুন</span>
            </button>

            <button
              type="button"
              onClick={handleQuickDemoSession}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/20 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-950/40 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>ইনস্ট্যান্ট টেস্ট সেশনে প্রবেশ করুন (One-Click Entry)</span>
            </button>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="mt-5 grid grid-cols-2 gap-3 text-center text-xs text-slate-400">
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <Radio className="h-4 w-4 text-cyan-400 mx-auto mb-1" />
            <div className="font-bold text-white text-[11px]">Direct Carrier Hub</div>
            <div className="text-[10px] text-slate-500">লাইভ নেটওয়ার্ক রুট</div>
          </div>
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
            <div className="font-bold text-white text-[11px]">Firebase Cloud</div>
            <div className="text-[10px] text-slate-500">নিরাপদ ডাটা সিঙ্ক</div>
          </div>
        </div>
      </div>
    </div>
  );
};
