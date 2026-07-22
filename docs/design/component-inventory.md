# Inventaire des composants clés

Liste des composants à concevoir dans le design system, une fois la direction artistique choisie (`feat/004-design-system-foundation`). Cette PR ne livre pas ces composants en code — uniquement leur inventaire et leur traitement visuel de référence par direction (`visual-language.md`).

## Composants de match (mission §20 — pas un composant unique pour tous les contextes)

- **Featured match** — mise en avant d'un match à enjeu (finale, petite finale) sur l'accueil public.
- **Live match card** — carte d'un match en cours, badge "EN DIRECT", mise à jour temps réel.
- **Upcoming match card** — carte d'un match à venir (heure, terrain, équipes, sans score).
- **Result card** — carte d'un match terminé (score final, indicateur victoire/défaite/nul sans couleur seule).
- **Compact match row** — ligne dense pour listes longues (calendrier complet).
- **Bracket match** — nœud d'un tableau à élimination directe (cf. `visual-language.md` par direction).
- **Team match card** — carte centrée sur une équipe (utilisée sur la fiche équipe).
- **Match summary** — résumé condensé (ex. widget, notification).

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
- Badges de statut (qualifié, en direct, forfait, pénalité, conflit) — cf. `colors.md` et `iconography.md`.
- Éditeur de calendrier (vue chronologique, vue par terrain, vue par équipe/poule, cf. mission §21) — composant complexe dédié à spécifier en détail lors de `feat/012-schedule-editor`.

## Composants de marque

- Logo/signature (à finaliser après choix de direction — aucun logo définitif dans cette PR, mission §13).
- Motifs graphiques d'arrière-plan par direction (cf. `visual-language.md`).
