#!/usr/bin/env node
/* ════════════════ VÉRIFICATEUR AUTOMATIQUE I18N ════════════════
   Bloque le commit (exit code ≠ 0) si l'une de ces règles est violée :

     RÈGLE 1 — Clés divergentes :
        une clé existe dans un dictionnaire (fr ou en) mais pas dans l'autre.

     RÈGLE 2 — Clé utilisée mais absente :
        t('une.cle') apparaît dans le code JS ou data-i18n="..." dans index.html,
        sans exister dans les dictionnaires.

     RÈGLE 3 — Texte avec accents en dur :
        un module JS contient une chaîne littérale avec des caractères accentués
        hors du dossier js/i18n/ (elle devrait passer par t('...')).

     RÈGLE 4 — Devise en dur dans une traduction :
        une valeur de dictionnaire contient un symbole/code de devise en dur
        (FCFA, XOF, GNF, MAD, €, $, USD…), alors que la devise est un paramètre
        utilisateur ajouté dynamiquement (fmtMoney). Seuls les libellés
        « currency.* » sont autorisés à mentionner le code entre parenthèses.

   Utilisation :
     node scripts/i18n-check.js            → analyse tout le dépôt
     git add ... && node scripts/i18n-check.js --staged   → analyse le futur commit

   Installation comme hook de commit (optionnel) :
     ln -sf ../../scripts/pre-commit .git/hooks/pre-commit
*/
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const STAGED = process.argv.includes('--staged');

/* ── Collecte des fichiers à analyser ─────────────────────────── */
function listFiles() {
  if (STAGED) {
    try {
      return cp.execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: ROOT })
        .toString().split('\n').filter(Boolean);
    } catch (e) { console.error('Impossible de lire le dépôt Git :', e.message); process.exit(1); }
  }
  const out = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue;
      const p = path.join(dir, name);
      fs.statSync(p).isDirectory() ? walk(p) : out.push(path.relative(ROOT, p));
    }
  })(ROOT);
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = listFiles();
const has = (f) => files.includes(f);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const errors = [];
const err = (rule, file, line, msg) => errors.push({ rule, file, line, msg });

/* Retire blocs de commentaires et lignes entièrement commentées (les commentaires
   francophones ne sont pas des textes d'interface ni des utilisations de clés). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
            .replace(/([^:])\/\/.*$/gm, '$1');
}

/* ── Chargement des dictionnaires (Règles 1, 2 et 4) ──────────── */
/* Chargement des dictionnaires : chaque fichier définit une seule constante globale. */
const DICTS = { 'js/i18n/fr.js': ['fr', 'I18N_FR'], 'js/i18n/en.js': ['en', 'I18N_EN'] };
const FILE_BY_CODE = Object.fromEntries(Object.entries(DICTS).map(([f, [code]]) => [code, f]));
const dicts = {};
let dictsLoaded = true;
for (const [f, [code, varName]] of Object.entries(DICTS)) {
  if (!fs.existsSync(path.join(ROOT, f))) { dictsLoaded = false; break; }
  try {
    const ctx = {};
    vm.runInNewContext(read(f) + `\n;globalThis.__out = ${varName};`, ctx);
    dicts[code] = ctx.__out;
  } catch (e) {
    dictsLoaded = false;
    err('syntaxe', f, 0, `Dictionnaire non analysable : ${e.message}`);
  }
}

if (dictsLoaded && dicts.fr && dicts.en) {
  const keysFr = Object.keys(dicts.fr);
  const keysEn = Object.keys(dicts.en);
  const setEn = new Set(keysEn), setFr = new Set(keysFr);

  /* Règle 1 — clés présentes dans une langue mais pas dans l'autre */
  for (const k of keysFr) if (!setEn.has(k)) err(1, 'js/i18n/en.js', 0, `Clé « ${k} » présente en français mais absente en anglais.`);
  for (const k of keysEn) if (!setFr.has(k)) err(1, 'js/i18n/fr.js', 0, `Clé « ${k} » présente en anglais mais absente en français.`);

  /* Règle 4 — devise en dur dans une valeur de traduction */
  const CURRENCY_RE = /\b(FCFA|XOF|XAF|GNF|MGA|KMF|MAD|DZD|TND|NGN|EUR|USD)\b|[€$£¥₦]/;
  for (const [code, dict] of Object.entries(dicts)) {
    const file = FILE_BY_CODE[code];
    const srcLines = read(file).split('\n');
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || !CURRENCY_RE.test(value)) continue;
      /* Exception légitime : les libellés de choix de devise affichent leur propre code. */
      if (/^currency\./.test(key)) continue;
      const idx = srcLines.findIndex(l => l.includes(JSON.stringify(key)) || l.includes(`'${key}'`));
      err(4, file, idx + 1, `Devise en dur dans « ${key} » : « ${value} ». La devise provient des paramètres (fmtMoney) ; retirer le symbole du texte traduit.`);
    }
  }
}

