import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export type Role = 'admin' | 'cashier';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  password: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  specs: string | null;
  cpu: string | null;
  ram: string | null;
  storage: string | null;
  group_id: string | null;
  cost_price: number;
  sale_price: number;
  barcode: string | null;
  quantity: number;
  image_url: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  image_url: string | null;
  created_at: string;
};

export type CartItem = {
  product_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  group_id: string | null;
  unit_price: number;
  quantity: number;
  serial_number: string;
  specs: string;
};

export type Sale = {
  id: string;
  invoice_number: string;
  cashier_id: string;
  customer_name: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: string;
  card_auth_ref: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  serial_number: string | null;
  specs: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type HeldCart = {
  id: string;
  cashier_id: string;
  label: string;
  cart_data: CartItem[];
  created_at: string;
};
