# Règles responsive

## Breakpoints (proposition initiale, standard et réversible)

| Nom | Largeur | Usage |
| --- | --- | --- |
| `xs` | < 480px | Mobile portrait |
| `sm` | 480–767px | Mobile paysage / petite tablette |
| `md` | 768–1023px | Tablette |
| `lg` | 1024–1439px | Desktop standard |
| `xl` | ≥ 1440px | Grand écran / mode diaporama |

## Règles transverses

- Mobile-first : les styles de base ciblent `xs`, les breakpoints supérieurs ajoutent de la densité/complexité, jamais l'inverse.
- Aucun défilement horizontal non intentionnel — les éléments larges (brackets, tableaux de calendrier multi-terrains) utilisent un conteneur de défilement horizontal explicite avec indice visuel (pas un débordement silencieux). Ceci répond directement à un point faible identifié dans l'audit : les brackets à 8 équipes de la référence seront probablement larges sur petit écran (`docs/product/screen-inventory.md`, écran 5).
- Les tableaux denses (classement, calendrier multi-terrains) proposent une vue alternative simplifiée sous `md` plutôt qu'une simple réduction de taille de police.
- Le mode diaporama (`xl` et grand écran) a ses propres règles de densité, distinctes du reste du produit (texte et éléments beaucoup plus grands, pensés pour une lecture à distance).

## Points à vérifier avant implémentation

Le rendu réel du site de référence sur mobile/tablette n'a pas pu être vérifié de façon fiable lors de l'audit fonctionnel (cf. `docs/product/assumptions-and-open-questions.md`) — ces règles sont donc des principes de conception standards, pas une reproduction du comportement observé.
