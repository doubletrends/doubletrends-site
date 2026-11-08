/**
 * placeholders.js
 * The {{NAME}} placeholder mechanism shared by every generated file: pages,
 * and llms.txt, and the site facts every one of them can use.
 */
const { SITE_URL, SITE_NAME, SUBSCRIBE_URL, PORTAL_URL, PUBLISHER } = require('../src/site.config');

const SITE_VARS = {
  SITE_URL,
  SITE_NAME,
  LEGAL_NAME: PUBLISHER.legalName,
  EMAIL: PUBLISHER.email,
  SUBSCRIBE_URL,
  PORTAL_URL,
};

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

module.exports = { SITE_VARS, replace, assertResolved };
