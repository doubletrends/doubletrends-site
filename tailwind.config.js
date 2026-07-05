const { COLORS, FONTS } = require('./src/brand.config');

module.exports = {
  content: [
    './src/pages/**/*.html',
    './src/_partials/**/*.html',
  ],
  theme: {
    extend: {
      colors: COLORS,
      fontFamily: FONTS,
      maxWidth: { site: '1320px', hero: '1000px' },
    },
  },
};
