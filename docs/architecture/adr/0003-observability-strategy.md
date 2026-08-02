# ADR 0003 — Observabilité : logs structurés stdout, sans SDK tiers pour l'instant

## Statut

Accepté — `feat/034-observability`.

## Contexte

Avant cette PR, le produit n'avait aucune observabilité : pas de logging structuré côté API
(seul le logger console par défaut de Nest, non configuré), pas de endpoint de santé, pas de
filtre d'exceptions global (donc pas de trace cohérente des erreurs 500), pas de corrélation
entre les logs d'une même requête, et aucun `ErrorHandler` Angular côté `apps/web`/`apps/mobile`
au-delà du `console.error` par défaut sur l'échec du bootstrap. `feat/033-deployment` (à venir)
aura besoin d'un endpoint de santé pour un load balancer/orchestrateur ; ce travail-ci prépare
ce terrain sans attendre le choix de l'environnement de déploiement.

## Décision

1. **Logs structurés, sans dépendance externe** : `apps/api/src/common/logger/json-logger.service.ts`
   implémente `LoggerService` de Nest et écrit une ligne JSON par entrée (stdout, stderr pour
   error/fatal) — pas de Pino/Winston. Passé à `NestFactory.create(AppModule, { logger })` dans
   `main.ts`, donc même les logs internes de démarrage de Nest passent par ce format.
2. **Corrélation par requête** : `RequestIdMiddleware` assigne un `x-request-id` (repris de l'en-tête
   entrant s'il existe, sinon généré), le renvoie sur la réponse, et l'attache à `req.requestId` —
   lu par `LoggingInterceptor` et `AllExceptionsFilter` pour que toutes les lignes de log d'une même
   requête (et l'éventuelle erreur retournée au client) soient grep-ables ensemble.
3. **Un log par requête HTTP** : `LoggingInterceptor` (méthode, chemin, statut, durée, requestId),
   appliqué globalement sauf sur `/health` (évite de noyer les vrais logs sous le bruit d'un
   orchestrateur qui sonde toutes les quelques secondes).
4. **Filtre d'exceptions global** : `AllExceptionsFilter` (`@Catch()` sans argument) journalise
   systématiquement (avec stack trace pour les 5xx) et ajoute `requestId` au corps JSON renvoyé au
   client. Le corps et le statut d'une `HttpException` existante (ex. `{ message: string[] }` de
   `ValidationPipe`) ne sont **pas** modifiés au-delà de l'ajout de `requestId` — seules les erreurs
   non-`HttpException` (bugs réellement inattendus) voient leur message remplacé par un message
   générique, pour ne jamais renvoyer une stack trace ou un détail interne au client.
5. **Endpoint de santé** : `GET /api/v1/health` (`@nestjs/terminus`, `@Public()`), vérifie la
   connectivité PostgreSQL via Prisma (`SELECT 1`). Pensé pour être consommé par un load
   balancer/orchestrateur lors de `feat/033-deployment`, pas encore branché nulle part côté infra.
6. **Frontend** : `GlobalErrorHandler` (`apps/web` et `apps/mobile`, dupliqué à l'identique dans
   chaque app plutôt que mutualisé dans une lib partagée — deux usages, ~20 lignes, la ceremony
   d'une nouvelle lib Nx ne se justifie pas ici) implémente `ErrorHandler` et journalise en
   `console.error` une entrée structurée (timestamp, message, url, stack). Combiné à
   `provideBrowserGlobalErrorListeners()` déjà en place, qui capte aussi les erreurs hors zone
   Angular (`window.onerror`, `unhandledrejection`).
7. **Pas de SDK de tracking d'erreurs tiers (Sentry ou équivalent) pour l'instant** — décision
   explicite du porteur de projet lors du cadrage de cette PR. Provisionner un tel service
   nécessite un compte/projet externe que l'assistant ne peut pas créer à sa place ; à revisiter une
   fois `feat/033-deployment` fixé un environnement de production réel.

## Justification

- Cohérent avec `feat/030-security-hardening` : durcissement pragmatique et auto-hébergé, sans
  ajouter de nouvelle infrastructure externe non demandée (à l'image du choix différé de
  prestataire de paiement dans `feat/034-player-registration-and-payments`).
- Les logs JSON stdout sont directement exploitables par n'importe quel collecteur (Docker
  logging driver, Loki, CloudWatch...) sans changement de code le jour où l'un d'eux est choisi —
  éviter une dépendance à un format propriétaire dès maintenant.
- Préserver le contrat de réponse d'erreur existant (`AllExceptionsFilter` ne fait qu'ajouter
  `requestId`) évite de casser silencieusement des vérifications `error.status`/`error.error.message`
  déjà écrites dans `apps/web`/`apps/mobile` au fil des PR précédentes.

## Conséquences

- `docs/testing/accessibility-test-plan.md` et les futurs plans de test manuels devraient inclure
  un contrôle rapide de `/api/v1/health` avant toute session de vérification manuelle (base de
  données accessible avant de perdre du temps à déboguer autre chose).
- `feat/033-deployment` doit configurer son load balancer/orchestrateur pour sonder
  `GET /api/v1/health` plutôt que la racine `GET /api/v1`.
- Toute future intégration Sentry (ou équivalent) n'aura qu'à enregistrer son propre `ErrorHandler`/
  intercepteur en plus de ceux-ci, pas à les remplacer.

## Réversibilité

Le logger JSON maison, le filtre d'exceptions et le `GlobalErrorHandler` sont de petites classes
autonomes, remplaçables individuellement (par Pino/Winston côté API, par un SDK Sentry côté
frontend) sans toucher au reste de l'application.
