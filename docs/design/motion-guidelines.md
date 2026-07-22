# Principes d'animation

Mission §23. S'applique quelle que soit la direction artistique.

## Contraintes transverses

- Durée : 150-300ms pour les micro-interactions fonctionnelles ; jusqu'à 600ms pour les moments émotionnels (victoire, trophée), jamais au-delà.
- Toute animation est **interruptible** — un utilisateur qui navigue pendant une animation ne doit jamais être bloqué.
- **`prefers-reduced-motion` respecté systématiquement** : les animations émotionnelles se réduisent à un simple fondu ou disparaissent, sans perte d'information.
- Aucune animation ne doit être uniquement décorative sur les écrans denses (admin, classements) — le mouvement doit toujours porter du sens (ex. un tri qui anime le repositionnement des lignes aide à comprendre le changement).

## Animations fonctionnelles (répondent à une action utilisateur)

Ouverture/fermeture, changement d'onglet, tri, filtre, validation, glisser-déposer, sauvegarde, erreur, chargement — transitions courtes (150-250ms), easing standard (ease-out à l'entrée, ease-in à la sortie).

## Animations émotionnelles (mise en scène du produit)

Lancement du tournoi, passage en direct, score marqué, victoire, qualification, élimination, trophée, fin du tournoi — traitement plus riche mais toujours interruptible :
- **Passage en direct** : pulsation discrète et continue du badge "LIVE" (couleur signal selon la direction retenue), pas de clignotement agressif.
- **Score marqué** : la Direction A privilégie une pulsation brève du chiffre ; la Direction B un léger rebond ; la Direction C un flash du halo magenta — cf. `visual-language.md`.
- **Qualification / victoire / trophée** : moment le plus riche autorisé (jusqu'à 600ms, confettis ou halo selon direction), déclenché une seule fois par événement (pas à chaque revisite de l'écran).

## États de chargement

Squelettes (skeleton screens) plutôt que spinners génériques pour les listes/tableaux — cohérent avec ce qui a été observé (et à améliorer) sur la référence (cf. `docs/product/screen-inventory.md`, écran Classements). Un squelette doit refléter approximativement la forme du contenu réel pour éviter un saut de mise en page (CLS).
