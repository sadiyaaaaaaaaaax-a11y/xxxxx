export interface ServiceItem {
  id: string;
  name: string;
  iconName: string;
  cost: number;
  popular?: boolean;
}

export interface CountryItem {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export interface ActiveRange {
  id?: string;
  range: string;
  service: string;
  tag?: string;
  hits?: number;
  country?: string;
  carrier?: string;
  status?: string;
  successRate?: string;
  count?: number;
}

export interface SmsOrder {
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

export interface BroadcastItem {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'ALERT' | 'UPDATE' | 'RANGE_ADDED';
  time?: string;
  createdAt?: string;
}

export interface ApiConfig {
  apiKeyMasked: string;
  hasKey: boolean;
  demoMode: boolean;
}

export interface ConsoleLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  endpoint?: string;
  message: string;
  details?: any;
}
