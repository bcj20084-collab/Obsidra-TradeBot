/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#07090e",
        panel: "#10141d",
        border: "#222938",
        cyan: "#50e3c2",
      },
      boxShadow: {
        glow: "0 0 40px rgba(80, 227, 194, 0.08)",
      },
    },
  },
  plugins: [],
};
