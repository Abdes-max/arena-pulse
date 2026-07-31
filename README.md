# Arena Pulse (nom de travail)

Plateforme premium de gestion de tournois sportifs — site public, administration web, applications mobiles iOS/Android, backend centralisé, API REST, temps réel et notifications.

> **Statut** : socle technique du monorepo (`feat/003-project-foundation`). Les applications sont des squelettes fonctionnels (build/lint/test validés) — le développement fonctionnel démarre dans les PR suivantes (`feat/006` et au-delà).

## Stack technique

- **Frontend** : Angular 22 (`apps/web` — vitrine, site public de tournoi et administration sous `/admin`), composants standalone, tests unitaires Vitest, tests end-to-end Playwright.
- **Backend** : NestJS (TypeScript, `apps/api`), Prisma + PostgreSQL, validation via `class-validator`, documentation OpenAPI via `@nestjs/swagger`, authentification `@nestjs/passport` + JWT.
- **Mobile** : Ionic Angular + Capacitor — prévu dans `feat/017-mobile-foundation`, pas encore présent dans ce dépôt.
- Voir `docs/architecture/architecture-overview.md` et `docs/architecture/adr/0002-backend-nestjs-instead-of-spring-boot.md` pour le détail et la justification de ces choix (écart assumé par rapport à la stack Java/Spring Boot suggérée dans la mission d'origine, à la demande explicite du porteur de projet).

## Documentation

- Vision produit : [`docs/product/product-vision.md`](docs/product/product-vision.md)
- Audit fonctionnel, inventaire des écrans, matrice de parité : [`docs/product/`](docs/product/)
- Identité de marque et directions artistiques : [`docs/design/`](docs/design/)
- Architecture, ADR, modèle de données : [`docs/architecture/`](docs/architecture/)

## Prérequis

- Node.js 22+, npm 10+
- Docker Desktop (ou Docker Engine + Compose) pour l'infrastructure locale (PostgreSQL, MinIO, Mailhog)

## Installation

```bash
npm install                 # dépendances Angular (racine du workspace)
cd apps/api && npm install  # dépendances NestJS (projet npm séparé)
```

## Variables d'environnement

Copier `.env.example` en `.env` à la racine pour référence, puis copier les valeurs pertinentes dans `apps/api/.env` (fichier local lu par Prisma et NestJS, non versionné). Voir `.env.example` pour la liste complète.

## Base de données

`apps/api/prisma/schema.prisma` définit le schéma (encore vide à ce stade — le modèle de données réel arrive avec les PR de fonctionnalités, cf. `docs/architecture/data-model.md`). Une fois PostgreSQL disponible et `DATABASE_URL` renseignée dans `apps/api/.env` :

```bash
cd apps/api
npx prisma migrate dev   # applique les migrations (une fois des modèles définis)
npx prisma generate      # régénère le client Prisma
```

## Démarrage local

```bash
npm run run               # démarre l'infra Docker (Postgres/MinIO/Mailhog) + api/web
npm run stop               # arrête tout ce que "npm run run" a démarré (les données sont conservées)
```

`npm run run` est idempotent : un service déjà démarré (le vôtre ou lancé autrement) est laissé tel quel plutôt que redémarré. Alternative pour le développement au jour le jour (suppose l'infra Docker déjà démarrée via `docker compose -f infra/compose/docker-compose.yml up -d`) :

```bash
npm run dev               # démarre web (4200, vitrine + site public + /admin) et l'API (3000) en parallèle
npm run dev:web            # uniquement le frontend
npm run dev:api            # uniquement l'API NestJS
```

L'API expose sa documentation OpenAPI sur `http://localhost:3000/api/docs` une fois démarrée. La console MinIO est sur `http://localhost:9001` et l'interface Mailhog sur `http://localhost:8025`.

## Tests

```bash
npm run test              # tests unitaires (web, api)
npm run e2e                # tests end-to-end Playwright (nécessite `npx playwright install` au préalable)
npm run test:api:e2e       # tests end-to-end de l'API (Jest + Supertest)
```

## Lint et build

```bash
npm run lint               # lint des 3 applications
npm run build               # build des 3 applications
npm run verify               # format:check + lint + build + test — à exécuter avant toute Pull Request
```

## Workflow Git

- `master` est la branche par défaut et protégée : aucun développement ni push direct dessus.
- Toute évolution passe par une branche dédiée et une Pull Request — voir [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Découpage des Pull Requests prévu : [`docs/product/pull-request-plan.md`](docs/product/pull-request-plan.md).

## Limites connues de ce socle

- Pas encore de build/tests mobiles (Ionic/Capacitor) — prévu dans `feat/017-mobile-foundation`.
- Le job CI "End-to-end (Playwright)" n'a pas encore été exécuté/observé en conditions réelles (GitHub Actions) — à vérifier lors de la première exécution de la pipeline.
- Aucun modèle Prisma n'est encore défini (schéma vide) — le modèle de données réel arrive avec les PR de fonctionnalités.
