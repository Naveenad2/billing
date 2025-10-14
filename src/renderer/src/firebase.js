import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDov3m4NTtZ1wcgaORxaVNkdp_nfplYbGM",
  authDomain: "whitehills-billing-software.firebaseapp.com",
  projectId: "whitehills-billing-software",
  storageBucket: "whitehills-billing-software.firebasestorage.app",
  messagingSenderId: "483211904879",
  appId: "1:483211904879:web:cdcca4d872a339fb930a9a",
  measurementId: "G-CXCWBNREN9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);