# MonStock — Gestion de stock

Application de gestion de stock 100 % locale (aucun compte requis, données en `localStorage`).
Le code a été modularisé : plus de fichier monolithe, chaque responsabilité a son fichier.

## Structure du projet

```
.
├── index.html              # Structure HTML uniquement (gabarit des pages)
├── css/
│   └── style.css           # Styles personnalisés (scrollbar, animations, focus…)
└── js/
    ├── config/
    │   └── tailwind.config.js  # Thème Tailwind (couleurs, polices, ombres)
    ├── core/                   # Infrastructure partagée par toutes les pages
    │   ├── state.js            # 1. État global, constantes, persistance localStorage, jeu de démo
    │   ├── utils.js            # 2-3. Helpers ($, esc, formats) et calculs métier (stock, ventes, marges)
    │   ├── ui.js               # 4. Primitives UI : toasts, modales, tiroirs
    │   ├── router.js           # 5. Navigation entre les pages + chrome (sidebar, valeur du stock)
    │   └── actions.js          # 11-12. Délégation d'événements (data-action) + démarrage
    └── pages/                  # Une page = un fichier, rendu par le router
        ├── dashboard.js        # 6. Tableau de bord : KPI animés, graphique 7 jours, alertes
        ├── products.js         # 7. Produits : liste, filtres, formulaire, réapprovisionnement
        ├── sell.js             # 8. Point de vente : grille produits, panier, encaissement/monnaie
        ├── movements.js        # 9. Mouvements : historique filtrable + modal nouveau mouvement
        └── settings.js         # 10. Paramètres boutique + export CSV/JSON
```

## Conventions

- **Scripts classiques partagés** : les fichiers de `js/core/` et `js/pages/` sont chargés dans l'ordre
  via des balises `<script src>` en bas de page et partagent la portée globale (comme avant la
  modularisation). L'ordre importe : `config/tailwind → core/state → core/utils → core/ui → core/router
  → pages/* → core/actions`.
- **Actions centralisées** : le HTML n'utilise aucun `onclick` inline ; tout passe par
  `data-action="…"` et est traité dans le routeur d'événements de `actions.js`.
- **Pas de build** : aucune dépendance npm, ouverture directe de `index.html` dans un navigateur.

## Lancer

Il suffit d'ouvrir `index.html` dans un navigateur, ou de servir le dossier :

```bash
python3 -m http.server 8000
# → http://localhost:8000
```
