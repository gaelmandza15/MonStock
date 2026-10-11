/* ════════════════ dev-server.js — serveur HTTP local minimal (127.0.0.1) ════════════════
 * Utilisé par `npm run dev` et Tauri (`devUrl`). Aucun paquet externe :
 * uniquement le module http de Node. Sert les fichiers statiques du projet.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 1420);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.db': 'application/vnd.sqlite3'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if(urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if(err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`KlarStock dev server: http://${HOST}:${PORT}`);
});
