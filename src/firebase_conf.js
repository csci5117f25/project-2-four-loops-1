
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore'

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAD46ThM5Rq-PiZs1vCK6Ff82YYczz-rw",
  authDomain: "lec21-test.firebaseapp.com",
  projectId: "lec21-test",
  storageBucket: "lec21-test.firebasestorage.app",
  messagingSenderId: "114123285847",
  appId: "1:114123285847:web:8b4bc1ebbd9cc743c40a12"
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp)
