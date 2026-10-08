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

// User-scoped LocalStorage helpers to prevent cross-user leakage
const getUserOrdersKey = (uid: string) => `nxv_sms_orders_${uid}`;
const getUserActiveOrderKey = (uid: string) => `nxv_active_order_${uid}`;

const getStoredUserOrders = (uid: string): SmsOrder[] => {
  try {
    const saved = localStorage.getItem(getUserOrdersKey(uid));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((o) => o && o.userId === uid);
      }
    }
  } catch {}
  return [];
};

const setStoredUserOrders = (uid: string, list: SmsOrder[]) => {
  try {
    const filtered = list.filter((o) => o && o.userId === uid);
    localStorage.setItem(getUserOrdersKey(uid), JSON.stringify(filtered));
  } catch {}
};

const getStoredUserActiveOrder = (uid: string): SmsOrder | null => {
  try {
    const saved = localStorage.getItem(getUserActiveOrderKey(uid));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.userId === uid) return parsed;
    }
  } catch {}
  return null;
};

const setStoredUserActiveOrder = (uid: string, order: SmsOrder | null) => {
  try {
    if (order && order.userId === uid) {
      localStorage.setItem(getUserActiveOrderKey(uid), JSON.stringify(order));
    } else {
      localStorage.removeItem(getUserActiveOrderKey(uid));
    }
  } catch {}
};

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

  // User-isolated Orders State: Load ONLY this logged-in user's stored orders
  const [orders, setOrders] = useState<SmsOrder[]>(() => {
    try {
      const savedUser = localStorage.getItem('nxv_user_profile');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          return getStoredUserOrders(u.id);
        }
      }
    } catch {}
    return [];
  });

  // User-isolated Active Order State: Load ONLY this logged-in user's active order
  const [activeOrder, setActiveOrder] = useState<SmsOrder | null>(() => {
    try {
      const savedUser = localStorage.getItem('nxv_user_profile');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          return getStoredUserActiveOrder(u.id);
        }
      }
    } catch {}
    return null;
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

  // Sync orders strictly to current user's scoped storage
  useEffect(() => {
    if (userProfile?.id) {
      setStoredUserOrders(userProfile.id, orders);
    }
  }, [orders, userProfile?.id]);

  // Sync activeOrder strictly to current user's scoped storage
  useEffect(() => {
    if (userProfile?.id) {
      setStoredUserActiveOrder(userProfile.id, activeOrder);
    }
  }, [activeOrder, userProfile?.id]);

  // 1. Initial connection & data load + cleanup legacy non-scoped storage
  useEffect(() => {
    try {
      localStorage.removeItem('nxv_sms_orders');
      localStorage.removeItem('nxv_active_order');
    } catch {}

    testConnection().catch(() => {});
    loadActiveRanges();
    loadBroadcasts();
  }, []);

  // 2. Firebase Auth Listener & STRICT User Isolation for Firestore Orders
  useEffect(() => {
    let unsubOrders: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubOrders) {
        unsubOrders();
        unsubOrders = null;
      }

      if (firebaseUser) {
        const uid = firebaseUser.uid;

        // Immediately load this specific user's cached numbers
        const userSavedOrders = getStoredUserOrders(uid);
        const userSavedActive = getStoredUserActiveOrder(uid);
        setOrders(userSavedOrders);
        setActiveOrder(userSavedActive);

        try {
          const profile = await fetchOrCreateUserProfile(firebaseUser);
          setUserProfile(profile);
          addLog({
            type: 'success',
            message: `User signed in: ${profile.displayName} (${profile.email})`,
          });
        } catch {
          setUserProfile({
            id: uid,
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

        // Strictly listen to THIS user's private subcollection in Firestore
        const ordersRef = collection(db, 'users', uid, 'smsOrders');
        const q = query(ordersRef, orderBy('createdAt', 'desc'));
        unsubOrders = onSnapshot(
          q,
          (snapshot) => {
            const fsItems: SmsOrder[] = [];
            snapshot.forEach((d) => {
              const data = d.data() as SmsOrder;
              if (data && data.userId === uid) {
                fsItems.push(data);
              }
            });

            // Set state strictly to this authenticated user's orders
            setOrders(fsItems);
            setStoredUserOrders(uid, fsItems);

            setActiveOrder((current) => {
              if (!current || current.userId !== uid) {
                const waitingOrder = fsItems.find((o) => o.status === 'WAITING') || (fsItems.length > 0 ? fsItems[0] : null);
                setStoredUserActiveOrder(uid, waitingOrder);
                return waitingOrder;
              }
              const updatedMatch = fsItems.find((o) => o.id === current.id);
              if (updatedMatch) {
                setStoredUserActiveOrder(uid, updatedMatch);
                return updatedMatch;
              }
              return current;
            });
          },
          (err) => {
            console.warn('Orders listener error:', err);
          }
        );
      } else {
        // When logged out, reset state completely so no other user sees previous data
        setUserProfile(null);
        setOrders([]);
        setActiveOrder(null);
      }
    });

    return () => {
      unsubscribe();
      if (unsubOrders) unsubOrders();
    };
  }, []);

  // 3. CONTINUOUS BACKGROUND OTP SYNC FOR USER'S PENDING ORDERS ONLY
  // Polls live gateway only for phone numbers that THIS logged in user has requested!
  useEffect(() => {
    if (!userProfile?.id) return;
    const currentUserId = userProfile.id;

    const checkGatewayOtps = async () => {
      // Find orders belonging strictly to THIS USER that are currently WAITING for OTP
      const waitingOrders = orders.filter(
        (ord) => ord.userId === currentUserId && ord.status === 'WAITING'
      );

      // If user has no active orders waiting for OTP, skip polling
      if (waitingOrders.length === 0) return;

      try {
        const res = await API.getAllOtps();
        if (!res.success || !res.otps || res.otps.length === 0) return;

        // Match received OTPs ONLY against this user's existing WAITING orders
        setOrders((prevOrders) => {
          let modified = false;

          const updatedOrders = prevOrders.map((ord) => {
            if (ord.userId !== currentUserId || ord.status !== 'WAITING') {
              return ord;
            }

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

              setActiveOrder((curActive) => {
                if (curActive && curActive.id === ord.id) {
                  setStoredUserActiveOrder(currentUserId, updatedOrder);
                  return updatedOrder;
                }
                return curActive;
              });

              // Persist to user's private Firestore subcollection
              const orderDocRef = doc(db, 'users', currentUserId, 'smsOrders', ord.id);
              updateDoc(orderDocRef, {
                status: 'RECEIVED',
                otpCode: code,
                fullMessage: match.otp,
                updatedAt: now,
              }).catch(() => {});

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
            setStoredUserOrders(currentUserId, updatedOrders);
            return updatedOrders;
          }

          return prevOrders;
        });
      } catch {
        // silent background check
      }
    };

    const interval = setInterval(checkGatewayOtps, 3000);
    return () => clearInterval(interval);
  }, [userProfile?.id, orders]);

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
    if (!userProfile?.id) return;
    const uid = userProfile.id;
    const userOrder: SmsOrder = { ...order, userId: uid };

    setActiveOrder(userOrder);
    setOrders((prev) => {
      const updated = [userOrder, ...prev.filter((o) => o.id !== userOrder.id && o.userId === uid)];
      setStoredUserOrders(uid, updated);
      setStoredUserActiveOrder(uid, userOrder);
      return updated;
    });

    addLog({
      type: 'success',
      endpoint: 'POST /v1/getnum',
      message: `Allocated: ${userOrder.phoneNumber} for ${userOrder.service}`,
    });
  };

  const handleUpdateOrderInHistory = (orderId: string, updates: Partial<SmsOrder>) => {
    if (!userProfile?.id) return;
    const uid = userProfile.id;

    setOrders((prev) => {
      const updated = prev.map((o) => (o.id === orderId && o.userId === uid ? { ...o, ...updates } : o));
      setStoredUserOrders(uid, updated);
      return updated;
    });

    setActiveOrder((cur) => {
      if (cur && cur.id === orderId && cur.userId === uid) {
        const next = { ...cur, ...updates };
        setStoredUserActiveOrder(uid, next);
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
    } catch {}
    setUserProfile(null);
    setOrders([]);
    setActiveOrder(null);
    try {
      localStorage.removeItem('nxv_user_profile');
      localStorage.removeItem('nxv_sms_orders');
      localStorage.removeItem('nxv_active_order');
    } catch {}
    addLog({ type: 'info', message: 'User signed out' });
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
