import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#E6F3EC",
          100: "#C8E6D4",
          400: "#3DA86A",
          500: "#2A7A50",
          600: "#22613E",
          700: "#1A4A2E",
        },
        income:   "#22A156",
        expense:  "#C8372A",
        transfer: "#3B82F6",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
