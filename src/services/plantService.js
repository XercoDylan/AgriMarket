import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export async function savePlantingPlan(farmerId, planData) {
  return addDoc(collection(db, 'planting_plans'), {
    farmerId,
    ...planData,
    status: 'active',
    createdAt: serverTimestamp(),
  });
}

export async function getMyPlantingPlans(farmerId) {
  const q = query(collection(db, 'planting_plans'), where('farmerId', '==', farmerId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function markPlanHarvested(planId) {
  await updateDoc(doc(db, 'planting_plans', planId), { status: 'harvested' });
}

export function orderBoundaryPoints(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return coordinates || [];

  const center = coordinates.reduce(
    (acc, point) => ({
      lat: acc.lat + point.latitude / coordinates.length,
      lon: acc.lon + point.longitude / coordinates.length,
    }),
    { lat: 0, lon: 0 }
  );

  return [...coordinates].sort((a, b) => {
    const angleA = Math.atan2(a.latitude - center.lat, a.longitude - center.lon);
    const angleB = Math.atan2(b.latitude - center.lat, b.longitude - center.lon);
    return angleA - angleB;
  });
}

// Approximate area of a polygon using the Shoelace formula
export function calculateFarmArea(coordinates) {
  const ordered = orderBoundaryPoints(coordinates);
  if (ordered.length < 3) return 0;
  const R = 6371000; // Earth radius in metres
  let area = 0;
  const n = ordered.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = (ordered[i].latitude * Math.PI) / 180;
    const lat2 = (ordered[j].latitude * Math.PI) / 180;
    const lon1 = (ordered[i].longitude * Math.PI) / 180;
    const lon2 = (ordered[j].longitude * Math.PI) / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = (Math.abs(area) * R * R) / 2;
  return area / 10000; // Convert m² to hectares
}
