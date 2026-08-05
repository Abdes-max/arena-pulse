# Logo — TournArena

Voir `brand-foundations.md` pour le territoire/personnalité de marque ; ce document couvre uniquement le symbole et son intégration.

## Pour revoir le rendu

Ouvrir `docs/design/brand/preview.html` directement dans un navigateur (double-clic, aucun serveur requis) — tailles du symbole, wordmark, rendu en contexte (en-tête admin, vitrine, écran d'accueil mobile) et nuancier.

## Le symbole

Un chevron (trait qui avance, forme de parenthèse de tableau à élimination) converge vers un point qui pulse — le même motif que le badge `ap-badge[status="live"]` déjà utilisé partout dans l'app. Deux idées du territoire de marque (`brand-foundations.md`, "Signature") condensées en deux traits et un point : trajectoire + pouls.

Deux traits suffisent à le rendre lisible même écrasé à 16 px (favicon).

## Le wordmark

"TournArena" porte déjà sa coupure dans son écriture (la majuscule interne). La couleur suit cette coupure plutôt qu'un séparateur ou un slogan : **Tourn** en encre (`#1e293b`), **Arena** en signal (`#0a738d`). Police : Space Grotesk 700, tracking -0.02em — même police que les `<h1>` du produit.

## Couleurs et typographie fixes, pas thématisées

Contrairement à un accent d'UI (ex. la pastille de l'onglet actif dans l'admin, qui suit le thème choisi par l'organisateur), le logo **n'utilise aucun token `--ap-*`** — les couleurs et la police sont écrites en dur dans `logo.scss`. Un token comme `--ap-tracking-tight` ou `--ap-font-heading` change de valeur selon le thème actif (ex. `text-transform: uppercase` et `Russo One` en thème Neon Court) ; un logo qui suivrait ces tokens changerait de forme selon le dernier thème sélectionné par l'organisateur pour son propre tableau de bord, ce qu'aucune marque ne fait. Les couleurs utilisées sont bien celles de la direction Ink & Signal (l'identité produit fixe), mais en valeurs figées.

## Assets

| Fichier | Rôle |
| --- | --- |
| `libs/design-system/src/lib/logo/` | Composant `ap-logo` (Angular) — source de vérité pour toute intégration dans le produit |
| `apps/web/public/favicon.svg`, `apps/mobile/public/favicon.svg` | Favicon vectoriel |
| `docs/design/brand/mark-on-light.svg` | Symbole seul, fond clair |
| `docs/design/brand/mark-on-dark.svg` | Symbole seul, variante inversée pour fond sombre |
| `docs/design/brand/preview.html` | Aperçu autonome (voir plus haut) |

## Utiliser `ap-logo`

```html
<ap-logo />                              <!-- icône + wordmark, fond clair (par défaut) -->
<ap-logo [wordmark]="false" />           <!-- icône seule (garde un nom accessible caché) -->
<ap-logo variant="on-dark" />            <!-- variante inversée, pour un fond sombre -->
```

Intégré dans :
- `apps/web/src/app/admin/shell/app-shell.html` — en-tête admin, en haut à gauche
- `apps/web/src/app/pages/landing/landing.page.html` — nav de la vitrine publique
- `apps/mobile/src/app/pages/tournament-entry/tournament-entry.page.html` — écran de saisie du code tournoi

Aucun usage actuel de `variant="on-dark"` dans le produit (tous ces emplacements ont un fond clair fixe) — disponible pour un futur contexte sombre.

## Espace de respiration

Laisser au moins la largeur du point signal libre autour du symbole — pas de texte ni de bord de carte collé dessus (voir `preview.html`).

## Limite connue : icône native mobile et `.ico` multi-résolution

`favicon.svg` couvre les navigateurs modernes (Chrome, Firefox, Edge, Safari 16+) via `<link rel="icon" type="image/svg+xml">`, avec `favicon.ico` existant gardé en `rel="alternate icon"` pour les anciens navigateurs qui ne savent pas lire un favicon SVG — ce `.ico` n'a **pas** été régénéré avec le nouveau symbole : aucun outil de rastérisation (ImageMagick, Inkscape, sharp…) n'était disponible dans cet environnement pour produire un `.ico` multi-résolution ou les jeux d'icônes natifs Android (`apps/mobile/android/app/src/main/res/mipmap-*`) à partir du SVG. Pour les mettre à jour : régénérer depuis `mark-on-light.svg` avec un outil externe (ex. realfavicongenerator.net pour le favicon, `npx @capacitor/assets generate` pour l'icône Android à partir d'un PNG source).
