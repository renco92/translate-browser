/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./sidepanel/**/*.html",
    "./sidepanel/**/*.js",
    "./studio/**/*.html",
    "./studio/**/*.js",
    "./content/**/*.js",
    "./shared/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['Space Grotesk', 'monospace'],
        display: ['Montserrat', 'Outfit', 'sans-serif'],
        jp: ['"Noto Sans JP"', 'Montserrat', 'sans-serif']
      },
      colors: {
        zinc: {
          950: '#090a0f',
          900: '#121316',
          850: '#18181b',
          800: '#27272a',
          700: '#3f3f46',
          600: '#52525b',
          500: '#71717a',
          400: '#a1a1aa',
          300: '#d4d4d8',
          200: '#e4e4e7',
          100: '#f4f4f5'
        }
      }
    }
  },
  plugins: []
};
