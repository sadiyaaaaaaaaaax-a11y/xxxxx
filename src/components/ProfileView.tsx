import React from 'react';
import {
  User,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  Server,
  Cloud,
  LogOut,
  Shield,
} from 'lucide-react';
import { UserProfile } from '../lib/firebase';

interface ProfileViewProps {
  userProfile: UserProfile | null;
  onLogout: () => void;
  ordersCount: number;
  otpsCount: number;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  onLogout,
  ordersCount,
  otpsCount,
}) => {
  if (!userProfile) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Profile Overview Card */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-slate-900 to-slate-900 p-4 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-xl sm:text-2xl font-black text-white shadow-lg shadow-violet-950/60 border border-violet-400/30">
              {userProfile.displayName ? userProfile.displayName[0].toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-black text-white">
                  {userProfile.displayName}
                </h1>
                <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300 border border-violet-500/30 capitalize">
                  {userProfile.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{userProfile.email}</p>
              <div className="mt-1 text-[11px] text-slate-500">
                User UID: <span className="font-mono text-slate-400">{userProfile.id}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-950/40 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>লগআউট</span>
          </button>
        </div>
      </div>

      {/* Usage Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Numbers Requested</span>
            <PhoneCall className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">{ordersCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">গৃহীত ভার্চুয়াল নাম্বার</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">OTPs Received</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{otpsCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">প্রাপ্ত সফল ওটিপি কোড</div>
        </div>
      </div>

      {/* Hosting & Deployment Instructions */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Cloud className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Railway &amp; Vercel Deployment Guide</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:p-4">
            <div className="font-bold text-white flex items-center gap-2 mb-1.5">
              <Server className="h-4 w-4 text-purple-400" />
              <span>Railway Deployment</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              1. GitHub রিপোজিটরি Railway তে কানেক্ট করুন।<br />
              2. Build Command: <code className="text-cyan-400">npm run build</code><br />
              3. Start Command: <code className="text-cyan-400">npm start</code>
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:p-4">
            <div className="font-bold text-white flex items-center gap-2 mb-1.5">
              <Cloud className="h-4 w-4 text-cyan-400" />
              <span>Vercel Deployment</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              1. রিপোজিটরি Vercel এ ইম্পোর্ট করুন।<br />
              2. Framework: Vite / Node.js ফুল-স্ট্যাক এক্সপ্রেস।<br />
              3. অথেনটিকেশন ও ডাটাবেজ স্বয়ংক্রিয়ভাবে Firebase এ কানেক্টেড থাকবে।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
