/* ════════════════ build-icons.js ════════════════
 * Génère vendor/lucide-local.js : un shim local « lucide » (API compatible
 * createIcons) contenant uniquement les icônes listées dans scripts/lucide-icons.txt.
 * À relancer (depuis un poste connecté) si de nouvelles icônes sont utilisées :
 *   npm i lucide && node scripts/build-icons.js
 * Licence des données d'icônes : ISC (lucide).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const names = fs.readFileSync(path.join(root, 'scripts/lucide-icons.txt'), 'utf8')
  .split('\n').map(s => s.trim()).filter(Boolean);

// chargement du paquet lucide (résolution CJS puis ESM via dist/cjs)
let icons;
try {
  icons = require('lucide/dist/cjs/lucide.js');
} catch {
  icons = require('lucide');
}

const out = {};
let missing = [];
for (const n of names) {
  const pascal = n.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  const el = icons[pascal] || icons[n];
  if (!el) { missing.push(n); continue; }
  const [, attrs, children] = el;
  let inner = '';
  for (const c of (children || [])) {
    const [tag, tattrs] = c;
    inner += '<' + tag + ' ' + Object.entries(tattrs).map(([k, v]) => k + '="' + v + '"').join(' ') + '/>';
  }
  const a = Object.entries(attrs).filter(([k]) => k !== 'xmlns').map(([k, v]) => k + '="' + v + '"').join(' ');
  out[n] = a + '>' + inner;
}
if (missing.length) { console.error('Icônes introuvables :', missing.join(', ')); process.exitCode = 1; }

const banner = `/* lucide-local.js — shim local "lucide" sans réseau (données d'icônes : lucide, licence ISC).
 * Icônes embarquées (${Object.keys(out).length}) : ${Object.keys(out).sort().join(', ')}
 * Régénéré par scripts/build-icons.js — ne pas éditer à la main. */`;

const code = `${banner}
(function () {
  var ICONS = ${JSON.stringify(out, null, 0)};
  function svgFor(name, cls) {
    var d = ICONS[name];
    if (!d) return null;
    return '<svg xmlns="http://www.w3.org/2000/svg" ' + d + (cls ? ' class="' + cls + '"' : '') + '></svg>';
  }
  function createIcons(root_) {
    var scope = root_ || document;
    scope.querySelectorAll('[data-lucide]').forEach(function (el) {
      if (el.namespaceURI !== 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() === 'i') {
        var name = el.getAttribute('data-lucide');
        var s = svgFor(name, el.getAttribute('class') || '');
        if (s) { var tpl = document.createElement('template'); tpl.innerHTML = s; el.replaceWith(tpl.content.firstChild); }
      }
    });
  }
  window.lucide = { createIcons: createIcons, ICONS: ICONS };
})();
`;

fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'vendor/lucide-local.js'), code);
console.log('vendor/lucide-local.js généré :', Object.keys(out).length, 'icônes,', (code.length / 1024).toFixed(1), 'kB');
