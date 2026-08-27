import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, increment, updateDoc } from 'firebase/firestore';

// Todo: Replace with your actual Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyApNJ4cnYHej55HYX_aCoian_8dJZJBLFs",
  authDomain: "kala-males.firebaseapp.com",
  projectId: "kala-males",
  storageBucket: "kala-males.firebasestorage.app",
  messagingSenderId: "545716143530",
  appId: "1:545716143530:web:55499f2706bbffe5c857d3",
  measurementId: "G-WD4288SVL7"
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
