# ADR 0006 — Publication payante d'un tournoi : paliers par nombre d'équipes + abonnement annuel par organisation

## Statut

Accepté — `feat/039-paid-tournament-publication`, **révisé par
`feat/044-pricing-tiers-and-annual-subscription`** (remplace le calcul par
catégorie/équipe de la version initiale par un modèle à paliers, et ajoute
l'abonnement annuel par organisation). Le corps de cet ADR décrit directement
le modèle révisé ; la section Historique en bas de fichier conserve le
raisonnement de la version `feat/039` pour mémoire.

## Contexte

`docs/product/pull-request-plan.md` ne prévoyait initialement aucune facturation au niveau
`Organization` : `feat/036-player-registration-and-payments` (ADR 0005) a mis en place un paiement
Stripe Checkout, mais uniquement côté **joueur** (frais d'inscription d'une équipe à une
`Category`, encaissé par l'organisation). `feat/039` a introduit une facturation
**plateforme → organisation** au moment de la publication d'un tournoi, tarifée
`nb_catégories × PRIX_PAR_CATEGORIE + nb_équipes × PRIX_PAR_EQUIPE`.

À l'usage, ce calcul continu s'est révélé peu lisible pour les organisateurs (impossible
d'annoncer un prix simple avant de connaître le nombre exact de catégories/équipes) et ne
correspondait pas à la façon dont le porteur de projet voulait vendre le produit : des paliers
fixes, plus faciles à afficher sur la page vitrine, et une option d'abonnement pour les
organisations qui publient plusieurs tournois par an. `feat/044` remplace donc le calcul de prix
et ajoute un second mode de paiement, sans toucher au déclenchement (publication) ni au modèle
`TournamentPublicationOrder` existant.

## Décision

### Tarification par palier, au nombre d'équipes uniquement

1. **Le paiement reste déclenché par la publication (`TournamentsService.publish`), pas par la
   création.** `TournamentsService.create` reste inchangé (gratuit, immédiat, statut `DRAFT`).
   Catégories et équipes continuent de s'ajouter librement avant publication, sans plafond.
2. **Le prix est calculé au moment du clic "Publier"**, à partir du nombre réel d'équipes
   (`Team`) du tournoi à cet instant précis — le nombre de catégories n'entre plus dans le calcul
   (il reste enregistré sur `TournamentPublicationOrder` à titre d'historique/statistique, mais
   n'influence plus `amountCents`). Trois paliers, bornes configurables mais valeurs produit
   décidées :
   - **Gratuit** jusqu'à 8 équipes incluses.
   - **25 €** de 9 à 48 équipes incluses.
   - **80 €** au-delà de 48 équipes (pas de plafond supérieur).
3. **`TournamentPublicationOrder` inchangé dans sa forme** (une ligne par tentative de publication
   payante) : `tournamentId`, `status` (`PENDING_PAYMENT`/`PAID`), `categoriesCount`,
   `teamsCount`, `amountCents`, `currency`, `stripeCheckoutSessionId` (unique),
   `stripePaymentIntentId`, `paidAt`. Seul le calcul qui produit `amountCents` change.
4. **Pas de re-facturation à une republication ultérieure** (inchangé) : si le tournoi a déjà un
   `TournamentPublicationOrder` au statut `PAID`, `publish()` republie directement sans repasser par
   Stripe, même si le nombre d'équipes a grossi entre-temps et changerait de palier.
5. **Prix nul (palier gratuit) → publication immédiate sans Stripe** (inchangé) : un
   `TournamentPublicationOrder` à `amountCents: 0`/`PAID` est tout de même créé pour que les
   republications suivantes soient reconnues comme déjà payées (règle #4).
6. **Tarification en variables d'environnement, pas en dur** :
   `TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS` (défaut `8`),
   `TOURNAMENT_PUBLICATION_TIER_MID_MAX_TEAMS` (défaut `48`),
   `TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS` et `TOURNAMENT_PUBLICATION_TIER_HIGH_PRICE_CENTS`
   (défaut `0` chacun pour ne rien casser en local/dev/e2e tant qu'ils ne sont pas provisionnés) —
   remplacent `TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS`/`_PER_TEAM_CENTS` de `feat/039`.

### Abonnement annuel par organisation

7. **Nouveau modèle `OrganizationSubscription`**, alternative au paiement à l'unité ci-dessus :
   une ligne active (`status: ACTIVE`, `expiresAt` dans le futur) couvre **toutes** les
   publications de **cette organisation** pendant un an, quel que soit le palier que chaque
   tournoi aurait individuellement atteint. Champs : `organizationId`, `status`
   (`PENDING_PAYMENT`/`ACTIVE`), `startsAt`, `expiresAt`, `amountCents`, `currency`,
   `stripeCheckoutSessionId` (unique), `stripePaymentIntentId`, `paidAt` — même esprit que
   `TournamentPublicationOrder`, mais rattaché à `Organization` et pas à `Tournament`.
8. **Portée : par organisation**, pas par utilisateur ni par tournoi individuel. Toute
   publication faite par n'importe quel administrateur de l'organisation pendant la période
   active en bénéficie.
9. **`TournamentsService.publish` vérifie l'abonnement avant de calculer le palier** : si
   `OrganizationsService.hasActiveSubscription(organizationId)` est vrai, la publication est
   gratuite et immédiate (même chemin que le palier gratuit — un `TournamentPublicationOrder` à
   `amountCents: 0`/`PAID` est créé pour l'historique), sans jamais appeler
   `computePublicationFeeCents`.
10. **Un tournoi déjà publié pendant qu'un abonnement est actif reste publié après l'expiration de
    l'abonnement.** L'abonnement expirant n'est jamais consulté rétroactivement pour dépublier
    quoi que ce soit — il ne conditionne que les futurs appels à `publish()`. Aucun job de
    dépublication à l'expiration n'existe ni n'est prévu.
11. **Renouvellement manuel pour cette première version** : pas de reconduction automatique à
    l'expiration, pas d'intégration avec l'API Stripe Subscriptions — un nouvel abonnement se
    souscrit exactement comme le premier (`OrganizationsService.subscribe`), via un nouveau
    Stripe Checkout en mode paiement unique (`mode: 'payment'`), pas un abonnement récurrent
    Stripe. `subscribe()` refuse (409) si un abonnement actif existe déjà, pour garder "une seule
    ligne active à la fois" simple — pas d'empilement/prolongation de la date d'expiration.
12. **Prix en variable d'environnement** : `ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS` (défaut
    `0`, même posture que les autres montants).
13. **Un webhook Stripe, trois gestionnaires idempotents indépendants** (au lieu de deux) :
    `PaymentsWebhookController` transmet chaque événement `checkout.session.completed` à
    `RegistrationsService.handleStripeEvent`, `TournamentsService.handlePublicationStripeEvent`
    **et** `OrganizationsService.handleSubscriptionStripeEvent` : chacun cherche sa propre ligne
    par `stripeCheckoutSessionId` et ne fait rien si elle n'existe pas — toujours pas de
    dispatcher `metadata.type`, toujours pas de couplage entre les trois modules.
14. **Réutilisation de `StripeService.createCheckoutSession`** telle quelle, comme pour la
    publication à l'unité — aucune modification du service Stripe lui-même.

## Justification

- Des paliers fixes sont plus simples à annoncer sur la page vitrine et à comprendre pour un
  organisateur qu'un calcul continu par catégorie/équipe — c'est la demande produit directe qui
  motive cette révision.
- Retirer les catégories du calcul simplifie le modèle mental ("le prix dépend de la taille du
  tournoi, mesurée en équipes") sans perdre d'information utile : `categoriesCount` reste
  enregistré sur l'order pour analyse, seulement plus utilisé pour tarifer.
- L'abonnement en paiement unique annuel (pas Stripe Subscriptions) évite d'introduire un second
  système de facturation récurrente alors qu'aucune reconduction automatique n'est demandée pour
  cette itération — cohérent avec le choix déjà fait par `feat/039` de préférer `mode: 'payment'`
  à un abonnement Stripe pour la publication à l'unité.
- Ne jamais dépublier rétroactivement à l'expiration d'un abonnement évite un job de fond et une
  classe entière de bugs (un tournoi qui disparaît du site public sans action de l'organisateur) ;
  c'est aussi la position la plus simple à défendre commercialement ("ce qui est publié le reste").
- Trois gestionnaires webhook idempotents indépendants plutôt qu'un dispatcher : suit exactement
  le raisonnement déjà validé par l'ADR 0005 puis la version initiale de cet ADR, et garde chaque
  modèle (`Registration`, `TournamentPublicationOrder`, `OrganizationSubscription`) ignorant de
  l'existence des deux autres.

## Conséquences

- **Pas de facturation complémentaire si le tournoi grossit après publication** (inchangé depuis
  `feat/039`) — ajouter des équipes à un tournoi déjà publié et payé, ou déjà couvert par un
  abonnement actif au moment de la publication, n'entraîne aucun nouveau paiement même si le
  palier qu'il atteindrait "aujourd'hui" est plus élevé.
- **`TournamentsController.publish` conserve son contrat de retour** posé par `feat/039` : soit le
  `TournamentDetail` mis à jour (palier gratuit, republication, ou abonnement actif), soit
  `{ status: 'PENDING_PAYMENT', checkoutUrl }`.
- **Nouvel endpoint `organizations/:organizationId/subscription`** (`GET` pour l'état courant —
  `NONE`/`PENDING_PAYMENT`/`ACTIVE` —, `POST` pour souscrire), protégé `ORG_ADMIN` comme
  `tournaments/:id/publish`. Nouvelle page de confirmation côté admin
  (`.../subscription/success`) sur le modèle de `tournament-publish-success.page.ts` : sondage de
  l'état de l'abonnement plutôt que lecture directe de `session_id`.
- **`TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS`/`_PER_TEAM_CENTS` sont retirés** (remplacés
  par les variables de palier listées en Décision) — tout déploiement existant doit migrer ses
  variables d'environnement lors de la mise à jour.
- **Toutes les nouvelles variables de prix restent à `0` par défaut** — aucune organisation n'est
  facturée tant que le porteur de projet n'a pas explicitement fixé ces montants en production
  (`.env`), cohérent avec la position déjà prise sur `STRIPE_SECRET_KEY`.
- **Page vitrine** : les paliers et l'abonnement annuel doivent être visibles publiquement (page
  d'accueil web) pour que la tarification soit connue avant inscription — voir
  `apps/web/src/app/pages/landing/landing.page.html`.

## Réversibilité

Le calcul de prix, `TournamentPublicationOrder` et `OrganizationSubscription` restent confinés à
`TournamentsService`/`OrganizationsService` — ils n'affectent ni `Registration`, ni
`PlayerAccount`, ni le flux d'inscription joueur existant (ADR 0005). Revenir à un calcul par
catégorie/équipe, ou retirer l'abonnement annuel, reviendrait à modifier uniquement
`TournamentsService.computePublicationFeeCents` et la vérification en tête de `publish()`, sans
toucher au reste du modèle `Tournament` ni à `TournamentPublicationOrder`. Supprimer l'abonnement
reviendrait à retirer `OrganizationSubscription`, `OrganizationSubscriptionController` et l'appel
à `hasActiveSubscription` dans `publish()` — les tournois déjà publiés via un abonnement expiré
resteraient `PUBLISHED` (aucune dépendance inverse créée).

## Historique — version initiale (`feat/039`)

Pour mémoire, la version d'origine de cet ADR tarifait
`nb_catégories × PRIX_PAR_CATEGORIE + nb_équipes × PRIX_PAR_EQUIPE`
(`TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS`/`_PER_TEAM_CENTS`), sans notion d'abonnement.
Les options de conception alors tranchées (paiement au niveau plateforme et non une extension des
frais d'inscription joueur ; frais unique par tournoi ; prix calculé à la publication et non à la
création faute de nombres fiables avant) restent valables et sont reprises telles quelles dans la
Décision ci-dessus ; seule la formule de prix et l'ajout de l'abonnement ont changé.
