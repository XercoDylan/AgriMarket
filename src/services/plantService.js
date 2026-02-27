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
} from 'firebase/firestore';
import { db } from '../config/firebase';

export async function savePlantingPlan(farmerId, planData) {
  return addDoc(collection(db, 'planting_plans'), {
    farmerId,
    ...planData,
    status: 'active',
    createdAt: serverTimestamp(),
  });
}

export async function getMyPlantingPlans(farmerId) {
  const q = query(
    collection(db, 'planting_plans'),
    where('farmerId', '==', farmerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markPlanHarvested(planId) {
  await updateDoc(doc(db, 'planting_plans', planId), { status: 'harvested' });
}

// Approximate area of a polygon using the Shoelace formula
export function calculateFarmArea(coordinates) {
  if (coordinates.length < 3) return 0;
  const R = 6371000; // Earth radius in metres
  let area = 0;
  const n = coordinates.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = (coordinates[i].latitude * Math.PI) / 180;
    const lat2 = (coordinates[j].latitude * Math.PI) / 180;
    const lon1 = (coordinates[i].longitude * Math.PI) / 180;
    const lon2 = (coordinates[j].longitude * Math.PI) / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = (Math.abs(area) * R * R) / 2;
  return area / 10000; // Convert m² to hectares
}
