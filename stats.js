document.addEventListener("DOMContentLoaded", () => {
  // This configuration and initialization part runs on ALL pages that include the script.
  const firebaseConfig = {
    apiKey: "AIzaSyDHqZchJa7FCr3nmXvMma7fsmI8ACr9bRQ",
    authDomain: "web-liu.firebaseapp.com",
    databaseURL:
      "https://web-liu-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "web-liu",
    storageBucket: "web-liu.firebasestorage.app",
    messagingSenderId: "148777824637",
    appId: "1:148777824637:web:c7fe15d6e4d9c8b906dc14",
    measurementId: "G-93S4LP15RL",
  };

  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn("Firebase config is not set in stats.js!");
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const database = firebase.database();

  // --- Core Presence & Visit Logic (runs on all pages) ---
  const onlineRef = database.ref("online");
  const totalVisitsRef = database.ref("totalVisits");
  const connectedRef = database.ref(".info/connected");

  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
          const ip = data.ip;
          const userAgent = navigator.userAgent;
          const userData = `${ip} - ${userAgent}`;
          const userRef = onlineRef.push(userData);
          userRef.onDisconnect().remove();
        })
        .catch(error => {
          console.error('Error getting user data for online presence:', error);
          // Fallback to original behavior
          const userRef = onlineRef.push(true);
          userRef.onDisconnect().remove();
        });
    }
  });

  if (!sessionStorage.getItem("hasIncrementedVisits")) {
    totalVisitsRef.transaction((currentValue) => {
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
      const userDataRef = database.ref('user_data').push();
      userDataRef.set(userData);
    })
    .catch(error => {
      console.error('Error getting user data:', error);
    });

  // --- UI Display Logic (only runs if elements exist on the page) ---
  const onlineUsersSpan = document.getElementById("online-users");
  const totalVisitsSpan = document.getElementById("total-visits-count");

  if (onlineUsersSpan && totalVisitsSpan) {
    onlineRef.on("value", (snap) => {
      onlineUsersSpan.textContent = snap.numChildren();
    });

    totalVisitsRef.on("value", (snap) => {
      const visits = snap.val() || 0;
      totalVisitsSpan.textContent = visits.toLocaleString();
    });
  }
});
