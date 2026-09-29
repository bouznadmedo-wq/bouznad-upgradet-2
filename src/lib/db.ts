import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, where, orderBy, writeBatch, getDoc, setDoc, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product, Sale, SaleItem, HeldCart, CartItem, Profile, Role, Group } from './firebase';

export type { Product, Sale, SaleItem, HeldCart, CartItem, Profile, Role, Group };

const now = () => new Date().toISOString();

function toProduct(id: string, data: Record<string, unknown>): Product {
  return {
    id,
    name: data.name as string,
    brand: (data.brand as string) ?? null,
    specs: (data.specs as string) ?? null,
    cpu: (data.cpu as string) ?? null,
    ram: (data.ram as string) ?? null,
    storage: (data.storage as string) ?? null,
    group_id: (data.group_id as string) ?? null,
    cost_price: Number(data.cost_price ?? 0),
    sale_price: Number(data.sale_price ?? 0),
    barcode: (data.barcode as string) ?? null,
    quantity: Number(data.quantity ?? 0),
    image_url: (data.image_url as string) ?? null,
    custom_fields: (data.custom_fields as Record<string, string>) ?? null,
    created_at: tsToIso(data.created_at),
    updated_at: tsToIso(data.updated_at),
  };
}

function tsToIso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

// ---------- Products ----------
export async function getProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map((d) => toProduct(d.id, d.data() as Record<string, unknown>));
}

export async function addProduct(p: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
  const ts = now();
  const ref = await addDoc(collection(db, 'products'), { ...p, created_at: ts, updated_at: ts });
  return toProduct(ref.id, { ...p, created_at: ts, updated_at: ts });
}

export async function updateProduct(id: string, p: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
  await updateDoc(doc(db, 'products', id), { ...p, updated_at: now() });
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, 'products', id));
}

export async function decrementStock(productId: string, by: number): Promise<void> {
  const ref = doc(db, 'products', productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = Number(snap.data()?.quantity ?? 0);
  await updateDoc(ref, { quantity: Math.max(0, current - by) });
}

// ---------- Sales ----------
export async function getNextInvoiceNumber(): Promise<string> {
  const counterRef = doc(db, 'meta', 'invoice_counter');
  let next = 1;
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(counterRef);
      if (snap.exists()) {
        next = Number((snap.data() as Record<string, unknown>).value ?? 0) + 1;
      } else {
        next = 1;
      }
      txn.set(counterRef, { value: next });
    });
  } catch {
    const snap = await getDoc(counterRef);
    next = snap.exists() ? Number((snap.data() as Record<string, unknown>).value ?? 0) + 1 : 1;
    await setDoc(counterRef, { value: next }, { merge: true });
  }
  return `INV-${next}`;
}

export async function getSales(): Promise<Sale[]> {
  const snap = await getDocs(query(collection(db, 'sales'), orderBy('created_at', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      invoice_number: data.invoice_number as string,
      cashier_id: data.cashier_id as string,
      customer_name: (data.customer_name as string) ?? null,
      subtotal: Number(data.subtotal ?? 0),
      tax: Number(data.tax ?? 0),
      discount: Number(data.discount ?? 0),
      total: Number(data.total ?? 0),
      payment_method: data.payment_method as string,
      card_auth_ref: (data.card_auth_ref as string) ?? null,
      created_at: tsToIso(data.created_at),
    } as Sale;
  });
}

export async function renumberInvoices(): Promise<{ renumbered: number; skipped: boolean }> {
  const snap = await getDocs(query(collection(db, 'sales'), orderBy('created_at', 'asc')));
  const expected = snap.docs.map((_, i) => `INV-${i + 1}`);
  const current = snap.docs.map((d) => (d.data() as Record<string, unknown>).invoice_number as string);
  const alreadyCorrect =
    snap.docs.length > 0 &&
    expected.length === current.length &&
    expected.every((num, i) => num === current[i]);

  if (alreadyCorrect) {
    return { renumbered: 0, skipped: true };
  }

  const batch = writeBatch(db);
  let counter = 0;
  snap.docs.forEach((d) => {
    counter++;
    const newNum = `INV-${counter}`;
    batch.update(d.ref, { invoice_number: newNum });
  });
  if (counter > 0) {
    await batch.commit();
    await setDoc(doc(db, 'meta', 'invoice_counter'), { value: counter });
  }
  return { renumbered: counter, skipped: false };
}

export async function getSaleItems(saleId: string): Promise<SaleItem[]> {
  const snap = await getDocs(query(collection(db, 'sale_items'), where('sale_id', '==', saleId)));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      sale_id: data.sale_id as string,
      product_id: (data.product_id as string) ?? null,
      product_name: data.product_name as string,
      barcode: (data.barcode as string) ?? null,
      serial_number: (data.serial_number as string) ?? null,
      specs: (data.specs as string) ?? null,
      unit_price: Number(data.unit_price ?? 0),
      quantity: Number(data.quantity ?? 1),
      line_total: Number(data.line_total ?? 0),
    } as SaleItem;
  });
}

