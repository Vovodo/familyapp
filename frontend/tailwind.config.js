/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        family: {
          50: '#fdf4f5',
          100: '#fce7e9',
          200: '#f9d3d7',
          300: '#f4b0b7',
          400: '#ec818e',
          500: '#de5567',
          600: '#ca374c',
          700: '#aa293c',
          800: '#8d2535',
          900: '#762431',
        },
        warm: {
          50: '#faf9f6',
          100: '#f5f3ee',
          200: '#e8e4db',
          300: '#d7d0c2',
          400: '#b8ad99',
          500: '#9d8f78',
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
