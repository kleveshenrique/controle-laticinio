import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f7f4",
        ink: "#1c2420",
        line: "#dde2dc",
        muted: "#66716a",
        brand: { 50: "#eef6f1", 600: "#237a5a", 700: "#1b6149", 900: "#10392b" },
      },
    },
  },
  plugins: [],
};
export default config;
