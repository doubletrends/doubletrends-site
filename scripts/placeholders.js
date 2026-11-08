/**
 * placeholders.js
 * The {{NAME}} placeholder mechanism shared by every generated file: pages,
 * and llms.txt.
 */

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

module.exports = { replace, assertResolved };
