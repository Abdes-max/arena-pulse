# ADR 0002 — Backend NestJS (TypeScript) au lieu de Spring Boot (Java)

## Statut

Accepté — décision explicite du porteur de projet, en écart assumé par rapport à la stack suggérée dans la mission initiale (§27 : "Java, Spring Boot").

## Contexte

La mission d'origine proposait un backend Java/Spring Boot. Lors du démarrage de `feat/003-project-foundation`, le porteur de projet a demandé explicitement une stack **Angular (dernière version, 22) en frontend, NestJS en backend, PostgreSQL en base de données**, remplaçant Java/Spring Boot par NestJS.

## Décision

Le backend Arena Pulse est développé en **NestJS** (Node.js/TypeScript), avec :
- **PostgreSQL** comme SGBD (inchangé par rapport à la proposition initiale).
- **Prisma** comme ORM et outil de migration (équivalent fonctionnel à Flyway : migrations versionnées, explicites, réutilisables en revue de code), au lieu de Spring Data JPA + Flyway.
- **Passport.js** (`@nestjs/passport` + `passport-jwt`) pour l'authentification, au lieu de Spring Security. Keycloak reste une option compatible si son intégration est justifiée plus tard (OIDC/OAuth2 fonctionne aussi bien avec NestJS).
- **`@nestjs/swagger`** pour générer la spécification OpenAPI, au lieu de springdoc-openapi.
- **NestJS WebSocket Gateway** (ou Server-Sent Events via un contrôleur dédié) pour le temps réel, au lieu de Spring WebSocket — le choix technique précis (WebSocket vs SSE) reste une question ouverte indépendante de ce changement de stack (cf. `docs/product/assumptions-and-open-questions.md`).

## Justification

- Le porteur de projet connaît/préfère l'écosystème Node.js/TypeScript pour l'ensemble de la stack.
- **Un seul langage (TypeScript) sur tout le produit** : `apps/web` (fusion de public-web/admin-web), `mobile` (Ionic Angular) et désormais `api` partagent TypeScript, ce qui permet un partage réel de types (`libs/shared-models`) entre le frontend et le backend sans duplication ni génération de client à partir d'un contrat séparé — un avantage concret que la combinaison Angular + Java n'offrait pas.
- NestJS a une architecture modulaire proche de Spring (modules, injection de dépendances, décorateurs), ce qui préserve l'essentiel de l'architecture documentée dans `architecture-overview.md` (juste transposée en TypeScript) : contrôleurs ≈ `@Controller`, services ≈ `@Injectable`, modules ≈ `@Module`.

## Conséquences

- `docs/architecture/architecture-overview.md`, `docs/product/assumptions-and-open-questions.md` et tout futur document mentionnant Spring Boot/Java/Spring Security sont mis à jour en conséquence.
- Le monorepo devient **100 % TypeScript** côté applicatif (seul PostgreSQL reste un composant non-TypeScript), ce qui simplifie l'outillage racine (`npm run verify` peut couvrir tout le monorepo avec un seul gestionnaire de paquets, sans coordination Maven/npm séparée).
- Les migrations Prisma remplacent les migrations Flyway dans tous les documents futurs de modèle de données.

## Réversibilité

Décision structurante mais réversible en théorie (un backend NestJS pourrait être remplacé par un autre backend HTTP+PostgreSQL sans changer le contrat API côté clients, si un besoin futur l'exigeait) — documentée ici pour éviter toute ambiguïté avec le texte de mission original.
