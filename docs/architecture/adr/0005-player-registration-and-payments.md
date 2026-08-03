# ADR 0005 — Comptes joueurs, inscription en ligne et paiement : Stripe Checkout, `PlayerAccount` séparé de `User`

## Statut

Accepté — `feat/036-player-registration-and-payments`.

## Contexte

Le plan produit (`docs/product/pull-request-plan.md`, item 25) prévoyait cette PR avec un
prestataire de paiement « à choisir ». `feat/034-observability` et `feat/035-deployment` ont
délibérément laissé cette décision de côté pour ne provisionner aucun compte/service externe sans
que le porteur de projet ne le décide lui-même (`docs/architecture/adr/0004-deployment-strategy.md`).
Trois questions à trancher avant d'implémenter :

1. Quel prestataire de paiement ?
2. Comment authentifier un joueur public (créant un compte pour s'inscrire) sans le confondre avec
   un `User` organisateur/collaborateur ?
3. Comment le flux d'inscription interagit-il avec les modèles `Team`/`Player` déjà gérés
   directement par les organisateurs (`feat/008-teams-and-participants`) ?

## Décision

1. **Stripe Checkout** comme prestataire de paiement — intégration la plus simple pour un paiement
   ponctuel par carte (pas d'abonnement à gérer), page de paiement hébergée par Stripe (aucune
   donnée de carte ne transite par l'API), et webhook signé pour confirmer le paiement de façon
   fiable côté serveur plutôt que de faire confiance à une redirection navigateur.
2. **`PlayerAccount` est un modèle distinct de `User`**, pas une extension :
   - `User` reste exclusivement un concept organisateur/collaborateur (toujours lié à un
     `OrganizationMember`, voir `AuthService.register`).
   - `PlayerAccount` n'appartient jamais à une organisation ; il s'authentifie sur des routes
     entièrement différentes (`/api/v1/player-auth/*`, `PlayerAuthModule`), avec sa propre stratégie
     JWT et son propre cookie de refresh (`player_refresh_token`, path `/api/v1/player-auth`,
     distinct de `refresh_token`/`/api/v1/auth`) — les deux sessions coexistent dans un même
     navigateur sans collision.
   - Les deux types de token sont signés avec le même `JWT_SECRET` (un seul secret à gérer) mais
     portent une claim `type: 'organizer' | 'player'` que chaque stratégie vérifie explicitement
     (`JwtStrategy.validate`, `PlayerJwtStrategy`) — sans ça, un token joueur passerait la
     validation d'une route organisateur (et vice versa) en résolvant `sub` contre la mauvaise
     table.
3. **`Registration` matérialise `Team`/`Player` uniquement une fois `PAID`**, pas à la création :
   - Une inscription commence à `PENDING_PAYMENT` (ou saute directement à `PAID` si
     `Category.registrationFeeCents` est `null` — catégorie gratuite, aucun appel Stripe).
   - `RegistrationsService.handleStripeEvent` traite `checkout.session.completed` : idempotent
     (une livraison de webhook répétée, ou un événement pour une session que ce service n'a pas
     créée, est un no-op silencieux plutôt qu'une erreur), matérialise `Team` + `Player[]` dans une
     transaction, et ne touche jamais aux lignes `Registration`/`RegistrationPlayer` déjà persistées
     — elles restent l'enregistrement d'origine de ce que le joueur a soumis.
   - Ce découpage garde le chemin organisateur (`TeamsService`, création directe) totalement
     inchangé : `Team.registration` est une relation optionnelle, `null` pour toute équipe créée
     directement par un organisateur (le chemin préexistant).
4. **Vérification de signature webhook via `req.rawBody`** (`main.ts` : `rawBody: true` sur
   `NestFactory.create`) — Stripe exige le corps brut, non re-sérialisé, pour valider la signature ;
   `PaymentsWebhookController` est la seule route qui en a besoin, le reste de l'app continue de
   recevoir un `req.body` parsé comme avant.
5. **`StripeService` instancie son client Stripe paresseusement** (pas dans le constructeur) — la
   quasi-totalité de l'app, y compris toute la suite e2e qui ne touche jamais aux paiements, doit
   pouvoir démarrer sans `STRIPE_SECRET_KEY` du tout ; seules les deux méthodes qui en ont
   réellement besoin (créer une session, vérifier un webhook) la réclament au moment de l'appel.

## Justification

- Un modèle `PlayerAccount` séparé (plutôt que d'ajouter un rôle « joueur » sur `User`) évite de
  complexifier `AuthModule`/`JwtStrategy` avec une notion de rôle qui n'a aucun rapport avec les
  organisations, et rend impossible par construction qu'un token joueur donne accès à une route
  organisateur — pas de vérification de rôle à maintenir à chaque nouvelle route admin, la
  séparation est structurelle.
- Matérialiser `Team`/`Player` seulement à `PAID` évite de polluer les vues organisateur (listes
  d'équipes, génération de calendrier) avec des inscriptions jamais payées, et rend le nettoyage
  d'une inscription abandonnée trivial (rien à défaire côté `Team`).
- Stripe Checkout plutôt qu'une intégration Elements/Payment Intents custom : la page de paiement
  hébergée déplace toute la conformité PCI DSS hors du périmètre de cette app.

## Conséquences

- **Aucun webhook réel ne peut être testé de bout en bout sans un compte Stripe** — la suite e2e
  (`test/registrations.e2e-spec.ts`) remplace entièrement `StripeService` par un stub plutôt que
  d'appeler l'API Stripe réelle ou de rejouer un webhook signé.
- **`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` restent à provisionner par le porteur de projet**
  avant tout paiement réel (`.env.example`) — cohérent avec la même position déjà prise sur SMTP et
  l'hébergement (ADR 0004).
- **Pas d'UI de remboursement/annulation organisateur dans cette PR** — `RegistrationsController`
  n'expose qu'une lecture seule (`GET .../registrations`) côté organisateur ; annuler une
  inscription payée nécessiterait un remboursement Stripe explicite, hors périmètre initial.
- **`infra/deployment/docker-compose.prod.yml` n'a pas encore ses `STRIPE_*` en variables
  requises** (`${VAR:?...}`) — à ajouter avant un déploiement réel qui active les paiements,
  cohérent avec le principe déjà posé par l'ADR 0004 (échouer explicitement plutôt que démarrer
  silencieusement sans secret).

## Réversibilité

Le prestataire de paiement est confiné à `PaymentsModule`/`StripeService` et aux deux champs
`stripeCheckoutSessionId`/`stripePaymentIntentId` sur `Registration` — remplacer Stripe par un
autre prestataire n'affecte ni `PlayerAccount`, ni le modèle `Registration` dans son ensemble, ni le
flux de matérialisation `Team`/`Player`.
