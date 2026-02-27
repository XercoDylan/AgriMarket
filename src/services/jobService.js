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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export async function createJob(farmerId, farmerName, jobData) {
  return addDoc(collection(db, 'jobs'), {
    farmerId,
    farmerName,
    ...jobData,
    applicants: [],
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function getMyJobs(farmerId) {
  const q = query(
    collection(db, 'jobs'),
    where('farmerId', '==', farmerId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOpenJobs() {
  const q = query(
    collection(db, 'jobs'),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function applyForJob(jobId, contractorId, contractorName, message) {
  const ref = doc(db, 'jobs', jobId);
  await updateDoc(ref, {
    applicants: arrayUnion({
      contractorId,
      contractorName,
      message,
      status: 'pending',
      appliedAt: new Date().toISOString(),
    }),
  });
}

export async function acceptApplicant(jobId, contractorId) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status: 'filled',
    acceptedContractorId: contractorId,
  });
}

export async function closeJob(jobId) {
  await updateDoc(doc(db, 'jobs', jobId), { status: 'completed' });
}
