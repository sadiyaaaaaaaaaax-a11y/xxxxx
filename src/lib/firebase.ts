import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection check required by skill (guaranteed never to hang)
export async function testConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection check timeout')), 1500)
    );
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise,
    ]);
    return true;
  } catch (error) {
    return false;
  }
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  balance: number;
  totalNumbers: number;
  totalOtps: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmsOrderRecord {
  id: string;
  userId: string;
  phoneNumber: string;
  service: string;
  country: string;
  range: string;
  price: number;
  status: 'WAITING' | 'RECEIVED' | 'EXPIRED' | 'CANCELLED';
  otpCode?: string;
  fullMessage?: string;
  orderRefId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchOrCreateUserProfile(
  user: User,
  customDisplayName?: string
): Promise<UserProfile> {
  const fallbackProfile: UserProfile = {
    id: user.uid,
    email: user.email || 'user@nxvsms.com',
    displayName:
      customDisplayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'NXV User',
    role: user.email === 'mnshiddik11@gmail.com' ? 'admin' : 'user',
    balance: 0,
    totalNumbers: 0,
    totalOtps: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const userRef = doc(db, 'users', user.uid);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timeout')), 1500)
    );

    const snap = await Promise.race([getDoc(userRef), timeoutPromise]);
    if (snap && snap.exists()) {
      return snap.data() as UserProfile;
    }

    setDoc(userRef, fallbackProfile).catch(() => {});
    return fallbackProfile;
  } catch (err) {
    return fallbackProfile;
  }
}

export async function updateUserBalance(
  userId: string,
  amountChange: number,
  isNumberAdded = false,
  isOtpAdded = false
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      const newBalance = Math.max(0, (data.balance || 0) + amountChange);
      await updateDoc(userRef, {
        balance: newBalance,
        totalNumbers: (data.totalNumbers || 0) + (isNumberAdded ? 1 : 0),
        totalOtps: (data.totalOtps || 0) + (isOtpAdded ? 1 : 0),
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Failed to update balance on Firestore:', err);
  }
}

export function signInWithDemoUser(): UserProfile {
  const demoProfile: UserProfile = {
    id: `guest-${Date.now().toString(36)}`,
    email: 'user@nxvsms.com',
    displayName: 'NXV Member',
    role: 'user',
    balance: 0,
    totalNumbers: 0,
    totalOtps: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem('nxv_user_profile', JSON.stringify(demoProfile));
  } catch {}
  return demoProfile;
}

