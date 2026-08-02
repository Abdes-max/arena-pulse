# Architecture — proposition initiale

Statut : première proposition (mission §27-§28), à affiner lors de `feat/003-project-foundation`. Décisions structurantes marquées `[ADR]` sont documentées dans `docs/architecture/adr/`.

## Structure monorepo proposée

```text
apps/
├── web/            # Angular 22 — vitrine + site public de tournoi + administration (/admin) — IMPLÉMENTÉ, fusion de public-web/admin-web (voir plus bas)
├── mobile/         # Ionic Angular + Capacitor — Android — IMPLÉMENTÉ (feat/017, iOS différé)
└── api/            # NestJS (TypeScript) — backend

libs/
├── api-client/           # client HTTP partagé (endpoints publics) — IMPLÉMENTÉ (feat/017)
├── shared-models/        # types/interfaces partagés web + mobile — IMPLÉMENTÉ (feat/017)
├── shared-utils/
├── authentication/       # logique d'auth partagée (tokens, guards) — non nécessaire pour le socle mobile (suivi public anonyme, voir feat/017), à construire si un besoin d'auth mobile apparaît
├── design-system/        # composants Angular partagés (apps/web, admin comme public) — IMPLÉMENTÉ (feat/004)
├── design-tokens/        # tokens partagés (web, mobile, email) — IMPLÉMENTÉ (feat/004)
├── realtime-client/      # client SSE partagé (web + mobile) — IMPLÉMENTÉ (feat/017)
└── testing/              # utilitaires de test partagés

infra/
├── docker/               # Dockerfiles api/web (multi-stage) — IMPLÉMENTÉ (feat/035)
├── compose/              # infra de dev locale (postgres/minio/mailhog) — IMPLÉMENTÉ (feat/005)
├── scripts/
└── deployment/           # docker-compose.prod.yml auto-hébergeable — IMPLÉMENTÉ (feat/035, voir adr/0004)

docs/
```

[ADR] Voir `adr/0001-monorepo-structure.md`.

## Frontend web

- **Angular 22**, TypeScript strict, composants standalone, Signals où pertinent, formulaires réactifs.
- Angular Material utilisé uniquement comme **base technique** (accessibilité, comportements clavier) — personnalisation visuelle complète imposée par le design system (mission §27, §11).
- **[ADR] `public-web` et `admin-web` ont été fusionnées en une seule application (`apps/web`)** — décision initiale révisée. La proposition d'origine (deux apps distinctes, ci-dessous en italique pour mémoire) reposait sur des audiences/contraintes de performance/cycles de publication différents ; en pratique : les deux partageaient déjà `libs/design-system`/`libs/design-tokens`/`libs/shared-models`, **aucune des deux n'a jamais eu de SSR/prerendering** (l'argument SEO était donc aspirationnel, jamais implémenté), et le coût opérationnel réel de deux origines distinctes (CORS mono-origine côté API forçant des redémarrages constants en dev, deux serveurs à faire tourner) dépassait le bénéfice. Convention retenue dans `apps/web` : la racine `''` reste la vitrine anonyme + les sites publics de tournoi (`/:slug`), les routes organisateur vivent sous `/admin/**` (`authGuard` inchangé). Les slugs de tournoi (`generateSlug()`, `apps/api/src/tournaments/slug.util.ts`) portent toujours un suffixe hex aléatoire et ne peuvent donc jamais collisionner avec un mot réservé statique (`login`, `admin`…), tant que les routes statiques sont déclarées avant la route dynamique `:slug`.
  - _Proposition initiale (historique) : "`public-web` et `admin-web` sont deux applications distinctes (pas une seule app avec des routes conditionnelles), car leurs audiences, leurs contraintes de performance (SEO/partage public) et leurs cycles de publication diffèrent."_
- **Point de vigilance retenu de la fusion — singleton `ThemeService`** : `ThemeService` (`libs/design-tokens`) est `providedIn: 'root'`, donc un singleton partagé par toute l'application. Avant la fusion, atteindre l'admin depuis le site public impliquait toujours un rechargement complet de page (deux origines) — le reset du thème au `destroy` de `TournamentShell` n'était donc jamais réellement sollicité comme filet de sécurité. Une fois les deux fusionnées en une seule SPA, une navigation Router vers `/admin/**` ne recharge pas la page : un nouveau garde de route, `resetThemeGuard` (`apps/web/src/app/admin/core/reset-theme.guard.ts`), réapplique explicitement `ink-signal` avant l'activation de `/admin`, indépendamment de ce qu'un éventuel `TournamentShell` précédent a ou n'a pas nettoyé — une seconde ligne de défense qui ne coûtait rien tant que les deux apps étaient séparées, mais devient nécessaire une fois fusionnées.

## Mobile

- Ionic Angular + Capacitor. **IMPLÉMENTÉ (feat/017)** pour Android ; iOS différé (pas de Mac/CI macOS disponible au moment de cette PR — voir `docs/architecture/mobile-foundation.md`).
- Partage avec le web via les libs `shared-models`, `api-client`, `design-tokens`, `realtime-client` — **pas** de partage forcé des composants UI (mission §27 : "ne force pas le partage des composants lorsque les usages web et mobile diffèrent"), l'app mobile utilise les composants Ionic natifs. Pas de lib `authentication` pour l'instant : le socle mobile ne couvre que le suivi public anonyme (mêmes capacités que le site public de `apps/web`), sans compte utilisateur.
- L'administration reste web-responsive dans un premier temps (mission §10.3) ; l'app mobile cible en priorité joueurs/parents/coachs/arbitres/bénévoles/spectateurs.

## Backend

- **NestJS** (TypeScript), API REST versionnée (`/api/v1/...`), **Prisma** comme ORM et outil de migration sur **PostgreSQL**, validation via `class-validator`/`class-transformer` (DTOs), **`@nestjs/swagger`** comme source de vérité OpenAPI des contrats.
- [ADR] Voir `adr/0002-backend-nestjs-instead-of-spring-boot.md` — décision explicite du porteur de projet, en écart assumé par rapport à la mission initiale (Java/Spring Boot).
- Temps réel via WebSocket (NestJS Gateway) ou Server-Sent Events — **choix technique non tranché** (voir `docs/product/assumptions-and-open-questions.md`, point bloquant #4), à documenter dans un `docs/architecture/realtime-strategy.md` dédié lors de la PR correspondante.
- Stockage compatible S3 pour les logos/médias, traitement asynchrone pour les notifications, journal d'audit pour les actions sensibles.
- Avantage direct de cette stack : **TypeScript de bout en bout** (apps/web, mobile, api), permettant un partage réel de types via `libs/shared-models` sans génération de client à partir d'un contrat séparé.

## Authentification

- Utilisateurs, organisations, rôles globaux et rôles liés au tournoi (voir `docs/product/roles-and-permissions.md`).
- **`@nestjs/passport` + `passport-jwt`** retenu par défaut pour la V1 ; Keycloak (OIDC/OAuth2) reste une option si sa complexité opérationnelle se justifie (mission §27) — décision explicitement laissée ouverte, pas prise dans cette PR.

## Ce que cette PR ne couvre pas

Cette proposition d'architecture est volontairement un point de départ, pas une implémentation. Le socle technique concret (squelettes de projets, CI, Docker Compose) sera développé dans `feat/003-project-foundation` et `feat/005-local-infrastructure`, après validation de cette proposition et de la direction artistique.
