# Inventaire des composants clés

Liste des composants du design system. Statut mis à jour après `feat/004-design-system-foundation`, qui a implémenté un premier socle de composants (`libs/design-system`) — le reste de l'inventaire suit progressivement au fil des PR qui en ont besoin.

## Composants transverses — IMPLÉMENTÉ

- **`ap-button`** (`libs/design-system/src/lib/button`) — variantes `primary` / `secondary` / `ghost`, focus visible, état désactivé.
- **`ap-badge`** (`libs/design-system/src/lib/badge`) — statuts à venir/en direct/terminé/reporté/annulé/qualifié/éliminé ; toujours un libellé texte, jamais la couleur seule (`docs/design/colors.md`).

## Composants de match (mission §20 — pas un composant unique pour tous les contextes)

- **`ap-match-card`** (`libs/design-system/src/lib/match-card`) — **IMPLÉMENTÉ**, un seul composant mais 5 variantes visuellement distinctes : `featured`, `live`, `upcoming`, `result`, `compact`. Détecte automatiquement l'équipe gagnante (result) sans dépendre de la couleur seule.
- **Bracket match** — nœud d'un tableau à élimination directe (cf. `visual-language.md` par direction). **Non implémenté** — prévu avec l'écran de classement/phase finale (`feat/015-public-tournament-web`).
- **Team match card** — carte centrée sur une équipe (utilisée sur la fiche équipe). **Non implémenté** — même échéance.
- **Match summary** — résumé condensé (ex. widget, notification). **Non implémenté** — prévu avec les notifications mobiles (`feat/019-mobile-notifications`).

## Composants de données (mission §24)

- Classement compact / classement détaillé (avec J/G/N/P/PTS/PP/PC/+- et zone de qualification visible, cf. `docs/product/business-rules.md`).
- Évolution des positions, forme récente (5 derniers résultats).
- Tableau à élimination directe (bracket) responsive.
- Chronologie de tournoi (progression des phases).
- Occupation des terrains / détection de conflits (admin).
- Statistiques de tournoi (nombre de matchs, buts, etc.).

## Composants transverses

- Barre de navigation (web : onglets horizontaux ; mobile : navigation inférieure, cf. `mobile-guidelines.md`).
- États vides pédagogiques (illustration + explication + CTA) — bon pattern déjà observé côté admin référence (`docs/product/screen-inventory.md`, écran A3) à reprendre et améliorer.
- Squelettes de chargement par type de contenu (liste, tableau, carte).
- Formulaires longs à étapes avec sauvegarde progressive (mission §21).
- Badges de statut — `ap-badge` **implémenté** (voir section "Composants transverses — IMPLÉMENTÉ" ci-dessus) pour les statuts de match ; statuts additionnels (forfait, pénalité, conflit) restent à ajouter au composant existant au fil des besoins.
- Éditeur de calendrier (vue chronologique, vue par terrain, vue par équipe/poule, cf. mission §21) — composant complexe dédié à spécifier en détail lors de `feat/012-schedule-editor`.

## Composants de marque

- Logo/signature (à finaliser après choix de direction — aucun logo définitif dans cette PR, mission §13).
- Motifs graphiques d'arrière-plan par direction (cf. `visual-language.md`).
