import { firebaseConfig, STATION_JOBS_COLLECTION } from './firebaseConfig.js';

/** Keep station jobs for 14 days, then delete automatically. */
export const STATION_JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

let dbPromise = null;
let purgeInFlight = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      return getFirestore(app);
    })();
  }
  return dbPromise;
}

/** Safe Firestore document id from a batch key. */
export function stationJobId(batchKey) {
  return String(batchKey || '')
    .trim()
    .replace(/[/#[\]]/g, '_')
    .slice(0, 700);
}

/** Cutoff timestamp: jobs with sentAt older than this are expired. */
export function stationJobExpiryCutoff(now = Date.now()) {
  return now - STATION_JOB_RETENTION_MS;
}

/** True if a job is still within the 14-day retention window. */
export function isStationJobActive(job, now = Date.now()) {
  const sentAt = Number(job?.sentAt) || 0;
  return sentAt >= stationJobExpiryCutoff(now);
}

/** Drop expired jobs from an in-memory list. */
export function retainActiveStationJobs(jobs, now = Date.now()) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) => isStationJobActive(job, now));
}

/**
 * Delete station jobs older than 14 days.
 * Safe to call often; concurrent calls share one in-flight purge.
 * @returns {Promise<number>} number of docs deleted
 */
export async function purgeExpiredStationJobs(now = Date.now()) {
  if (purgeInFlight) return purgeInFlight;

  purgeInFlight = (async () => {
    const cutoff = stationJobExpiryCutoff(now);
    const { collection, query, where, getDocs, writeBatch, limit } = await import(
      'firebase/firestore'
    );
    const db = await getDb();
    let deleted = 0;

    // Chunked deletes (Firestore batch max 500).
    for (;;) {
      const snap = await getDocs(
        query(
          collection(db, STATION_JOBS_COLLECTION),
          where('sentAt', '<', cutoff),
          limit(400)
        )
      );
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) break;
    }

    return deleted;
  })().finally(() => {
    purgeInFlight = null;
  });

  return purgeInFlight;
}

function scheduleStationPurge() {
  void purgeExpiredStationJobs().catch((err) => {
    console.warn('Station job purge failed:', err);
  });
}

/**
 * Filter station jobs by free-text (batch key / order #) and material.
 * @param {object[]} jobs
 * @param {{ query?: string, material?: string }} [filters]
 */
export function filterStationJobs(jobs, filters = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const q = String(filters.query || '')
    .trim()
    .toLowerCase();
  const mat = String(filters.material || '')
    .trim()
    .toLowerCase();

  return list.filter((job) => {
    if (mat) {
      const jobMat = String(job.materialName || '')
        .trim()
        .toLowerCase();
      if (jobMat !== mat) return false;
    }
    if (!q) return true;
    const key = String(job.batchKey || '').toLowerCase();
    if (key.includes(q)) return true;
    const orders = Array.isArray(job.orders) ? job.orders : [];
    return orders.some((order) => String(order).toLowerCase().includes(q));
  });
}

/** Unique material names from jobs, sorted. */
export function uniqueStationMaterials(jobs) {
  const set = new Set();
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    const name = String(job.materialName || '').trim();
    if (name) set.add(name);
  });
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Push / update a batch cut list in the station queue.
 * Re-sending the same batchKey replaces that job.
 * @param {{
 *   batchKey: string,
 *   fileName?: string,
 *   materialName?: string,
 *   totalBoxes?: number,
 *   orders?: string[],
 *   isSpecial?: boolean,
 *   html: string,
 * }} job
 * @param {{ skipPurge?: boolean }} [options]
 */
export async function publishStationJob(job, options = {}) {
  if (!job?.batchKey || !job?.html) {
    throw new Error('Missing batch cut list to send.');
  }

  const id = stationJobId(job.batchKey);
  if (!id) throw new Error('Invalid batch key.');

  const { doc, setDoc } = await import('firebase/firestore');
  const orders = (Array.isArray(job.orders) ? job.orders : [])
    .map((o) => String(o).trim())
    .filter(Boolean);

  const payload = {
    id,
    batchKey: String(job.batchKey),
    fileName: String(job.fileName || ''),
    materialName: String(job.materialName || ''),
    totalBoxes: Number(job.totalBoxes) || 0,
    orders,
    isSpecial: Boolean(job.isSpecial),
    html: String(job.html),
    sentAt: Date.now(),
  };

  await setDoc(doc(await getDb(), STATION_JOBS_COLLECTION, id), payload);
  if (!options.skipPurge) scheduleStationPurge();
  return payload;
}

/**
 * Subscribe to all station jobs (newest first).
 * Expired jobs (>14 days) are hidden and deleted in the background.
 * @param {(jobs: object[]) => void} onJobs
 * @param {(err: Error) => void} [onError]
 * @returns {Promise<() => void>} unsubscribe
 */
export async function subscribeStationJobs(onJobs, onError) {
  scheduleStationPurge();
  const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
  const q = query(collection(await getDb(), STATION_JOBS_COLLECTION), orderBy('sentAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onJobs(retainActiveStationJobs(jobs));
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    }
  );
}

export function isStationHash(hash = globalThis.location?.hash || '') {
  return hash === '#station' || hash.startsWith('#station/');
}

/** Selected batch key from `#station` or `#station/BATCH_KEY`. */
export function stationHashBatchKey(hash = globalThis.location?.hash || '') {
  if (!isStationHash(hash)) return '';
  const raw = hash.replace(/^#station\/?/, '');
  return raw ? decodeURIComponent(raw) : '';
}
