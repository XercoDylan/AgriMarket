import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

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
  const q = query(collection(db, 'jobs'), where('farmerId', '==', farmerId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function getOpenJobs() {
  const q = query(collection(db, 'jobs'), where('status', '==', 'open'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
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
