/* ════════════════ build-tailwind.js ════════════════
 * Régénère vendor/tailwind.css (build Tailwind v3.4.x hors ligne une fois
 * les dépendances installées) à partir de js/config/tailwind.config.js et
 * des classes réellement utilisées dans index.html + js/.
 *   npm i -D tailwindcss@3.4.17 && node scripts/build-tailwind.js
 * Une safelist couvre les classes construites dynamiquement en JS
 * (ternaires de classes, toggle('...')) que le scanner ne verrait pas.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/* 1. Convertir la config navigateur (tailwind.config = {...}) en module Node */
const src = fs.readFileSync(path.join(root, 'js/config/tailwind.config.js'), 'utf8')
  .replace(/^\s*tailwind\.config\s*=/, 'module.exports =');
const cfgPath = path.join(root, 'scripts/.tailwind.node-config.js');
fs.writeFileSync(cfgPath, src);
const cfg = require(cfgPath);

/* 2. Sources scannées.
   Chemins en slashes et relatifs : Tailwind les passe à fast-glob, qui
   n'interprète pas les antislashs de Windows (un motif « js\**\*.js » ne
   correspond à aucun fichier). Le répertoire de travail est la racine du
   projet (voir l'appel du CLI plus bas), donc ces motifs restent valides. */
cfg.content = ['index.html', 'js/**/*.js'];

/* 3. Safelist : classes générées dynamiquement (introuvables par le scanner) */
cfg.safelist = [
  // thème (KPI, toasts, badges — construits via `${tone.fg}`, `i:'…'`, etc.)
  'bg-accent-soft', 'bg-warn-soft', 'bg-danger-soft', 'bg-info-soft',
  'text-accent', 'text-warn', 'text-danger', 'text-info', 'text-muted', 'text-ink', 'text-white',
  'bg-paper', 'bg-panel', 'bg-white', 'bg-ink',
  'border-line', 'border-ink', 'border-transparent',
  // opacités / variantes composées dans des ternaires JS
  'text-muted/40', 'bg-danger-soft/60', 'bg-warn-soft/60',
  'border-danger/25', 'border-warn/25', 'hover:border-accent/40',
  'hover:bg-accent', 'hover:bg-accent-dark', 'hover:text-white', 'hover:text-ink',
  'hover:brightness-95', 'brightness-95',
  // sidebar mobile (classList.toggle)
  '-translate-x-full', 'translate-x-full', 'lg:translate-x-0',
  // router (classList.toggle)
  'hidden', 'opacity-0', 'cursor-not-allowed',
];

fs.writeFileSync(cfgPath, 'module.exports = ' + JSON.stringify(cfg, null, 2) + ';');

/* 4. Appel de l'exécutable tailwindcss (CLI du paquet dev-dependency).
   Sous Windows, npm installe un lanceur « tailwind.cmd » (et non un fichier
   « tailwind » sans extension, seul exécutable direct) : on passe par le
   script Node du paquet, identique au .cmd, pour rester portable.
   Le CLI exige un fichier d'entrée : sans « -i », il s'arrête en annonçant
   seulement « Specified input file nul does not exist » — et peut sortir
   avec le code 0, ce qui avait laissé croire à une régénération réussie. */
const { execFileSync } = require('child_process');
const bin = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
const out = path.join(root, 'vendor/tailwind.css');
if (!fs.existsSync(bin)) {
  console.error('tailwindcss introuvable — lancer : npm install');
  process.exit(1);
}
/* Un fichier d'entrée minimal portant les directives Tailwind. */
const inputPath = path.join(root, 'scripts/.tailwind.input.css');
fs.writeFileSync(inputPath, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');

try {
  execFileSync(process.execPath,
    [bin, '-c', cfgPath, '-i', inputPath, '-o', out, '--minify'],
    { cwd: root, stdio: 'inherit' });
} finally {
  fs.unlinkSync(cfgPath);
  fs.unlinkSync(inputPath);
}

/* Contrôle du résultat : le CLI peut se terminer sans rien écrire. */
if (!fs.existsSync(out) || fs.statSync(out).size < 1000) {
  console.error('Échec : ' + out + ' n\'a pas été généré correctement.');
  process.exit(1);
}
if (!fs.readFileSync(out, 'utf8').includes('left-3\\.5')) {
  console.error('Échec : classes attendues absentes du CSS (scan des sources incomplet).');
  process.exit(1);
}
console.log('vendor/tailwind.css régénéré (' + Math.round(fs.statSync(out).size / 1024) + ' ko).');
