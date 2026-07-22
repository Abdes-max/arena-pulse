# Couleurs

Les palettes complètes des 3 directions sont détaillées dans `visual-language.md`. Ce document couvre les règles **transverses**, valables quelle que soit la direction retenue, et les couleurs **fonctionnelles** partagées (statuts de match, etc.) — cf. mission §16.

## Couleurs fonctionnelles (communes aux 3 directions, teinte exacte ajustée par direction)

| Statut | Rôle | Règle |
| --- | --- | --- |
| Succès (victoire, validation) | Vert | Toujours accompagné d'une icône (✓) ou d'un texte, jamais seul |
| Information | Bleu neutre | Utilisé pour les messages d'information générale |
| Avertissement | Ambre | Conflits de planning, créneaux non résolus |
| Erreur | Rouge | Échecs de validation, formulaires ; jamais utilisé pour signaler une simple défaite sportive (voir ci-dessous) |
| Match à venir | Neutre/gris | Pas de couleur vive — un match à venir n'est pas un événement à alerter |
| Match en direct | Couleur signal de la direction (cyan/ambre/magenta) | Toujours accompagné du texte "EN DIRECT" ou équivalent, jamais de la couleur seule |
| Match terminé | Neutre | Le résultat (victoire/défaite/nul) est indiqué par icône + texte, la couleur rouge n'est PAS utilisée pour une défaite sportive (elle est réservée aux erreurs système, pour ne jamais confondre les deux registres) |
| Match reporté / annulé | Ambre / gris barré | Distinction visuelle claire entre "reporté" (peut reprendre) et "annulé" (définitif) |
| Qualification | Vert ou couleur signal de la direction | Toujours avec un badge textuel ("Qualifié") |
| Élimination | Neutre, jamais rouge "erreur" | Cf. remarque match terminé — l'élimination sportive n'est pas une erreur système |
| Équipe favorite | Couleur signal de la direction | Étoile pleine + couleur, jamais couleur seule |
| Score provisoire vs validé | Style de bordure/opacité différent, pas uniquement une couleur | Un score provisoire peut être encore modifié — l'affordance doit être visuelle au-delà de la couleur |
| Conflit (planning) | Ambre + icône dédiée | Cf. `iconography.md` |
| Terrain indisponible | Gris + icône barrée | |

**Décision de conception importante** (différenciation vs la référence observée) : contrairement à certaines interfaces de gestion sportive qui réutilisent le rouge/vert "erreur/succès" pour les résultats de match, Arena Pulse **sépare strictement** le vocabulaire chromatique des statuts système (erreur, avertissement, validation de formulaire) de celui des résultats sportifs (victoire, défaite, élimination), pour éviter qu'une élimination sportive normale ne soit lue comme une erreur applicative.

## Contraste et accessibilité

- Contraste minimum **WCAG AA (4.5:1)** pour tout texte, **AAA (7:1)** visé pour les scores et données critiques consultées en extérieur (mission §16, cas d'usage "bord de terrain en plein soleil" — mission §22).
- Chaque palette de direction est fournie avec une paire "texte sur fond" et "texte secondaire sur fond" dont le contraste devra être vérifié par un outil automatisé (ex. axe, Lighthouse) avant implémentation — engagement pris dans `accessibility-guidelines.md`.
- Aucune paire de couleurs adjacentes (ex. deux équipes dans un même bracket) ne doit dépendre uniquement de la teinte pour être distinguée par une personne daltonienne — le logo/nom d'équipe fait toujours foi.

## Thème clair / thème sombre

Les 3 directions proposent chacune un jeu de tokens clair ET sombre (voir tableaux dans `visual-language.md`). Aucune direction n'est "sombre uniquement" ou "claire uniquement" (mission §14 : "Le design ne doit pas être entièrement sombre").
