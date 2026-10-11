/* ════════════════ I18N — moteur de traduction ════════════════ */
/* Les dictionnaires (js/i18n/fr.js, js/i18n/en.js) sont chargés avant ce fichier.
   Règles vérifiées automatiquement au commit par scripts/i18n-check.js :
     1. toute clé doit exister dans chaque langue ;
     2. toute t('clé') utilisée dans le code doit exister dans les dictionnaires ;
     3. aucun texte avec accents en dur dans les modules JS ;
     4. aucune devise en dur dans les traductions. */

const LANGS = { fr: I18N_FR, en: I18N_EN };
const DEFAULT_LANG = 'fr';

function loadLang(){
  try{
    const l = localStorage.getItem(LS_LANG);
    if(l && LANGS[l]) return l;
  }catch(_){ /* stockage indisponible */ }
  return DEFAULT_LANG;
}
let lang = loadLang();

/* Traduit une clé. Options :
     { n }            -> sélection du pluriel "singulier|pluriel" + interpolation {n}
     { params... }    -> interpolation de {placeholders}
   Retourne « clé » (visible, volontairement) si la clé est inconnue. */
function t(key, opts){
  const dict = LANGS[lang] || LANGS[DEFAULT_LANG];
  let str = dict[key];
  if(str === undefined) str = LANGS[DEFAULT_LANG][key];
  if(str === undefined) return '\u00AB ' + key + ' \u00BB';
  if(str.indexOf('|') !== -1){
    const forms = str.split('|');
    const n = Math.abs(Number(opts && opts.n != null ? opts.n : 0));
    str = (lang === 'fr' ? (n > 1 ? forms[1] : forms[0])
                         : (n === 1 ? forms[0] : forms[1]));
  }
  if(opts) for(const k in opts){
    str = str.split('{' + k + '}').join(String(opts[k]));
  }
  return str;
}

/* Locale Intl correspondante à la langue active. */
function localeOf(){ return lang === 'en' ? 'en-US' : 'fr-FR'; }

/* Applique la langue aux éléments statiques de index.html
   (attributs data-i18n / data-i18n-placeholder). */
function applyStaticI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.documentElement.lang = lang;
}

/* Sélecteur de langue dans la barre latérale et l'en-tête mobile. */
function renderLangSwitches(){
  const mk = (id) => `<select id="${id}" class="bg-white border border-line rounded-lg px-2 py-1 text-xs font-bold cursor-pointer pr-6">` +
    Object.keys(LANGS).map(c=>`<option value="${c}"${c===lang?' selected':''}>${c.toUpperCase()}</option>`).join('') +
    `</select>`;
  const sb = $('#sb-lang'); if(sb) sb.innerHTML = mk('set-lang-sidebar');
  const mb = $('#mb-lang'); if(mb) mb.innerHTML = mk('set-lang-mobile');
}

function setLang(l){
  if(!LANGS[l] || l === lang) return;
  lang = l;
  saveLang();
  applyStaticI18n();
  renderPage();
}
