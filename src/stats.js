import { ref, onValue, push, onDisconnect, set, runTransaction } from "firebase/database";
import { db } from "./firebase";

export function initStats() {
    if (!db) return;

    // --- Core Presence & Visit Logic (runs on all pages) ---
    const onlineRef = ref(db, "online");
    const totalVisitsRef = ref(db, "totalVisits");
    const connectedRef = ref(db, ".info/connected");

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            fetch('https://api.ipify.org?format=json')
                .then(response => response.json())
                .then(data => {
                    const ip = data.ip;
                    const userAgent = navigator.userAgent;
                    const userData = `${ip} - ${userAgent}`;
                    const userRef = push(onlineRef, userData);
                    onDisconnect(userRef).remove();
                })
                .catch(error => {
                    console.error('Error getting user data for online presence:', error);
                    // Fallback to original behavior
                    const userRef = push(onlineRef, true);
                    onDisconnect(userRef).remove();
                });
        }
    });

    if (!sessionStorage.getItem("hasIncrementedVisits")) {
        runTransaction(totalVisitsRef, (currentValue) => {
            return (currentValue || 0) + 1;
        });
        sessionStorage.setItem("hasIncrementedVisits", "true");
    }

    // --- User Data Logging ---
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            const ip = data.ip;
            const userAgent = navigator.userAgent;
            const userData = `${ip} - ${userAgent}`;
            const userDataRef = push(ref(db, 'user_data'));
            set(userDataRef, userData);
        })
        .catch(error => {
            console.error('Error getting user data:', error);
        });

    // --- UI Display Logic (only runs if elements exist on the page) ---
    const onlineUsersSpan = document.getElementById("online-users");
    const totalVisitsSpan = document.getElementById("total-visits-count");

    if (onlineUsersSpan && totalVisitsSpan) {
        onValue(onlineRef, (snap) => {
            onlineUsersSpan.textContent = snap.numChildren();
        });

        onValue(totalVisitsRef, (snap) => {
            const visits = snap.val() || 0;
            totalVisitsSpan.textContent = visits.toLocaleString();
        });
    }
}