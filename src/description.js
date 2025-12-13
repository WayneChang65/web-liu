import './style.css';
import { initStats } from './stats';

// Apply dark mode if it was set on the main page
const savedTheme = localStorage.getItem("theme") || "light";
if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
}

// Initialize stats
initStats();
