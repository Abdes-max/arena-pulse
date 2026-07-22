# Contribuer à Arena Pulse

## Workflow Git

- `master` est la branche par défaut et protégée : aucun développement ni push direct dessus.
- Toute évolution passe par une branche dédiée, créée depuis `origin/master` à jour :
  ```text
  feat/<ticket>-<description>
  fix/<ticket>-<description>
  refactor/<ticket>-<description>
  docs/<ticket>-<description>
  design/<ticket>-<description>
  chore/<ticket>-<description>
  ```
- Une Pull Request ne mélange pas plusieurs domaines majeurs (voir `docs/product/pull-request-plan.md` pour le découpage prévu).
- Utilise `PULL_REQUEST_TEMPLATE.md` pour la description de PR — toutes les sections sont obligatoires.
- Seul le porteur de projet valide et déclenche la fusion finale.

## Commits

- Suivent [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `design:`, `chore:`, `refactor:`).
- Commits atomiques : un commit = un changement cohérent et compréhensible isolément.

## Avant de pousser une branche

Lance `npm run verify` à la racine (voir `README.md`) — il doit passer sans erreur : lint, build, tests pour les applications Angular concernées, et les contrôles équivalents pour l'API NestJS.

## Style de code

- TypeScript strict partout (frontend et backend).
- Respecte les conventions Angular (composants standalone, signals) documentées dans `docs/architecture/architecture-overview.md`.
- Respecte le design system et les principes de `docs/design/design-principles.md` pour tout code d'interface.

## Accessibilité

Toute contribution touchant l'interface doit respecter `docs/design/accessibility-guidelines.md` (contraste, labels, navigation clavier, `prefers-reduced-motion`).
