# Design tokens — implémentation

Mission §15. Implémenté dans `feat/004-design-system-foundation` (`libs/design-tokens`). Ce document remplace l'aperçu documentaire de la PR précédente (`design/002-brand-and-design-system`).

## Où

- `libs/design-tokens/src/styles/_base.scss` — tokens communs aux 3 directions (spacing, radii de base, ombres, opacité, motion, breakpoints, z-index) sous `:root`.
- `libs/design-tokens/src/styles/_ink-signal.scss`, `_pulse-ember.scss`, `_neon-court.scss` — tokens de couleur et de typographie propres à chaque direction, scopés par `[data-theme="…"]` et `[data-theme="…"][data-mode="dark"]`.
- `libs/design-tokens/src/styles/index.scss` — point d'entrée unique (`@forward` des 4 fichiers ci-dessus).
- `libs/design-tokens/src/lib/theme.types.ts` — types `ThemeName`/`ThemeMode`, liste `THEMES`, valeurs par défaut.
- `libs/design-tokens/src/lib/theme.service.ts` — `ThemeService` (Angular, signals) pour appliquer `data-theme`/`data-mode` sur un élément DOM.

## Comment activer un thème

Chaque application ajoute `libs/design-tokens/src/styles` à `stylePreprocessorOptions.includePaths` (voir `angular.json`) et importe le point d'entrée une fois dans son style global :

```scss
// apps/<app>/src/styles.scss
@forward 'index';
```

Puis un élément (idéalement le conteneur racine de la surface concernée — jamais tout le document pour le site public d'un tournoi, cf. `visual-language.md`) porte les attributs :

```html
<div [attr.data-theme]="theme" [attr.data-mode]="mode">…</div>
```

- **admin-web** : `data-theme="ink-signal"` fixe (identité produit, mission §2 — jamais piloté par le thème d'un tournoi).
- **public-web** : `data-theme` lu depuis `PublicPageConfiguration.theme` du tournoi affiché (voir `docs/architecture/data-model.md`) — implémentation réelle de cette lecture prévue dans `feat/015-public-tournament-web`.

## Tokens disponibles (noms CSS)

| Catégorie | Variables |
| --- | --- |
| Couleurs de surface | `--ap-color-bg`, `--ap-color-surface`, `--ap-color-fg`, `--ap-color-muted`, `--ap-color-border` |
| Couleurs de marque | `--ap-color-primary`, `--ap-color-on-primary`, `--ap-color-signal`, `--ap-color-signal-soft` |
| Résultats sportifs (jamais confondus avec les couleurs système) | `--ap-color-win`, `--ap-color-loss`, `--ap-color-draw` |
| Statuts système | `--ap-color-success`, `--ap-color-info`, `--ap-color-warning`, `--ap-color-error`, `--ap-color-on-error` |
| Typographie | `--ap-font-heading`, `--ap-font-body`, `--ap-tracking-tight`, `--ap-title-case` |
| Formes | `--ap-radius-sm`, `--ap-radius-md`, `--ap-radius-lg` |
| Espacement (commun) | `--ap-space-1` … `--ap-space-24` |
| Ombres (communes) | `--ap-shadow-sm`, `--ap-shadow-md`, `--ap-shadow-lg` |
| Mouvement (commun, respecte `prefers-reduced-motion`) | `--ap-motion-fast`, `--ap-motion-base`, `--ap-motion-emotional`, `--ap-easing-standard` |
| Z-index (commun) | `--ap-z-base` … `--ap-z-slideshow` |

## Ce qui n'est pas encore fait

- `charts` (palette catégorielle pour les visualisations) : reporté à la PR qui introduira les premiers graphiques (classements, statistiques).
- Lecture dynamique réelle du thème d'un tournoi depuis l'API : prévue dans `feat/015-public-tournament-web`.
- Polices exactes (Space Grotesk, Barlow Condensed, Russo One…) : les valeurs `--ap-font-*` référencent déjà les bons noms de police, mais leur chargement effectif (`@font-face` ou Google Fonts self-hosted) n'est pas encore mis en place — piles système utilisées comme repli pour l'instant.
