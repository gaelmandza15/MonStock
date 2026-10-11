# MonStock

**MonStock est une application de gestion de stock et de caisse pour petites boutiques, marchés et quincailleries.** Elle fonctionne entièrement dans le navigateur : aucun serveur, aucun compte, aucune connexion Internet obligatoire après le premier chargement. Toutes les données (produits, ventes, factures, mouvements) sont enregistrées localement dans le `localStorage` du navigateur.

Pensée pour les commerçants d'Afrique francophone (devise par défaut : FCFA), elle est en réalité internationale : **145 devises groupées par continent** et **2 langues (français / anglais)** sont embarquées.

## À qui s'adresse MonStock ?

Aux vendeurs qui tiennent leur stock « à la main » (cahier, Excel) et veulent :

- savoir **à tout moment combien vaut leur stock** et quels produits vont manquer ;
- **encaisser une vente** en quelques secondes sur un écran tactile ou une souris ;
- éditer une **facture au format ticket de caisse 80 mm**, imprimable sur n'importe quelle imprimante thermique POS (Epson, Xprinter…) ou sur papier classique ;
- garder un **historique complet des entrées/sorties** de marchandises ;
- exporter leurs données (CSV / JSON) sans dépendre d'un service tiers.

## Fonctionnalités

| Page | Ce qu'elle fait |
|---|---|
| **Tableau de bord** | Chiffres clés animés (valeur du stock, ventes du jour, marge, alertes), graphique des ventes sur 7 jours, produits sous seuil d'alerte, derniers mouvements. |
| **Produits** | Catalogue avec recherche, filtres par catégorie, seuil d'alerte personnalisable, réapprovisionnement en un clic, calcul automatique des marges. |
| **Vendre** (caisse) | Grille produits + sélecteur de catégorie déroulant, panier, encaissement avec saisie du montant reçu et calcul de la monnaie. Chaque vente crée les mouvements de stock correspondants. |
| **Factures** | Numérotation automatique (`F-AAAA-NNNN`), client, articles repris du panier ou ajoutés manuellement, taxe optionnelle, note. Impression au **format ticket de caisse 80 mm** (pas A4) via `@page size: 80mm auto`. |
| **Mouvements** | Historique filtrable de toutes les entrées, sorties, ventes et ajustements de stock. |
| **Paramètres** | Nom/adresse/téléphone/email de la boutique (repris sur les tickets), devise parmi **145 devises classées par continent** (Afrique, Amérique, Asie, Europe, Océanie), nombre de décimales, langue FR/EN, export/import CSV et JSON, réinitialisation avec jeu de démonstration. |

## Architecture technique

Application **statique, sans framework ni étape de build** : HTML + CSS + JavaScript natif, avec Tailwind (CDN/thème local) et les icônes Lucide. Les fichiers sont de simples scripts partagés sur la portée globale, chargés dans un ordre déterminé en bas de `index.html`.

```
.
├── index.html                  # Gabarit HTML des pages + ordre de chargement des scripts
│                               # (contient aussi le CSS d'impression du ticket 80 mm)
├── css/
│   └── style.css               # Styles personnalisés (scrollbar, animations, focus)
├── js/
│   ├── config/
│   │   ├── tailwind.config.js  # Thème Tailwind (couleurs, polices) — ombres désactivées
│   │   └── currencies.js       # 145 devises ISO 4217 groupées par continent
│   ├── i18n/
│   │   ├── fr.js               # Dictionnaire français
│   │   └── en.js               # Dictionnaire anglais
│   ├── core/                   # Infrastructure partagée par toutes les pages
│   │   ├── state.js            # État global + persistance localStorage + jeu de démo
│   │   ├── utils.js            # Helpers ($, esc, formats) + calculs métier (stock, marges, ventes)
│   │   ├── i18n.js             # t('clé'), pluriels, placeholders {x}, sélecteur de langue
│   │   ├── ui.js               # Primitives UI : toasts, modales, tiroirs
│   │   ├── router.js           # Navigation entre pages + chrome (sidebar, valeur du stock)
│   │   └── actions.js          # Délégation d'événements data-action + démarrage de l'app
│   └── pages/                  # Une page = un fichier, rendu par le router
│       ├── dashboard.js        # Tableau de bord
│       ├── products.js         # Produits
│       ├── sell.js             # Caisse / point de vente
│       ├── invoices.js         # Facturation + impression ticket 80 mm
│       ├── movements.js        # Mouvements de stock
│       └── settings.js         # Paramètres + devises + export CSV/JSON
└── scripts/
    ├── i18n-check.js           # Vérificateur automatique i18n (voir ci-dessous)
    └── pre-commit              # Hook git qui lance le vérificateur avant chaque commit
```

**Ordre de chargement** (important, les scripts partagent la portée globale) :
`config/tailwind → config/currencies → i18n/fr → i18n/en → core/i18n → core/state → core/utils → core/ui → core/router → pages/* → core/actions`.

**Conventions :**

- Aucun `onclick` inline : tout passe par `data-action="…"` traité dans `actions.js`.
- Tout texte destiné à l'utilisateur passe par une clé i18n (`t('…')` dans le JS, `data-i18n` dans le HTML). Jamais d'accents en dur dans les modules, jamais de symbole de devise en dur dans les dictionnaires.
- Les montants sont formatés selon la devise choisie dans les Paramètres (`fmtMoney`).

## Internationalisation (i18n) & vérificateur automatique

Deux langues sont livrées : **français** (par défaut) et **anglais**. La langue se change dans l'en-tête ou dans les Paramètres ; le choix est mémorisé.

Pour éviter tout oubli de traduction, `scripts/i18n-check.js` analyse les 20+ fichiers du projet et **bloque le commit** (hook `pre-commit`) si l'une de ces règles est violée :

1. une clé existe dans une langue mais pas dans l'autre ;
2. une clé utilisée dans le code (`t('…')`, `data-i18n="…"`) est absente des dictionnaires ;
3. un texte avec accents est écrit en dur dans un module JS ;
4. un symbole/nom de devise apparaît en dur dans une traduction.

Le lancer manuellement :

```bash
node scripts/i18n-check.js
```

Après un clone, installez le hook une fois :

```bash
ln -sf ../../scripts/pre-commit .git/hooks/pre-commit && chmod +x scripts/pre-commit
```

## Lancer l'application

Aucune installation n'est nécessaire — ouvrez simplement `index.html` dans un navigateur.

Ou, pour un contexte HTTP propre (recommandé) :

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Au premier lancement, un jeu de démonstration (produits, ventes, mouvements) est chargé automatiquement ; il peut être remplacé ou effacé depuis les Paramètres.

## Licences

MIT (code) — voir `LICENSE`.
