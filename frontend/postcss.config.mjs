// Location: frontend/postcss.config.mjs
// Tailwind v4 runs as a PostCSS plugin. No tailwind.config file needed:
// theme customisation lives in app/globals.css (@theme).
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
