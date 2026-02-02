import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
// ✅ NEW IMPORTS: Modern Persistence Handling
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore'; 

const firebaseConfig = {
  apiKey: "AIzaSyBKBmioKtp_jd2hKrG62MlVRPMT07Rk8Ls",
  authDomain: "property-investment-anal-a3b3d.firebaseapp.com",
  projectId: "property-investment-anal-a3b3d",
  storageBucket: "property-investment-anal-a3b3d.firebasestorage.app",
  messagingSenderId: "689023568440",
  appId: "1:689023568440:web:ea0a93e7662a658450b4cd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ NEW DATABASE INITIALIZATION
// This replaces 'getFirestore()' + 'enableIndexedDbPersistence()'
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    // This allows the app to work in multiple tabs at once without error
    tabManager: persistentMultipleTabManager() 
  })
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// ✅ Helper Functions
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Login failed", error);
    alert(error.message);
  }
};

export const logoutUser = () => signOut(auth);

export default app;