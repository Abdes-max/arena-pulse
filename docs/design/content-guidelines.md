# Règles de contenu éditorial

Mission §25. Ton : direct, humain, clair, rassurant, dynamique, professionnel.

## Principes

- Pas de jargon technique dans les messages destinés aux organisateurs non-experts (ex. éviter "entité", "payload", "webhook" dans l'UI).
- Un message d'erreur explique **ce qui s'est passé**, **pourquoi**, **comment corriger**, et confirme si les données saisies sont conservées (mission §25) — répond directement à un point faible potentiel identifié dans l'audit (aucune confirmation visuelle observée sur certaines actions de la référence, cf. `docs/product/opportunities.md`).
- Contrairement à la référence observée (emojis dans le texte éditorial public, cf. audit), Arena Pulse structure l'information en composants typés plutôt qu'en texte libre décoré d'emojis — cohérent avec `docs/product/opportunities.md`.
- Pas de tiret cadratin ("—") dans les textes affichés (i18n, labels construits en TS) ni dans les commentaires de code : c'est une signature visuelle de texte généré par IA. Utiliser la ponctuation naturelle à la place (virgule, point, deux-points, "·" pour séparer des segments courts) et "--" dans les commentaires, comme le reste du code existant.

## Contenus spécifiques à préparer (mission §25)

Aucun tournoi · Première utilisation · Aucune équipe · Aucun match · Tournoi non publié · Score non validé · Conflit · Perte de connexion · Suppression · Succès · Qualification · Tournoi terminé.

Ces contenus seront rédigés au fil des PR de développement correspondantes (chaque écran vit avec son propre texte, cf. `docs/product/screen-inventory.md` pour la liste des écrans concernés). Ce document fixe le ton, pas encore le texte final de chaque état.
