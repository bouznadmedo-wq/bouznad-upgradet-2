import { collection, getDocs, addDoc, doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function seedDatabase(): Promise<{ created: string[]; skipped: boolean }> {
  const created: string[] = [];

  await deleteDoc(doc(db, 'profiles', 'seed-placeholder')).catch(() => {});

  const productsSnap = await getDocs(collection(db, 'products'));
  if (!productsSnap.empty) {
    return { created: [], skipped: true };
  }

  const sampleProducts = [
    { name: 'Dell XPS 15', brand: 'Dell', specs: '15.6in, RTX 3060', cpu: 'Core i7-12700H', ram: '16GB DDR5', storage: '512GB SSD', cost_price: 1200, sale_price: 1599, barcode: '8901234567890', quantity: 8 },
    { name: 'MacBook Air M2', brand: 'Apple', specs: '13.6in, Liquid Retina', cpu: 'Apple M2', ram: '8GB', storage: '256GB SSD', cost_price: 999, sale_price: 1299, barcode: '8901234567891', quantity: 12 },
    { name: 'HP Pavilion 15', brand: 'HP', specs: '15.6in, IPS', cpu: 'Ryzen 5 5500U', ram: '8GB DDR4', storage: '256GB SSD', cost_price: 450, sale_price: 649, barcode: '8901234567892', quantity: 15 },
    { name: 'Lenovo ThinkPad X1', brand: 'Lenovo', specs: '14in, Carbon', cpu: 'Core i7-1260P', ram: '16GB LPDDR5', storage: '1TB SSD', cost_price: 1500, sale_price: 1899, barcode: '8901234567893', quantity: 4 },
    { name: 'ASUS ROG Strix G15', brand: 'ASUS', specs: '15.6in, 165Hz', cpu: 'Ryzen 7 6800H', ram: '32GB DDR5', storage: '1TB SSD', cost_price: 1300, sale_price: 1799, barcode: '8901234567894', quantity: 6 },
    { name: 'Acer Aspire 5', brand: 'Acer', specs: '15.6in, FHD', cpu: 'Core i5-1235U', ram: '8GB DDR4', storage: '512GB SSD', cost_price: 400, sale_price: 549, barcode: '8901234567895', quantity: 20 },
    { name: 'MSI Katana GF66', brand: 'MSI', specs: '15.6in, 144Hz', cpu: 'Core i7-12700H', ram: '16GB DDR4', storage: '512GB SSD', cost_price: 900, sale_price: 1199, barcode: '8901234567896', quantity: 3 },
    { name: 'Samsung Galaxy Book2', brand: 'Samsung', specs: '15.6in, AMOLED', cpu: 'Core i5-1240P', ram: '8GB LPDDR4', storage: '256GB SSD', cost_price: 700, sale_price: 949, barcode: '8901234567897', quantity: 0 },
    { name: 'Logitech MX Master 3S', brand: 'Logitech', specs: 'Wireless, Ergonomic', cpu: null, ram: null, storage: null, cost_price: 70, sale_price: 99, barcode: '8901234567898', quantity: 25 },
    { name: 'Keychron K2 Keyboard', brand: 'Keychron', specs: 'Mechanical, RGB', cpu: null, ram: null, storage: null, cost_price: 65, sale_price: 89, barcode: '8901234567899', quantity: 18 },
    { name: 'Dell UltraSharp U2723QE', brand: 'Dell', specs: '27in, 4K USB-C', cpu: null, ram: null, storage: null, cost_price: 500, sale_price: 699, barcode: '8901234567900', quantity: 7 },
    { name: 'Samsung T7 Portable SSD', brand: 'Samsung', specs: '1TB, USB 3.2', cpu: null, ram: null, storage: '1TB', cost_price: 90, sale_price: 129, barcode: '8901234567901', quantity: 30 },
  ];

  for (const p of sampleProducts) {
    await addDoc(collection(db, 'products'), {
      ...p,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
  created.push('products');

  const sampleSale = {
    invoice_number: 'INV-1',
    cashier_id: 'seed',
    customer_name: 'Walk-in',
    subtotal: 1599,
    tax: 0,
    discount: 0,
    total: 1599,
    payment_method: 'cash',
    created_at: serverTimestamp(),
  };
  await addDoc(collection(db, 'sales'), sampleSale);
  created.push('sales');

  await addDoc(collection(db, 'sale_items'), {
    sale_id: 'seed-sale',
    product_id: null,
    product_name: 'Dell XPS 15',
    barcode: '8901234567890',
    serial_number: 'SN-DELL-001',
    specs: 'Core i7-12700H, 16GB, 512GB',
    unit_price: 1599,
    quantity: 1,
    line_total: 1599,
  });
  created.push('sale_items');

  await addDoc(collection(db, 'held_carts'), {
    cashier_id: 'seed',
    label: 'Held Cart 1',
    cart_data: [
      { product_id: 'seed', name: 'MacBook Air M2', brand: 'Apple', barcode: '8901234567891', unit_price: 1299, quantity: 1, serial_number: '', specs: 'Apple M2, 8GB, 256GB' },
    ],
    created_at: serverTimestamp(),
  });
  created.push('held_carts');

  return { created, skipped: false };
}
