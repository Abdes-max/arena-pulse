# Arena Pulse (nom de travail)

Plateforme premium de gestion de tournois sportifs — site public, administration web, applications mobiles iOS/Android, backend centralisé, API REST, temps réel et notifications.

> **Statut** : socle technique du monorepo (`feat/003-project-foundation`). Les applications sont des squelettes fonctionnels (build/lint/test validés) — le développement fonctionnel démarre dans les PR suivantes (`feat/006` et au-delà).

## Stack technique

- **Frontend** : Angular 22 (`apps/public-web`, `apps/admin-web`), composants standalone, tests unitaires Vitest, tests end-to-end Playwright.
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
- PostgreSQL 15+ en local (ou via Docker Compose — prévu dans `feat/005-local-infrastructure`, pas encore présent)

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
npm run dev              # démarre public-web (4200), admin-web (4300) et l'API (3000) en parallèle
npm run dev:public-web    # uniquement le site public
npm run dev:admin-web     # uniquement l'administration
npm run dev:api           # uniquement l'API NestJS
```

L'API expose sa documentation OpenAPI sur `http://localhost:3000/api/docs` une fois démarrée.

## Tests

```bash
npm run test              # tests unitaires (public-web, admin-web, api)
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

- Pas encore de Docker Compose local (PostgreSQL doit être installé/lancé manuellement pour l'instant) — prévu dans `feat/005-local-infrastructure`.
- Pas encore de build/tests mobiles (Ionic/Capacitor) — prévu dans `feat/017-mobile-foundation`.
- Le job CI "End-to-end (Playwright)" n'a pas encore été exécuté/observé en conditions réelles (GitHub Actions) — à vérifier lors de la première exécution de la pipeline.
- Aucun modèle Prisma n'est encore défini (schéma vide) — le modèle de données réel arrive avec les PR de fonctionnalités.
