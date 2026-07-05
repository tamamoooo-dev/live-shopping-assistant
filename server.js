// server.js — a tiny zero-dependency static file server.
//
// You do NOT strictly need this: the app talks to Panda directly from the
// browser. But the app is split into ES modules, and browsers refuse to load
// modules from file:// URLs, so serving the folder over http is the easy way
// to run it locally and to open it from your phone on the same Wi-Fi.
//
//   node server.js        -> http://localhost:5173
//
// To open it on your iPhone: run this on your computer, find that computer's
// local IP (e.g. 192.168.1.20), and visit http://192.168.1.20:5173 in Safari.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(ROOT, path.normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const type = TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Live Shopping Assistant running:`);
  console.log(`  Desktop:  http://localhost:${PORT}`);
  console.log(`  Phone:    http://<your-computer-ip>:${PORT}  (same Wi-Fi)`);
});
