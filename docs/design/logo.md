# Logo — TournArena

Voir `brand-foundations.md` pour le territoire/personnalité de marque ; ce document couvre uniquement le symbole et son intégration.

## Pour revoir le rendu

Ouvrir `docs/design/brand/preview.html` directement dans un navigateur (double-clic, aucun serveur requis) — tailles du symbole, wordmark, rendu en contexte (en-tête admin, vitrine, écran d'accueil mobile) et nuancier.

## Le symbole

Un chevron (trait qui avance, forme de parenthèse de tableau à élimination) converge vers un point qui pulse — le même motif que le badge `ap-badge[status="live"]` déjà utilisé partout dans l'app. Deux idées du territoire de marque (`brand-foundations.md`, "Signature") condensées en deux traits et un point : trajectoire + pouls.

Deux traits suffisent à le rendre lisible même écrasé à 16 px (favicon).

## Le wordmark

"TournArena" porte déjà sa coupure dans son écriture (la majuscule interne). La couleur suit cette coupure plutôt qu'un séparateur ou un slogan : **Tourn** en encre (`#1e293b`), **Arena** en signal (`#0a738d`). Police : Bricolage Grotesque 700, tracking -0.02em — même police que les `<h1>` du produit.

## Couleurs et typographie fixes, pas thématisées

Contrairement à un accent d'UI (ex. la pastille de l'onglet actif dans l'admin, qui suit le thème choisi par l'organisateur), le logo **n'utilise aucun token `--ap-*`** — les couleurs et la police sont écrites en dur dans `logo.scss`. Un token comme `--ap-tracking-tight` ou `--ap-font-heading` change de valeur selon le thème actif (ex. `text-transform: uppercase` et `Russo One` en thème Neon Court) ; un logo qui suivrait ces tokens changerait de forme selon le dernier thème sélectionné par l'organisateur pour son propre tableau de bord, ce qu'aucune marque ne fait. Les couleurs utilisées sont bien celles de la direction Ink & Signal (l'identité produit fixe), mais en valeurs figées.

## Assets

| Fichier                                                                                     | Rôle                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `libs/design-system/src/lib/logo/`                                                          | Composant `ap-logo` (Angular) — source de vérité pour toute intégration dans le produit                                 |
| `apps/web/public/favicon.svg`, `apps/mobile/public/favicon.svg`                             | Favicon vectoriel                                                                                                       |
| `apps/web/public/favicon.ico`, `apps/mobile/public/favicon.ico`                             | Favicon multi-résolution (16/32/48) pour les navigateurs sans support SVG                                               |
| `apps/mobile/resources/{icon,icon-foreground,icon-background,splash}.png`                   | Source de vérité pour l'icône et l'écran de démarrage natifs (Android + iOS) — voir ci-dessous                          |
| `apps/mobile/android/app/src/main/res/mipmap-*`, `apps/mobile/ios/App/App/Assets.xcassets/` | Icône/splash natifs **générés**, pas la source — recréés à chaque build (`android/`/`ios/` gitignored, voir ci-dessous) |
| `docs/design/brand/mark-on-light.svg`                                                       | Symbole seul, fond clair                                                                                                |
| `docs/design/brand/mark-on-dark.svg`                                                        | Symbole seul, variante inversée pour fond sombre                                                                        |
| `docs/design/brand/preview.html`                                                            | Aperçu autonome (voir plus haut)                                                                                        |

## Utiliser `ap-logo`

```html
<ap-logo />
<!-- icône + wordmark, fond clair (par défaut) -->
<ap-logo [wordmark]="false" />
<!-- icône seule (garde un nom accessible caché) -->
<ap-logo variant="on-dark" />
<!-- variante inversée, pour un fond sombre -->
```

Intégré dans :

- `apps/web/src/app/admin/shell/app-shell.html` — en-tête admin, en haut à gauche
- `apps/web/src/app/pages/landing/landing.page.html` — nav de la vitrine publique
- `apps/mobile/src/app/pages/tournament-entry/tournament-entry.page.html` — écran de saisie du code tournoi

Aucun usage actuel de `variant="on-dark"` dans le produit (tous ces emplacements ont un fond clair fixe) — disponible pour un futur contexte sombre.

## Espace de respiration

Laisser au moins la largeur du point signal libre autour du symbole — pas de texte ni de bord de carte collé dessus (voir `preview.html`).

## Icônes rastérisées : comment elles sont générées

**Historique** : une première version (favicon + icône Android) avait été produite à la main, ponctuellement, sans script conservé dans le repo — perdue à la session suivante puisque `apps/mobile/android/` est gitignored (voir plus bas). Depuis, tout le pipeline a été rendu reproductible et committé.

**Source de vérité** : `apps/mobile/resources/` (committé, contrairement à `android/`/`ios/`) —

- `icon.png` (1024×1024) : symbole complet sur fond plein `#1e293b`, sans arrondi appliqué à la main (l'OS applique son propre masque — cercle/squircle/carré arrondi selon la plateforme). Alimente l'icône iOS (App Store + écran d'accueil) et l'icône Android legacy (pré-Android 8).
- `icon-foreground.png` (1024×1024, fond transparent) : chevron + point seuls, réduits pour tenir dans la "safe zone" des icônes adaptatives Android (~60 % du canevas).
- `icon-background.png` (1024×1024) : fond plein `#1e293b` seul, composé par l'OS derrière `icon-foreground.png` (icône adaptative Android 8+).
- `splash.png` (2732×2732) : fond `#1e293b`, symbole seul centré en petit (pas de wordmark) — écran de démarrage.

Ces 4 PNG ont été produits avec Playwright (même technique que l'ancienne version, mais scriptée et rejouable), à partir de la géométrie exacte de `logo.html`/`logo.scss` (chevron + point, mêmes couleurs).

**Génération des assets natifs** : `@capacitor/assets` (`npx capacitor-assets generate --android`/`--ios`, avec les couleurs de fond `#1e293b` passées en options puisque `icon.png`/`splash.png` n'ont pas de canal alpha exploitable pour ça) lit `apps/mobile/resources/` et écrit toutes les tailles/densités requises dans `android/app/src/main/res/` et `ios/App/App/Assets.xcassets/`. Câblé à trois endroits, toujours **après** `cap sync` (qui doit avoir créé les dossiers de ressources natifs avant) :

- `.github/workflows/deploy-android.yml`
- `.github/workflows/deploy-ios.yml`
- `infra/scripts/run-mobile-emulator.mjs` (émulateur local)

— un run de production ou un test local régénère donc toujours l'icône à jour, jamais un ancien artefact caché.

**`apps/mobile/android/` et `ios/` restent dans `.gitignore`** (convention Capacitor standard) — mais ce n'est plus un problème : contrairement à l'ancienne version manuelle, l'icône n'est plus perdue à la régénération du dossier, elle est recréée à l'identique à chaque fois à partir de `resources/`. Changer le symbole se fait uniquement en régénérant les 4 PNG source (même script Playwright) et en committant le résultat — rien à refaire à la main côté Android/iOS.
