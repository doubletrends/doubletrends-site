const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 8080;
const ROOT = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safePathname(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${HOST}:${PORT}`).pathname);
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  return normalized === path.sep ? 'index.html' : normalized.replace(/^[/\\]+/, '');
}

function resolveRequest(urlPath) {
  const relativePath = safePathname(urlPath);
  const requested = path.resolve(ROOT, relativePath);
  const indexFallback = path.resolve(ROOT, relativePath, 'index.html');

  if (!requested.startsWith(ROOT) || !indexFallback.startsWith(ROOT)) return null;

  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) return requested;
  if (fs.existsSync(indexFallback) && fs.statSync(indexFallback).isFile()) return indexFallback;

  return null;
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequest(req.url || '/');
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Serving dist/ at http://${HOST}:${PORT}`);
});
