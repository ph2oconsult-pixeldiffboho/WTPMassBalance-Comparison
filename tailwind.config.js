/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Source Serif 4'", "'Source Serif Pro'", "Georgia", "serif"],
        sans: ["'Inter Tight'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "monospace"],
      },
      colors: {
        ink: {
          900: "#0E1116",
          800: "#1A1F26",
          700: "#2B313A",
          500: "#5A6270",
          300: "#9AA2B0",
          100: "#E8EAEE",
        },
        paper: {
          DEFAULT: "#F7F4ED",
          dark: "#EFEAE0",
        },
        accent: {
          rust: "#B0451F",
          ochre: "#C8961A",
          sage: "#5A7359",
          slate: "#3F5870",
        },
      },
    },
  },
  plugins: [],
};
