/**
 * placeholders.js
 * The {{NAME}} placeholder mechanism shared by every generated file (pages
 * and llms.txt), the site facts every one of them can use, and the reader for
 * src/partials/.
 */
const fs = require('fs');
const path = require('path');
const { SITE_URL, SITE_NAME, SUBSCRIBE_URL, PORTAL_URL, PUBLISHER, OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_SIZE } = require('../src/site.config');

const SITE_VARS = {
  SITE_URL,
  SITE_NAME,
  LEGAL_NAME: PUBLISHER.legalName,
  EMAIL: PUBLISHER.email,
  SUBSCRIBE_URL,
  PORTAL_URL,
  OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_WIDTH: String(OG_IMAGE_SIZE.width),
  OG_IMAGE_HEIGHT: String(OG_IMAGE_SIZE.height),
};

// A partial's text. Fragments placed inside a line drop the file's final
// newline: partial(name, { inline: true }).
const PARTIALS = path.join(__dirname, '..', 'src', 'partials');
function partial(name, { inline = false } = {}) {
  const text = fs.readFileSync(path.join(PARTIALS, name), 'utf8');
  return inline ? text.replace(/\r?\n$/, '') : text;
}

// Function replacer: values are inserted literally ("$&", "$1" in generated
// markup must not be read as replacement patterns).
function replace(template, vars) {
  return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{{${k}}}`, () => v), template);
}

// The build fails on any placeholder left unresolved; `where` names the file.
function assertResolved(text, where) {
  const leftover = text.match(/\{\{[A-Z0-9_]+\}\}/);
  if (leftover) throw new Error(`${where}: unresolved placeholder ${leftover[0]}`);
  return text;
}

module.exports = { SITE_VARS, partial, replace, assertResolved };
