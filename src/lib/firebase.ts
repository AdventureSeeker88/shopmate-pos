import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBpqYBOkouwEgMSV3NMX4iM0HXnnBDC5YY",
  authDomain: "saimmobile-80129.firebaseapp.com",
  projectId: "saimmobile-80129",
  storageBucket: "saimmobile-80129.firebasestorage.app",
  messagingSenderId: "343727603598",
  appId: "1:343727603598:web:41d763e6b4fc340271eedf",
  measurementId: "G-SJ7H8MEHN1",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
