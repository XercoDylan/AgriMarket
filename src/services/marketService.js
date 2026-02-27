import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Individual Listings ───────────────────────────────────────────────────

export async function createListing(farmerId, farmerName, listingData) {
  return addDoc(collection(db, 'listings'), {
    farmerId,
    farmerName,
    ...listingData,
    status: 'active',
    createdAt: serverTimestamp(),
  });
}

export async function getActiveListings() {
  const q = query(
    collection(db, 'listings'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyListings(farmerId) {
  const q = query(
    collection(db, 'listings'),
    where('farmerId', '==', farmerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function cancelListing(listingId) {
  await updateDoc(doc(db, 'listings', listingId), { status: 'cancelled' });
}

export async function buyListing(listingId, buyerId, buyerName, quantity, totalPrice) {
  await updateDoc(doc(db, 'listings', listingId), { status: 'sold' });
  return addDoc(collection(db, 'orders'), {
    buyerId,
    buyerName,
    listingId,
    quantity,
    totalPrice,
    type: 'individual',
    status: 'confirmed',
    createdAt: serverTimestamp(),
  });
}

// ─── Unit Sales (Group Wholesale) ─────────────────────────────────────────

export async function createUnitSale(farmerId, farmerName, saleData) {
  const { initialQuantity, inventoryId, cropType, targetQuantity, pricePerUnit, description } = saleData;
  return addDoc(collection(db, 'unit_sales'), {
    cropType,
    targetQuantity,
    pricePerUnit,
    description,
    currentQuantity: initialQuantity,
    contributors: [{ farmerId, farmerName, quantity: initialQuantity, inventoryId }],
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function getOpenUnitSales() {
  const q = query(
    collection(db, 'unit_sales'),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllUnitSales() {
  const q = query(collection(db, 'unit_sales'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function joinUnitSale(saleId, farmerId, farmerName, quantity, inventoryId) {
  const saleRef = doc(db, 'unit_sales', saleId);
  const sale = await getDoc(saleRef);
  if (!sale.exists()) throw new Error('Group sale not found');

  const data = sale.data();
  const newQuantity = data.currentQuantity + quantity;
  const newStatus = newQuantity >= data.targetQuantity ? 'active' : 'open';

  await updateDoc(saleRef, {
    contributors: arrayUnion({ farmerId, farmerName, quantity, inventoryId }),
    currentQuantity: newQuantity,
    status: newStatus,
  });
}

export async function buyUnitSale(saleId, buyerId, buyerName, quantity, pricePerUnit) {
  await updateDoc(doc(db, 'unit_sales', saleId), { status: 'completed' });
  return addDoc(collection(db, 'orders'), {
    buyerId,
    buyerName,
    unitSaleId: saleId,
    quantity,
    totalPrice: quantity * pricePerUnit,
    type: 'wholesale',
    status: 'confirmed',
    createdAt: serverTimestamp(),
  });
}

// ─── Orders ───────────────────────────────────────────────────────────────

export async function getMyOrders(buyerId) {
  const q = query(
    collection(db, 'orders'),
    where('buyerId', '==', buyerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Inventory ────────────────────────────────────────────────────────────

export async function addToInventory(farmerId, inventoryData) {
  return addDoc(collection(db, 'inventory'), {
    farmerId,
    ...inventoryData,
    status: 'available',
    createdAt: serverTimestamp(),
  });
}

export async function getMyInventory(farmerId) {
  const q = query(
    collection(db, 'inventory'),
    where('farmerId', '==', farmerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markInventoryListed(inventoryId) {
  await updateDoc(doc(db, 'inventory', inventoryId), { status: 'listed' });
}
