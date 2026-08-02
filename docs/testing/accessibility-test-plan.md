# Plan de test d'accessibilité

Renvoi formalisé depuis `docs/design/accessibility-guidelines.md` (feat/031-accessibility-hardening).
Cible : WCAG 2.1 AA sur `apps/web` (site public + `/admin`) et `apps/mobile`.

## Outils

| Outil                                                                                 | Usage                                                                                                                                           | Où                                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@angular-eslint/template` (`templateAccessibility` config)                           | Lint statique (alt-text, labels, rôles ARIA…) sur chaque template Angular                                                                       | CI (`npm run lint`), à chaque PR                                                        |
| `npm audit` / vérification de contraste manuelle (formule de luminance relative WCAG) | Contraste des tokens de couleur — voir `libs/design-tokens/src/styles/_*.scss` pour les valeurs mesurées et leurs commentaires                  | À chaque ajout/modification de token de couleur                                         |
| Navigation clavier manuelle (Tab / Shift+Tab / Entrée / Échap, sans souris)           | Tabulation logique, focus visible, pas de piège de focus                                                                                        | Avant fusion de toute PR touchant la navigation ou les modales                          |
| Lecteur d'écran (NVDA sur Windows ou VoiceOver sur macOS/iOS)                         | Spot-check sur les écrans prioritaires ci-dessous                                                                                               | Avant fusion des PR touchant ces écrans spécifiquement ; pas systématique sur chaque PR |
| axe DevTools (extension navigateur)                                                   | Audit automatisé complémentaire au lint statique, capture ce que le lint de template ne voit pas (contraste réel rendu, structure de landmarks) | Ponctuel, sur les écrans prioritaires avant une release                                 |

Pas d'intégration CI d'axe-core à ce stade (pas de suite e2e Playwright dédiée à l'accessibilité) —
à envisager si des régressions passent entre les mailles du lint statique.

## Écrans prioritaires

1. **Site public — page tournoi** (`apps/web` `/:slug`) : shell (nav, skip-link), calendrier,
   classement (podium, tableau), fiche équipe. Contient le badge "En direct" et les statuts
   qualifié/éliminé — les plus à risque de contraste couleur-seule.
2. **Administration — liste et formulaire tournoi** (`/admin/tournaments`, `/admin/tournaments/new`) :
   formulaires (labels, messages d'erreur), tableau de résultats.
3. **Mobile — recherche/fiche équipe et favoris** (`apps/mobile`) : boutons favori icône-seule
   (étoile), bannière hors-connexion, barre d'onglets.

## Critères de passage

Repris de `docs/design/accessibility-guidelines.md` :

- Contraste texte normal ≥ 4.5:1, UI/bordures ≥ 3:1, sur les 3 thèmes (Ink & Signal, Pulse Ember,
  Neon Court) × 2 modes (clair/sombre) — vérifié pour chaque token de couleur affecté par ce
  document (`_ink-signal.scss`, `_pulse-ember.scss`, `_neon-court.scss`).
- Aucune information de statut (direct, qualification, victoire/défaite) portée par la couleur
  seule — toujours doublée d'un texte.
- Cibles tactiles ≥ 44×44px, espacement ≥ 8px.
- Focus clavier visible sur tout élément interactif, jamais supprimé.
- Labels explicites (`aria-label`) sur tout bouton icône-seule.
- Navigation clavier complète, sans piège de focus dans les modales.
- `prefers-reduced-motion` respecté.
- `alt`/`aria-label` sur tout logo d'équipe/sponsor.
- `<html lang="...">` correct sur chaque app (`fr` partout — corrigé sur `apps/mobile` dans ce
  travail, qui portait `lang="en"` par erreur).
- Skip-link ("Aller au contenu principal") disponible sur les deux shells `apps/web`.

## Suivi

Les écarts identifiés lors de ce premier passage (contraste des tokens `signal`/`win`/`loss`/
`draw`/`warning`/`error` en mode clair, focus ring illisible sur 2 des 3 thèmes, badge "En direct"
illisible sur fond signal) ont été corrigés directement dans `feat/031-accessibility-hardening`.
Ce document sert de référence pour les prochains audits, pas de constat figé.
