// client/src/firebase.js
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection,
    query,
    onSnapshot
} from "firebase/firestore";

// IMPORTANT: Use the global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Sign in handler using the provided custom token
export async function initializeAuth() {
    try {
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Signed in with custom token.");
        } else {
            // Fallback for environments without the token
            await signInAnonymously(auth);
            console.log("Signed in anonymously.");
        }
    } catch (error) {
        console.error("Firebase Auth Initialization Error:", error);
    }
}

// Security Rule Path Helper (using the mandated structure)
export const getPrivateUserDocRef = (userId, collectionName) => {
    return doc(db, `/artifacts/${appId}/users/${userId}/${collectionName}`, 'profile');
};

export const getPublicCollectionRef = (collectionName) => {
    return collection(db, `/artifacts/${appId}/public/data/${collectionName}`);
};

// Export services and handlers
export { db, auth, onAuthStateChanged };