export async function createSale(
  sale: Omit<Sale, 'id' | 'created_at'>,
  items: Omit<SaleItem, 'id' | 'sale_id'>[],
): Promise<string> {
  const batch = writeBatch(db);
  const saleRef = doc(collection(db, 'sales'));
  const ts = now();
  batch.set(saleRef, { ...sale, created_at: ts });
  for (const it of items) {
    const itemRef = doc(collection(db, 'sale_items'));
    batch.set(itemRef, { ...it, sale_id: saleRef.id });
  }
  await batch.commit();
  return saleRef.id;
}

// ---------- Sales Profit ----------
export async function getTotalSalesProfit(): Promise<number> {
  const [salesSnap, itemsSnap, productsSnap] = await Promise.all([
    getDocs(collection(db, 'sales')),
    getDocs(collection(db, 'sale_items')),
    getDocs(collection(db, 'products')),
  ]);
  const productCostMap = new Map<string, number>();
  productsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    productCostMap.set(d.id, Number(data.cost_price ?? 0));
  });
  const saleIdSet = new Set(salesSnap.docs.map((d) => d.id));
  let profit = 0;
  itemsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (!saleIdSet.has(data.sale_id as string)) return;
    const productId = (data.product_id as string) ?? null;
    const cost = productId ? (productCostMap.get(productId) ?? 0) : 0;
    const revenue = Number(data.line_total ?? 0);
    const qty = Number(data.quantity ?? 1);
    profit += revenue - cost * qty;
  });
  return profit;
}

// ---------- Held carts ----------
export async function getHeldCarts(cashierId: string): Promise<HeldCart[]> {
  const snap = await getDocs(query(collection(db, 'held_carts'), where('cashier_id', '==', cashierId)));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      cashier_id: data.cashier_id as string,
      label: data.label as string,
      cart_data: (data.cart_data as CartItem[]) ?? [],
      created_at: tsToIso(data.created_at),
    } as HeldCart;
  });
}

export async function addHeldCart(cashierId: string, label: string, cartData: CartItem[]): Promise<HeldCart> {
  const ref = await addDoc(collection(db, 'held_carts'), {
    cashier_id: cashierId,
    label,
    cart_data: cartData,
    created_at: now(),
  });
  return {
    id: ref.id,
    cashier_id: cashierId,
    label,
    cart_data: cartData,
    created_at: now(),
  };
}

export async function deleteHeldCart(id: string): Promise<void> {
  await deleteDoc(doc(db, 'held_carts', id));
}

// ---------- Groups ----------
export async function getGroups(): Promise<Group[]> {
  const snap = await getDocs(collection(db, 'groups'));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: data.name as string,
      image_url: (data.image_url as string) ?? null,
      created_at: tsToIso(data.created_at),
    } as Group;
  });
}

export async function addGroup(name: string, imageUrl?: string): Promise<Group> {
  const ts = now();
  const ref = await addDoc(collection(db, 'groups'), { name, image_url: imageUrl ?? null, created_at: ts });
  return { id: ref.id, name, image_url: imageUrl ?? null, created_at: ts };
}

export async function updateGroup(id: string, name: string, imageUrl?: string): Promise<void> {
  const payload: Record<string, string | null> = { name };
  if (imageUrl !== undefined) payload.image_url = imageUrl;
  await updateDoc(doc(db, 'groups', id), payload);
}

export async function deleteGroup(id: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', id));
}

// ---------- Profiles ----------
export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'profiles', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: uid,
    email: data.email as string,
    full_name: (data.full_name as string) ?? null,
    role: (data.role as Role) ?? 'cashier',
    password: (data.password as string) ?? null,
    created_at: tsToIso(data.created_at),
  };
}

export async function createProfile(uid: string, email: string, fullName: string, password?: string): Promise<Profile> {
  const adminSnap = await getDocs(collection(db, 'profiles'));
  const role: Role = adminSnap.empty ? 'admin' : 'cashier';
  const profile: Profile = {
    id: uid,
    email,
    full_name: fullName,
    role,
    password: password ?? null,
    created_at: now(),
  };
  await setDoc(doc(db, 'profiles', uid), profile);
  return profile;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const snap = await getDocs(collection(db, 'profiles'));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      email: data.email as string,
      full_name: (data.full_name as string) ?? null,
      role: (data.role as Role) ?? 'cashier',
      password: (data.password as string) ?? null,
      created_at: tsToIso(data.created_at),
    } as Profile;
  });
}

export async function updateProfileRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(db, 'profiles', uid), { role });
}

export async function updateProfilePassword(uid: string, password: string): Promise<void> {
  await updateDoc(doc(db, 'profiles', uid), { password });
}

export async function deleteProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'profiles', uid));
}
