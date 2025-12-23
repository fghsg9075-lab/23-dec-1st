import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, set, get, child, onValue } from "firebase/database";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, onSnapshot } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// --- 1. Aapka Naya Firebase Configuration (students-app-deae5) ---
const firebaseConfig = {
  apiKey: "AIzaSyC7N3IOa7GRETNRBo8P-QKVFzg2bLqoEco",
  authDomain: "students-app-deae5.firebaseapp.com",
  databaseURL: "https://students-app-deae5-default-rtdb.firebaseio.com",
  projectId: "students-app-deae5",
  storageBucket: "students-app-deae5.firebasestorage.app",
  messagingSenderId: "128267767708",
  appId: "1:128267767708:web:08ed73b1563b2f3eb60259"
};

// --- 2. Initialization ---
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Connections jo AdminDashboard use karega
export const auth = getAuth(app);        // Authentication
export const rtdb = getDatabase(app);    // Realtime Database: Notes/MCQ ke liye
export const db = getFirestore(app);     // Firestore: User list ke liye

let isConnected = false;

// Monitor Connection State
const connectedRef = ref(rtdb, ".info/connected");
onValue(connectedRef, (snap) => {
    isConnected = !!snap.val();
});

// Symbols saaf karne ke liye helper function
const sanitize = (key: string) => key.replace(/[.#$\[\]]/g, '_');

// --- 3. FIRESTORE FUNCTIONS (User Management ke liye) ---

// Naya user live database mein save karne ke liye
export const saveUserToLive = async (userData: any) => {
    try {
        // We use userData.id as doc ID
        await setDoc(doc(db, "users", userData.id), {
            ...userData,
            lastSeen: new Date().toISOString(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("✅ User Full Data Synced to Live!");
    } catch (e) {
        console.error("Firestore Error:", e);
    }
};

export const subscribeToUsers = (onUpdate: (users: any[]) => void) => {
    const q = collection(db, "users");
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const users: any[] = [];
        querySnapshot.forEach((doc) => {
            users.push(doc.data());
        });
        onUpdate(users);
    });
    return unsubscribe;
};

export const updateUserStatus = async (userId: string, activeSeconds: number) => {
    try {
        await setDoc(doc(db, "users", userId), {
            lastSeen: new Date().toISOString(),
            dailyActiveSeconds: activeSeconds
        }, { merge: true });
    } catch (e) {
        console.error("Status Update Error:", e);
    }
};

export const saveTestResult = async (userId: string, result: any) => {
    try {
        const userRef = doc(db, "users", userId);
        // We use arrayUnion to add the new test result to the 'testHistory' array
        await updateDoc(userRef, {
            testHistory: arrayUnion(result),
            lastTestTaken: new Date().toISOString()
        });
        console.log("✅ Test Result Synced to Firestore!");
    } catch (e: any) {
        console.error("Test Sync Error:", e);
        // Fallback: If document doesn't exist or other error, try setDoc with merge
        if (e.code === 'not-found' || e.message.includes('No document to update')) {
             await setDoc(doc(db, "users", userId), {
                testHistory: [result],
                lastTestTaken: new Date().toISOString()
            }, { merge: true });
        }
    }
};

// --- 4. REALTIME DATABASE FUNCTIONS (Content & Admin Control) ---

// Dashboard mein "Online" dot dikhane ke liye
export const checkFirebaseConnection = (): boolean => {
    return isConnected;
};

// --- NEW: FIRESTORE CONTENT FUNCTIONS (Requested by User) ---

export const saveContentToFirestore = async (key: string, data: any) => {
    try {
        // We use the key as the Document ID in 'content' collection
        // Also flattening the data to match requested schema if possible, or keeping structure
        await setDoc(doc(db, "content", sanitize(key)), {
            ...data,
            // Ensure these fields exist if not present
            premium: data.premiumLink || data.premiumVideoLink ? true : (data.premium || false),
            title: data.title || key,
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("✅ Content Saved to Firestore!");
    } catch (e) {
        console.error("Firestore Content Save Error:", e);
    }
};

export const getContentFromFirestore = async (key: string) => {
    try {
        const docRef = doc(db, "content", sanitize(key));
        const snap = await getDoc(docRef); // You need to import getDoc
        if (snap.exists()) {
            const val = snap.data();
            localStorage.setItem(key, JSON.stringify(val));
            return val;
        }
    } catch (e) {
        console.error("Firestore Content Read Error:", e);
    }
    return null;
};

// Notes/Content save karne ke liye (Legacy Support + Firestore Forwarding)
export const saveChapterData = async (key: string, data: any) => {
    // 1. Save to Firestore (Primary now)
    await saveContentToFirestore(key, data);

    // 2. Also save to RTDB for backward compatibility if needed, or fallback
    if (!rtdb) return;
    try {
        await set(ref(rtdb, 'nst_content/' + sanitize(key)), data);
    } catch (e) {
        console.error("RTDB Save Error:", e);
        localStorage.setItem(key, JSON.stringify(data)); 
    }
};

// Cloud se data wapas dashboard mein laane ke liye
export const getChapterData = async (key: string) => {
    const local = localStorage.getItem(key);
    
    // 1. Try LocalStorage First (Optimization for lower reads)
    if (local) {
        // We return local immediately to save a DB read.
        // User can clear cache/re-login if they really need fresh content.
        return JSON.parse(local);
    }
    
    // 2. Try Firestore
    const firestoreData = await getContentFromFirestore(key);
    if (firestoreData) return firestoreData;

    // 3. Fallback to RTDB
    if (rtdb) {
        try {
            const snapshot = await get(child(ref(rtdb), 'nst_content/' + sanitize(key)));
            if (snapshot.exists()) {
                const val = snapshot.val();
                localStorage.setItem(key, JSON.stringify(val)); 
                return val;
            }
        } catch (e) {
            console.error("Firebase Read Error:", e);
        }
    }
    
    return null;
};

// Bulk (ek saath bahut saara) data upload ke liye
export const bulkSaveLinks = async (updates: Record<string, any>) => {
    if (!rtdb) return;
    try {
        const promises = Object.keys(updates).map(key => {
            return set(ref(rtdb, 'nst_content/' + sanitize(key)), updates[key]);
        });
        await Promise.all(promises);
        console.log("🚀 Bulk Upload Complete!");
    } catch (e) {
        console.error("Bulk Sync Error:", e);
    }
};

// --- 5. SYSTEM SETTINGS SYNC ---

export const saveSystemSettings = async (settings: any) => {
    if (!rtdb) return;
    try {
        await set(ref(rtdb, 'nst_system_settings'), settings);
        console.log("✅ Settings Cloud Sync!");
    } catch (e) {
        console.error("Settings Sync Error:", e);
    }
};

export const subscribeToSettings = (onUpdate: (settings: any) => void) => {
    if (!rtdb) return () => {};
    const settingsRef = ref(rtdb, 'nst_system_settings');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            onUpdate(data);
            // Also update local storage for fallback
            localStorage.setItem('nst_system_settings', JSON.stringify(data));
        }
    });
    return unsubscribe;
};
