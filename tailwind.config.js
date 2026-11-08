const { COLORS, FONTS } = require('./src/brand.config');

module.exports = {
  content: [
    './src/pages/**/*.html',
    './src/partials/**/*.html',
  ],
  theme: {
    extend: {
      colors: COLORS,
      fontFamily: FONTS,
    },
  },
};
