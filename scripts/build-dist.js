/* ════════════════ build-dist.js ════════════════
 * Assemble dans dist/ les seuls fichiers nécessaires à l'application
 * (index.html, js/, css/, vendor/). C'est ce dossier que Tauri embarque
 * comme frontendDist : la racine du projet, elle, contient node_modules et
 * src-tauri/target, que Tauri refuse d'embarquer.
 *   node scripts/build-dist.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');

/* Dossiers et fichiers embarqués tels quels. */
const ENTRIES = ['index.html', 'js', 'css', 'vendor'];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(rel) {
  const src = path.join(root, rel);
  const dst = path.join(out, rel);
  if (!fs.existsSync(src)) {
    console.error('Introuvable : ' + rel);
    process.exit(1);
  }
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(rel, name));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

rmrf(out);
fs.mkdirSync(out, { recursive: true });
for (const e of ENTRIES) copy(e);

/* Garde-fou : aucun CDN ne doit subsister dans les fichiers embarqués. */
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const remote = html.match(/https?:\/\/[^"')\s]+/g) || [];
const externes = remote.filter(u => !u.startsWith('http://ipc.localhost') && !u.startsWith('https://schema.tauri.app'));
if (externes.length) {
  console.error('Ressource distante détectée dans index.html :', externes.join(', '));
  process.exit(1);
}

/* Taille totale, pour information. */
let bytes = 0;
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    fs.statSync(p).isDirectory() ? walk(p) : (bytes += fs.statSync(p).size);
  }
})(out);

console.log(`dist/ assemblé : ${ENTRIES.join(', ')} — ${(bytes / 1024).toFixed(0)} kB, 0 ressource distante.`);
