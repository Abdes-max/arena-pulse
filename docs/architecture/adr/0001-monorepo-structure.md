# ADR 0001 — Structure monorepo

## Statut

Proposé (décision technique standard, réversible — cf. mission §4).

## Contexte

Le produit comprend un site public web, une administration web, des applications mobiles iOS/Android, et un backend centralisé, partageant des modèles, contrats API et logique d'authentification.

## Décision

Adopter une structure monorepo unique (`apps/`, `libs/`, `infra/`, `docs/`) plutôt que des dépôts séparés par application.

## Justification

- Partage direct des types/contrats (`shared-models`, `api-client`) sans processus de publication de package intermédiaire.
- Une seule Pull Request peut couvrir une évolution transverse (ex. un nouveau champ d'API + son usage web + mobile) sans coordination multi-dépôts.
- Cohérence du design system et des tokens plus simple à maintenir dans un même dépôt.

## Conséquences

- Nécessite un outillage de build capable de cibler sélectivement chaque app (scripts `npm run` par app, cf. `docs/testing/test-strategy.md` à venir).
- Le dépôt grossira avec le temps ; à surveiller mais non bloquant pour le MVP.

## Alternatives envisagées

- Dépôts séparés par application : rejeté pour la V1 car cela complique le partage de contrats API et de design tokens sans bénéfice clair à ce stade (équipe réduite, pas de contrainte d'accès différenciée entre dépôts).

## Réversibilité

Réversible : une extraction ultérieure d'une app vers son propre dépôt reste possible (ex. via `git subtree`) si la taille de l'équipe ou du dépôt le justifie.
