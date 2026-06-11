const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  'README.md',
  'dist',
  path.join('public', 'js'),
];
const TEXT_EXTS = new Set(['.md', '.js', '.html']);
const TRADEMARK_LITERAL = 'DoubleTrends';
const ALLOWED_SUFFIXES = ['™', '&trade;', '%E2%84%A2'];
const ENTITY_SUFFIX = ' L.L.C.';

function walk(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];

  const out = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return file.split(path.sep).join('/').replace(`${ROOT.split(path.sep).join('/')}/`, '');
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function isAllowedSuffix(text, indexAfterLiteral) {
  return (
    ALLOWED_SUFFIXES.some((suffix) => text.startsWith(suffix, indexAfterLiteral)) ||
    text.startsWith(ENTITY_SUFFIX, indexAfterLiteral)
  );
}

function main() {
  const files = TARGETS
    .map((target) => path.join(ROOT, target))
    .flatMap((targetPath) => walk(targetPath))
    .filter((file) => TEXT_EXTS.has(path.extname(file)));

  const errors = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let index = text.indexOf(TRADEMARK_LITERAL);

    while (index !== -1) {
      const after = index + TRADEMARK_LITERAL.length;
      if (!isAllowedSuffix(text, after)) {
        errors.push(`${rel(file)}:${lineNumberAt(text, index)} bare "${TRADEMARK_LITERAL}"`);
      }
      index = text.indexOf(TRADEMARK_LITERAL, after);
    }
  }

  if (errors.length) {
    console.error(`Trademark test failed with ${errors.length} issue(s):\n`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Trademark test passed across ${files.length} text files.`);
}

main();
