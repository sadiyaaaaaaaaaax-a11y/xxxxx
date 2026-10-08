import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { GetNumberView } from './components/GetNumberView';
import { HistoryView } from './components/HistoryView';
import { ManageRangeView } from './components/ManageRangeView';
import { ConsoleView } from './components/ConsoleView';
import { ProfileView } from './components/ProfileView';
import { AuthPage } from './components/AuthPage';
import { API } from './lib/api';
import { ActiveRange, SmsOrder, BroadcastItem, ConsoleLog } from './types';
import {
  auth,
  db,
  UserProfile,
  fetchOrCreateUserProfile,
  testConnection,
} from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { PhoneCall, History, Radio, Terminal, User } from 'lucide-react';
import { detectCountryFromRange, normalizeServiceName } from './lib/countryUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('getnum');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // User State: initialize from localStorage for instant, zero-flicker loading
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('nxv_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persistent Orders State: Load immediately from localStorage so refresh never clears history
  const [orders, setOrders] = useState<SmsOrder[]>(() => {
    try {
      const saved = localStorage.getItem('nxv_sms_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistent Active Order State: Load immediately from localStorage so active number never vanishes
  const [activeOrder, setActiveOrder] = useState<SmsOrder | null>(() => {
    try {
      const savedActive = localStorage.getItem('nxv_active_order');
      if (savedActive) return JSON.parse(savedActive);

      const savedOrders = localStorage.getItem('nxv_sms_orders');
      if (savedOrders) {
        const list = JSON.parse(savedOrders) as SmsOrder[];
        if (list.length > 0) return list[0];
      }
      return null;
    } catch {
      return null;
    }
  });

  // Active Ranges
  const [ranges, setRanges] = useState<ActiveRange[]>([]);
  const [rangesLoading, setRangesLoading] = useState<boolean>(false);
  const [rangesSource, setRangesSource] = useState<string>('live');
  const [preselectedRange, setPreselectedRange] = useState<string>('');
  const [preselectedService, setPreselectedService] = useState<string>('');

  // Broadcasts & Logs
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [logs, setLogs] = useState<ConsoleLog[]>([
    {
      id: 'log-init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      endpoint: '/api/v1/routes',
      message: 'NXV SMS Panel connected to Live Carrier Gateway',
    },
  ]);

  const addLog = (log: Omit<ConsoleLog, 'id' | 'timestamp'>) => {
    setLogs((prev) => [
      ...prev,
      {
        ...log,
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  // Sync user profile to localStorage
  useEffect(() => {
    if (userProfile) {
      try {
        localStorage.setItem('nxv_user_profile', JSON.stringify(userProfile));
      } catch {}
    } else {
      try {
        localStorage.removeItem('nxv_user_profile');
      } catch {}
    }
  }, [userProfile]);

  // Sync orders to localStorage on any state change
  useEffect(() => {
    try {
      localStorage.setItem('nxv_sms_orders', JSON.stringify(orders));
    } catch {}
  }, [orders]);

  // Sync activeOrder to localStorage on any state change
  useEffect(() => {
    if (activeOrder) {
      try {
        localStorage.setItem('nxv_active_order', JSON.stringify(activeOrder));
      } catch {}
    }
  }, [activeOrder]);

  // 1. Initial connection & data load
  useEffect(() => {
    testConnection().catch(() => {});
    loadActiveRanges();
    loadBroadcasts();
  }, []);

  // 2. Firebase Auth Listener & Firestore Real-time Orders Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await fetchOrCreateUserProfile(firebaseUser);
          setUserProfile(profile);
          addLog({
            type: 'success',
            message: `User signed in: ${profile.displayName} (${profile.email})`,
          });

          // Sync user orders from Firestore & merge with local storage
          const ordersRef = collection(db, 'users', firebaseUser.uid, 'smsOrders');
          const q = query(ordersRef, orderBy('createdAt', 'desc'));
          const unsubOrders = onSnapshot(
            q,
            (snapshot) => {
              const fsItems: SmsOrder[] = [];
              snapshot.forEach((d) => fsItems.push(d.data() as SmsOrder));
              if (fsItems.length > 0) {
                setOrders((prev) => {
                  const map = new Map<string, SmsOrder>();
                  prev.forEach((o) => map.set(o.id, o));
                  fsItems.forEach((o) => map.set(o.id, o));
                  return Array.from(map.values()).sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  );
                });
              }
            },
            (err) => {
              console.warn('Orders listener error:', err);
            }
          );

          return () => unsubOrders();
        } catch {
          setUserProfile({
            id: firebaseUser.uid,
            email: firebaseUser.email || 'user@nxvsms.com',
            displayName: firebaseUser.displayName || 'NXV User',
            role: 'user',
            balance: 0,
            totalNumbers: 0,
            totalOtps: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. CONTINUOUS BACKGROUND OTP SYNC & RECOVERY
  // Polls live gateway every 3.5s so even if the page refreshes, received OTPs are immediately caught and displayed!
  useEffect(() => {
    const checkGatewayOtps = async () => {
      try {
        const res = await API.getAllOtps();
        if (!res.success || !res.otps || res.otps.length === 0) return;

        // If local orders is completely empty, auto-recover any existing OTP records from the gateway!
        if (orders.length === 0 && res.otps.length > 0) {
          const recoveredList: SmsOrder[] = res.otps.map((item, idx) => {
            const rawNum = item.number;
            const fullNum = rawNum.startsWith('+') ? rawNum : `+${rawNum}`;
            const cInfo = detectCountryFromRange(rawNum);

            let otpCode = item.otp;
            const matchCode = String(item.otp || '').match(/\b\d{4,8}\b/);
            if (matchCode) otpCode = matchCode[0];

            return {
              id: item.nid || `ORD-REC-${idx}-${Date.now()}`,
              userId: userProfile?.id || 'user',
              phoneNumber: fullNum,
              service: item.otp.toLowerCase().includes('facebook') ? 'Facebook' : item.otp.toLowerCase().includes('instagram') ? 'Instagram' : item.otp.toLowerCase().includes('whatsapp') ? 'WhatsApp' : 'Live SMS',
              country: `${cInfo.flag} ${cInfo.name}`,
              range: rawNum.slice(0, 6) + 'XXX',
              price: 0,
              status: 'RECEIVED',
              otpCode: otpCode,
              fullMessage: item.otp,
              createdAt: item.created_at || new Date().toISOString(),
              updatedAt: item.created_at || new Date().toISOString(),
              expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
            };
          });

          setOrders(recoveredList);
          setActiveOrder(recoveredList[0]);
          try {
            localStorage.setItem('nxv_sms_orders', JSON.stringify(recoveredList));
            localStorage.setItem('nxv_active_order', JSON.stringify(recoveredList[0]));
          } catch {}
          return;
        }

        // Match against existing orders
        setOrders((prevOrders) => {
          let modified = false;

          const updatedOrders = prevOrders.map((ord) => {
            // If already received with code, nothing to change
            if (ord.status === 'RECEIVED' && ord.otpCode) return ord;

            const cleanTarget = ord.phoneNumber.replace(/[^0-9]/g, '');

            const match = res.otps.find((item) => {
              const itemNum = String(item.number || '').replace(/[^0-9]/g, '');
              return (
                itemNum &&
                (itemNum === cleanTarget ||
                  cleanTarget.endsWith(itemNum) ||
                  itemNum.endsWith(cleanTarget))
              );
            });

            if (match) {
              modified = true;
              let code = match.otp;
              const matchCode = String(match.otp || '').match(/\b\d{4,8}\b/);
              if (matchCode) code = matchCode[0];

              const now = new Date().toISOString();
              const updatedOrder: SmsOrder = {
                ...ord,
                status: 'RECEIVED',
                otpCode: code,
                fullMessage: match.otp,
                updatedAt: now,
              };

              // Update active order if it's the matching one
              setActiveOrder((currentActive) => {
                if (
                  !currentActive ||
                  currentActive.id === ord.id ||
                  currentActive.phoneNumber.replace(/[^0-9]/g, '') === cleanTarget
                ) {
                  try {
                    localStorage.setItem('nxv_active_order', JSON.stringify(updatedOrder));
                  } catch {}
                  return updatedOrder;
                }
                return currentActive;
              });

              // Update in Firestore
              if (userProfile?.id) {
                const orderDocRef = doc(db, 'users', userProfile.id, 'smsOrders', ord.id);
                updateDoc(orderDocRef, {
                  status: 'RECEIVED',
                  otpCode: code,
                  fullMessage: match.otp,
                  updatedAt: now,
                }).catch(() => {});
              }

              addLog({
                type: 'success',
                endpoint: 'GET /v1/numsuccess/info',
                message: `OTP delivered: ${code} for ${ord.phoneNumber}`,
              });

              return updatedOrder;
            }

            return ord;
          });

          if (modified) {
            try {
              localStorage.setItem('nxv_sms_orders', JSON.stringify(updatedOrders));
            } catch {}
            return updatedOrders;
          }

          return prevOrders;
        });
      } catch (err) {
        // silent background check
      }
    };

    // Run immediately on mount
    checkGatewayOtps();

    // Check every 3.5 seconds
    const interval = setInterval(checkGatewayOtps, 3500);
    return () => clearInterval(interval);
  }, [userProfile?.id, orders.length]);

  // Load active ranges directly from API
  const loadActiveRanges = async () => {
    setRangesLoading(true);
    const res = await API.getActiveRanges();
    if (res.ranges.length > 0) {
      setRanges(res.ranges);
      setRangesSource('Live Routing Matrix');
    }
    setRangesLoading(false);
    addLog({
      type: res.success ? 'success' : 'info',
      endpoint: 'GET /v1/active-ranges',
      message: res.success
        ? `Loaded ${res.ranges.length} active routes from carrier network`
        : `Active routes: ${res.message || 'Status verified'}`,
    });
  };

  // Load broadcasts
  const loadBroadcasts = async () => {
    const res = await API.getGlobalBroadcast();
    setBroadcasts(res.broadcasts);
    addLog({
      type: 'info',
      endpoint: 'GET /api/v1/global-broadcast',
      message: `Loaded ${res.broadcasts.length} live broadcast messages`,
    });
  };

  const handleAddOrderToHistory = (order: SmsOrder) => {
    setActiveOrder(order);
    setOrders((prev) => {
      const updated = [order, ...prev.filter((o) => o.id !== order.id)];
      try {
        localStorage.setItem('nxv_sms_orders', JSON.stringify(updated));
        localStorage.setItem('nxv_active_order', JSON.stringify(order));
      } catch {}
      return updated;
    });

    addLog({
      type: 'success',
      endpoint: 'POST /v1/getnum',
      message: `Allocated: ${order.phoneNumber} for ${order.service}`,
    });
  };

  const handleUpdateOrderInHistory = (orderId: string, updates: Partial<SmsOrder>) => {
    setOrders((prev) => {
      const updated = prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o));
      try {
        localStorage.setItem('nxv_sms_orders', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setActiveOrder((cur) => {
      if (cur && cur.id === orderId) {
        const next = { ...cur, ...updates };
        try {
          localStorage.setItem('nxv_active_order', JSON.stringify(next));
        } catch {}
        return next;
      }
      return cur;
    });

    if (updates.status === 'RECEIVED' && updates.otpCode) {
      addLog({
        type: 'success',
        endpoint: 'GET /v1/numsuccess/info',
        message: `OTP delivered: ${updates.otpCode} for order ${orderId}`,
      });
    }
  };

  const handleSelectRangeFromList = (range: string, service?: string) => {
    setPreselectedRange(range);
    if (service) {
      setPreselectedService(service);
    }
    setActiveTab('getnum');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      localStorage.removeItem('nxv_user_profile');
      addLog({ type: 'info', message: 'User signed out' });
    } catch {
      setUserProfile(null);
      localStorage.removeItem('nxv_user_profile');
    }
  };

  // If not signed in, show Auth Page
  if (!userProfile) {
    return (
      <AuthPage
        onSuccess={(profile) => {
          setUserProfile(profile);
          addLog({
            type: 'success',
            message: `Signed in as ${profile.displayName}`,
          });
        }}
      />
    );
  }

  const otpsCount = orders.filter((o) => o.status === 'RECEIVED').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation */}
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen(true)}
        userProfile={userProfile}
        onLogout={handleLogout}
        onSelectTab={setActiveTab}
      />

      {/* Drawer Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        userProfile={userProfile}
        onLogout={handleLogout}
        ordersCount={orders.length}
      />

      {/* Main Content Area with safe mobile bottom padding */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 pb-24 md:pb-8">
        {activeTab === 'getnum' && (
          <GetNumberView
            userProfile={userProfile}
            activeOrder={activeOrder}
            setActiveOrder={setActiveOrder}
            recentOrders={orders}
            onAddOrderToHistory={handleAddOrderToHistory}
            onUpdateOrderInHistory={handleUpdateOrderInHistory}
            activeRanges={ranges}
            preselectedRange={preselectedRange}
            preselectedService={preselectedService}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            orders={orders}
            onSelectGetNumber={() => setActiveTab('getnum')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            userProfile={userProfile}
            onLogout={handleLogout}
            ordersCount={orders.length}
            otpsCount={otpsCount}
          />
        )}

        {activeTab === 'ranges' && (
          <ManageRangeView
            ranges={ranges}
            loading={rangesLoading}
            onRefresh={loadActiveRanges}
            onSelectRange={handleSelectRangeFromList}
            apiSource={rangesSource}
          />
        )}

        {activeTab === 'console' && (
          <ConsoleView
            broadcasts={broadcasts}
            onRefreshBroadcasts={loadBroadcasts}
            logs={logs}
            onAddLog={addLog}
          />
        )}
      </main>

      {/* Mobile Bottom Quick-Nav Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-cyan-500/20 bg-slate-950/95 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setActiveTab('getnum')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            activeTab === 'getnum' ? 'text-cyan-400 font-bold scale-105' : 'text-slate-400'
          }`}
        >
          <PhoneCall className="h-4 w-4" />
          <span className="text-[10px]">Get Number</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl relative transition-all ${
            activeTab === 'history' ? 'text-amber-400 font-bold scale-105' : 'text-slate-400'
          }`}
        >
          <History className="h-4 w-4" />
          <span className="text-[10px]">History</span>
          {orders.length > 0 && (
            <span className="absolute top-0 right-1 h-3.5 w-3.5 rounded-full bg-amber-500 text-[8px] font-black text-black flex items-center justify-center">
              {orders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('ranges')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            activeTab === 'ranges' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400'
          }`}
        >
          <Radio className="h-4 w-4" />
          <span className="text-[10px]">Ranges</span>
        </button>

        <button
          onClick={() => setActiveTab('console')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            activeTab === 'console' ? 'text-rose-400 font-bold scale-105' : 'text-slate-400'
          }`}
        >
          <Terminal className="h-4 w-4" />
          <span className="text-[10px]">Live Feed</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
            activeTab === 'profile' ? 'text-violet-400 font-bold scale-105' : 'text-slate-400'
          }`}
        >
          <User className="h-4 w-4" />
          <span className="text-[10px]">Profile</span>
        </button>
      </div>
    </div>
  );
}
