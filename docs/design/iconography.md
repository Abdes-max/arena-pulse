# Iconographie

Mission §18 : ne pas se limiter aux icônes Material par défaut, langage iconographique cohérent.

## Principes

- Épaisseur de trait homogène (2px à l'échelle 24px), angles cohérents selon la direction retenue (angles nets pour Direction A, plus doux pour B, chanfreinés pour C).
- Taille cible minimum tactile : 44×44px (zone cliquable), taille visuelle de l'icône 20-24px.
- Chaque icône a un état actif et inactif visuellement distincts (pas seulement une différence de couleur — cf. `colors.md`).
- **Jamais d'emoji comme icône fonctionnelle** dans le produit final — contrairement à la référence Tournify qui utilise des emojis dans son texte éditorial public (📍🗣️⚽), Arena Pulse utilise un système d'icônes SVG cohérent.

## Icônes requises (mission §18)

Tournoi · Équipe · Joueur · Arbitre · Terrain · Calendrier · Classement · Tableau final · Score · Direct · Notification · Favori · Forfait · Pénalité · Qualification · Trophée · Conflit · Publication.

Complétées suite à l'audit admin (permissions confirmées, cf. `docs/product/roles-and-permissions.md`) :
Gestion générale · Participants · Mise en page · Présentation · Site public · Diaporama · Conception · Scores · Avancement des phases.

## Source

Bibliothèque de base recommandée : un set d'icônes open-source à licence permissive (ex. Lucide, Phosphor) comme fondation technique, personnalisé pour les icônes propres au domaine sportif (tableau à élimination, qualification, trophée) qui n'existent pas nécessairement dans les bibliothèques génériques — décision technique standard et réversible, non bloquante.
