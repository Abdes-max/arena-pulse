# Opportunités de différenciation

Synthèse transversale des points faibles observés sur le site public de référence et des propositions pour Arena Pulse. Le détail par écran est dans `screen-inventory.md` ; ce document regroupe les thèmes récurrents.

## Problèmes observés

1. **Contenu éditorial non structuré** : les règles de format/qualification sont un unique bloc de texte libre avec emojis sur la page d'accueil, plutôt que des données structurées affichées via des composants dédiés.
2. **Manque de retour utilisateur** : les actions "Favori" et "Notification" ne produisent aucune confirmation visuelle testée (pas de toast, pas de changement d'état visible clairement).
3. **Un seul composant de carte de match** pour tous les contextes (poule, quart de finale, finale) — pas de mise en avant visuelle pour les matchs à enjeu (finale, petite finale).
4. **Absence de filtres persistants** sur le calendrier complet (uniquement une recherche texte), problématique dès qu'un tournoi dépasse quelques dizaines de matchs.
5. **Lien qualification ↔ classement peu visible** : sur le tableau de classement de poule, rien n'indique visuellement les zones de qualification (il faut relire le texte d'accueil pour comprendre qui va où).
6. **Incohérence de données observée** : le tableau "Classement final" affiche des colonnes PTS/BP/BC/+- vides — signe d'un affichage générique réutilisé sans adaptation au contexte multi-tableaux.
7. **Accessibilité potentiellement limitée** : boutons/icônes (favori, notification, partage) sans libellé texte visible identifié.
8. **Responsive non vérifiable de façon fiable** avec les outils disponibles lors de cet audit — à valider manuellement avant de conclure sur les forces/faiblesses mobiles réelles de la référence.

## Informations difficiles à trouver

- Les critères de départage en cas d'égalité de points ne sont affichés nulle part dans l'UI publique.
- Le nom complet d'une équipe dans un bracket compact (troncature sans tooltip visible) était parfois illisible.

## Actions trop longues / friction

- Pour trouver une équipe précise sans connaître son nom exact, il faut parcourir une grille de 20 boutons sans filtre par poule.

## Propositions pour Arena Pulse

- **Composants de match différenciés** (featured match, live match card, upcoming, result, compact row, bracket match) comme demandé en §20 de la mission — c'est directement la réponse au point faible #3.
- **Badges de zone de qualification** intégrés aux tableaux de classement de poule (répond au point #5).
- **Confirmations visuelles systématiques** (toast/snackbar) pour toute action utilisateur asynchrone (favori, notification) — répond au point #2.
- **Filtres persistants** (poule, terrain, statut) sur le calendrier, complémentaires à la recherche texte — répond au point #4.
- **Contenu structuré** pour les informations de format/qualification, avec un champ éditorial libre optionnel réservé aux annonces ponctuelles — répond au point #1.
- **Audit accessibilité systématique** des composants interactifs iconographiques (labels ARIA, contraste, focus visible) dès le design system — répond au point #7.
- Ces propositions n'engagent pas de décision irréversible et seront affinées lors de la conception du design system (`design/002-brand-and-design-system`).
