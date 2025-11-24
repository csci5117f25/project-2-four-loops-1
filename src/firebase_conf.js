
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore'

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqZTmlLBWhx7awpLJ1Uuls9pVhRS_tey0",
  authDomain: "project2-e9097.firebaseapp.com",
  projectId: "project2-e9097",
  storageBucket: "project2-e9097.firebasestorage.app",
  messagingSenderId: "356904850",
  appId: "1:356904850:web:b621dc69626ba76cc3db4b"
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp)
export const auth = getAuth(firebaseApp);
