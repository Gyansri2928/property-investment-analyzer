import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC2qtcM_eiroC6ZGCbCkrR6R4LX0BThvQM",
  authDomain: "property-investment-anal-a3b3d.firebaseapp.com",
  projectId: "property-investment-anal-a3b3d",
  storageBucket: "property-investment-anal-a3b3d.firebasestorage.app",
  messagingSenderId: "689023568440",
  appId: "1:689023568440:web:ea0a93e7662a658450b4cd"
};

// Debug: Check if env variables are loaded
console.log('Firebase Config Loaded:', {
  hasApiKey: !!process.env.REACT_APP_FIREBASE_API_KEY,
  hasProjectId: !!process.env.REACT_APP_FIREBASE_PROJECT_ID,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;