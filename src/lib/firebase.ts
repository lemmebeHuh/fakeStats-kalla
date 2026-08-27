import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, increment, updateDoc } from 'firebase/firestore';

// Todo: Replace with your actual Firebase Config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase only if config is provided to avoid crashing
let app;
let db: any = null;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } else {
    console.warn("Firebase is not configured. Analytics will not be saved.");
  }
} catch (e) {
  console.error("Firebase init error", e);
}

const STATS_DOC = 'analytics/counters';

export async function logGenerateEvent() {
  if (!db) return;
  try {
    const docRef = doc(db, STATS_DOC);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      await setDoc(docRef, { generate_count: 1, download_count: 0 });
    } else {
      await updateDoc(docRef, { generate_count: increment(1) });
    }
  } catch (e) {
    console.error("Failed to log generate event", e);
  }
}

export async function logDownloadEvent() {
  if (!db) return;
  try {
    const docRef = doc(db, STATS_DOC);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      await setDoc(docRef, { generate_count: 0, download_count: 1 });
    } else {
      await updateDoc(docRef, { download_count: increment(1) });
    }
  } catch (e) {
    console.error("Failed to log download event", e);
  }
}