/* ── Règle 2 — clés utilisées dans le code mais absentes des dictionnaires ── */
if (dictsLoaded && dicts.fr && dicts.en) {
  const CODE_GLOBS = ['js/core', 'js/pages', 'js/config'];
  const usedKeys = new Map(); // key -> [{file, line}]
  const collect = (file, src, regex, group) => {
    src.split('\n').forEach((line, i) => {
      let m; const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
      while ((m = re.exec(line))) {
        const k = m[group];
        if (!usedKeys.has(k)) usedKeys.set(k, []);
        usedKeys.get(k).push({ file, line: i + 1 });
      }
    });
  };
  const scanTargets = ['.html', '.js'];
  for (const f of files) {
    const ext = path.extname(f);
    if (!scanTargets.includes(ext)) continue;
    if (ext === '.js' && (f in DICTS || f.startsWith('scripts/'))) continue; // dictionnaires & outils hors analyse d'usage
    const src = stripComments(read(f)); // on n'analyse que le code, jamais les commentaires
    collect(f, src, /\bt\(\s*'([^']+)'/, 1);
    collect(f, src, /\bt\(\s*"([^"]+)"/, 1);
    collect(f, src, /data-i18n(?:-placeholder|-aria)?="([^"]+)"/, 1);
  }
  for (const [k, occ] of usedKeys) {
    if (!(k in dicts.fr) || !(k in dicts.en)) {
      for (const o of occ) err(2, o.file, o.line, `Clé « ${k} » utilisée via t()/data-i18n mais absente du dictionnaire ${!(k in dicts.fr) ? 'français' : ''}${!(k in dicts.fr) && !(k in dicts.en) ? ' et ' : ''}${!(k in dicts.en) ? 'anglais' : ''}.`);
    }
  }
}

/* ── Règle 3 — textes avec accents en dur dans les modules JS ──── */
const ACCENT_RE = /[àâäçéèêëîïôöùûüÿœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒ]/;
for (const f of files) {
  if (!f.endsWith('.js')) continue;
  if (f.startsWith('js/i18n/')) continue;       // dictionnaires : c'est leur rôle
  if (f.startsWith('scripts/')) continue;       // outils de contrôle
  const lines = stripComments(read(f)).split('\n');
  lines.forEach((line, i) => {
    /* Toute chaîne littérale (', ", `) contenant des caractères accentués est interdite. */
    const m = line.match(/(['"`])([^'"`\n]*)\1/g);
    if (!m) return;
    for (const str of m) {
      const inner = str.slice(1, -1);
      if (!ACCENT_RE.test(inner)) continue;
      err(3, f, i + 1, `Texte avec accents en dur : ${str.length > 70 ? str.slice(0, 67) + '…' : str} — déplacer dans js/i18n/fr.js et utiliser t('...').`);
      break; /* une seule remontée par ligne suffit */
    }
  });
}

/* ── Rapport ───────────────────────────────────────────────────── */
if (errors.length === 0) {
  console.log(`✔ Vérification i18n OK (${files.length} fichier(s) analysé(s), 4 règles respectées).`);
  process.exit(0);
}
console.error(`✘ Vérification i18n échouée — ${errors.length} problème(s) :\n`);
const RULE_NAMES = {
  1: 'Clé manquante dans une langue',
  2: 'Clé utilisée mais absente du dictionnaire',
  3: 'Texte avec accents en dur dans un module JS',
  4: 'Devise en dur dans une traduction',
};
for (const e of errors.sort((a, b) => a.rule - b.rule || a.file.localeCompare(b.file) || a.line - b.line)) {
  console.error(`  [Règle ${e.rule} — ${RULE_NAMES[e.rule] || e.rule}] ${e.file}${e.line ? ':' + e.line : ''} — ${e.msg}`);
}
console.error(`\nCorrigez ces problèmes avant de commiter (voir scripts/i18n-check.js pour le détail des règles).`);
process.exit(1);
