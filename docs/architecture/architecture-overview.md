# Architecture — proposition initiale

Statut : première proposition (mission §27-§28), à affiner lors de `feat/003-project-foundation`. Décisions structurantes marquées `[ADR]` sont documentées dans `docs/architecture/adr/`.

## Structure monorepo proposée

```text
apps/
├── admin-web/      # Angular 22 — administration
├── public-web/     # Angular 22 — site public
├── mobile/         # Ionic Angular + Capacitor — iOS/Android
└── api/            # NestJS (TypeScript) — backend

libs/
├── api-client/           # client HTTP généré/partagé (à partir d'OpenAPI)
├── shared-models/        # types/interfaces partagés web + mobile
├── shared-utils/
├── authentication/       # logique d'auth partagée (tokens, guards)
├── design-system/        # composants Angular partagés (public-web + admin-web)
├── design-tokens/        # tokens partagés (web, mobile, email)
├── realtime-client/      # client WebSocket/SSE partagé
└── testing/              # utilitaires de test partagés

infra/
├── docker/
├── compose/
├── scripts/
└── deployment/

docs/
```

[ADR] Voir `adr/0001-monorepo-structure.md`.

## Frontend web

- **Angular 22**, TypeScript strict, composants standalone, Signals où pertinent, formulaires réactifs.
- Angular Material utilisé uniquement comme **base technique** (accessibilité, comportements clavier) — personnalisation visuelle complète imposée par le design system (mission §27, §11).
- `public-web` et `admin-web` sont deux applications distinctes (pas une seule app avec des routes conditionnelles), car leurs audiences, leurs contraintes de performance (SEO/partage public) et leurs cycles de publication diffèrent.

## Mobile

- Ionic Angular + Capacitor, builds Android et iOS.
- Partage avec le web via les libs `shared-models`, `api-client`, `authentication`, `design-tokens`, `realtime-client` — **pas** de partage forcé des composants UI (mission §27 : "ne force pas le partage des composants lorsque les usages web et mobile diffèrent").
- L'administration reste web-responsive dans un premier temps (mission §10.3) ; l'app mobile cible en priorité joueurs/parents/coachs/arbitres/bénévoles/spectateurs.

## Backend

- **NestJS** (TypeScript), API REST versionnée (`/api/v1/...`), **Prisma** comme ORM et outil de migration sur **PostgreSQL**, validation via `class-validator`/`class-transformer` (DTOs), **`@nestjs/swagger`** comme source de vérité OpenAPI des contrats.
- [ADR] Voir `adr/0002-backend-nestjs-instead-of-spring-boot.md` — décision explicite du porteur de projet, en écart assumé par rapport à la mission initiale (Java/Spring Boot).
- Temps réel via WebSocket (NestJS Gateway) ou Server-Sent Events — **choix technique non tranché** (voir `docs/product/assumptions-and-open-questions.md`, point bloquant #4), à documenter dans un `docs/architecture/realtime-strategy.md` dédié lors de la PR correspondante.
- Stockage compatible S3 pour les logos/médias, traitement asynchrone pour les notifications, journal d'audit pour les actions sensibles.
- Avantage direct de cette stack : **TypeScript de bout en bout** (public-web, admin-web, mobile, api), permettant un partage réel de types via `libs/shared-models` sans génération de client à partir d'un contrat séparé.

## Authentification

- Utilisateurs, organisations, rôles globaux et rôles liés au tournoi (voir `docs/product/roles-and-permissions.md`).
- **`@nestjs/passport` + `passport-jwt`** retenu par défaut pour la V1 ; Keycloak (OIDC/OAuth2) reste une option si sa complexité opérationnelle se justifie (mission §27) — décision explicitement laissée ouverte, pas prise dans cette PR.

## Ce que cette PR ne couvre pas

Cette proposition d'architecture est volontairement un point de départ, pas une implémentation. Le socle technique concret (squelettes de projets, CI, Docker Compose) sera développé dans `feat/003-project-foundation` et `feat/005-local-infrastructure`, après validation de cette proposition et de la direction artistique.
