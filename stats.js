document.addEventListener("DOMContentLoaded", () => {
  const onlineUsersSpan = document.getElementById("online-users");
  const totalVisitsSpan = document.getElementById("total-visits-count");

  // If the stats elements don't exist on this page, do nothing.
  if (!onlineUsersSpan || !totalVisitsSpan) {
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyDHqZchJa7FCr3nmXvMma7fsmI8ACr9bRQ",
    authDomain: "web-liu.firebaseapp.com",
    databaseURL: "https://web-liu-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "web-liu",
    storageBucket: "web-liu.firebasestorage.app",
    messagingSenderId: "148777824637",
    appId: "1:148777824637:web:c7fe15d6e4d9c8b906dc14",
    measurementId: "G-93S4LP15RL",
  };

  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    onlineUsersSpan.textContent = "尚未設定";
    totalVisitsSpan.textContent = "尚未設定";
    console.warn("請在 stats.js 中填寫您的 Firebase 設定！");
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const database = firebase.database();

  // --- Online Users Logic ---
  const onlineRef = database.ref("online");
  const connectedRef = database.ref(".info/connected");

  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      const userRef = onlineRef.push(true);
      userRef.onDisconnect().remove();
    }
  });

  onlineRef.on("value", (snap) => {
    onlineUsersSpan.textContent = snap.numChildren();
  });

  // --- Total Visits Logic ---
  const totalVisitsRef = database.ref("totalVisits");

  totalVisitsRef.on("value", (snap) => {
    const visits = snap.val() || 0;
    totalVisitsSpan.textContent = visits.toLocaleString();
  });

  if (!sessionStorage.getItem('hasIncrementedVisits')) {
    totalVisitsRef.transaction((currentValue) => {
      return (currentValue || 0) + 1;
    });
    sessionStorage.setItem('hasIncrementedVisits', 'true');
  }
});
