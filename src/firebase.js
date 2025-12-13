import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyDHqZchJa7FCr3nmXvMma7fsmI8ACr9bRQ",
    authDomain: "web-liu.firebaseapp.com",
    databaseURL: "https://web-liu-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "web-liu",
    storageBucket: "web-liu.firebasestorage.app",
    messagingSenderId: "148777824637",
    appId: "1:148777824637:web:c7fe15d6e4d9c8b906dc14",
    measurementId: "G-93S4LP15RL"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { app, db };
