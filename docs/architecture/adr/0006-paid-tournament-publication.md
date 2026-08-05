# ADR 0006 — Publication payante d'un tournoi : tarification par catégorie/équipe, paiement au moment du clic "Publier"

## Statut

Accepté — `feat/039-paid-tournament-publication`.

## Contexte

`docs/product/pull-request-plan.md` ne prévoyait initialement aucune facturation au niveau
`Organization` : `feat/036-player-registration-and-payments` (ADR 0005) a mis en place un paiement
Stripe Checkout, mais uniquement côté **joueur** (frais d'inscription d'une équipe à une
`Category`, encaissé par l'organisation). Il n'existe aucun modèle de facturation de la
**plateforme vers l'organisation** : la création d'un tournoi (`TournamentsService.create`) est
aujourd'hui entièrement gratuite et immédiate.

Le porteur de projet a demandé la mise en place d'un tournoi payant côté organisation. Plusieurs
options de conception ont été discutées et tranchées :

1. Paiement au niveau plateforme (l'organisation paie Arena Pulse), pas une extension du système
   de frais d'inscription joueur existant.
2. Frais unique par tournoi (pas d'abonnement récurrent à gérer).
3. Le prix n'est pas un forfait fixe : il dépend du nombre de catégories et du nombre d'équipes du
   tournoi (`prix = nb_catégories × PRIX_PAR_CATEGORIE + nb_équipes × PRIX_PAR_EQUIPE`, pas de
   socle fixe).
4. Un tournoi se crée aujourd'hui vide (`DRAFT`), puis les catégories et équipes sont ajoutées
   progressivement — ces chiffres ne sont donc fiables qu'**au moment de la publication**, pas à la
   création. Déclarer une capacité maximale à la création (avec plafonds/compléments de paiement en
   cas de dépassement) a été envisagé puis écarté au profit d'un calcul différé.

## Décision

1. **Le paiement est déclenché par la publication (`TournamentsService.publish`), pas par la
   création.** `TournamentsService.create` reste inchangé (gratuit, immédiat, statut `DRAFT`).
   Catégories et équipes continuent de s'ajouter librement avant publication, sans plafond.
2. **Le prix est calculé au moment du clic "Publier"**, à partir du nombre réel de `Category` et de
   `Team` du tournoi à cet instant précis — pas d'estimation déclarative, pas de plafond appliqué
   ensuite.
3. **Nouveau modèle `TournamentPublicationOrder`** (une ligne par tentative de publication payante,
   au même esprit que `Registration` de l'ADR 0005) : `tournamentId`, `status`
   (`PENDING_PAYMENT`/`PAID`), `categoriesCount`, `teamsCount`, `amountCents`, `currency`,
   `stripeCheckoutSessionId` (unique), `stripePaymentIntentId`, `paidAt`. Contrairement à
   `Registration`, ce modèle ne matérialise rien de nouveau au paiement confirmé — le `Tournament`
   existe déjà — il ne fait que faire passer son statut à `PUBLISHED`.
4. **Pas de re-facturation à une republication ultérieure** : si le tournoi a déjà un
   `TournamentPublicationOrder` au statut `PAID`, `publish()` republie directement sans repasser par
   Stripe, même si des catégories/équipes ont été ajoutées entre-temps. Le paiement couvre le
   premier passage à `PUBLISHED`, pas un abonnement à la visibilité publique. Un mécanisme de
   facturation additionnelle à la croissance du tournoi (équipes ajoutées après publication) est
   explicitement **hors périmètre** de cette PR — voir Conséquences.
5. **Prix nul → publication immédiate sans Stripe**, même logique que le cas gratuit de
   `RegistrationsService.createForPlayer` (catégorie sans `registrationFeeCents`) : un tournoi
   encore vide (0 catégorie, 0 équipe) au moment du clic se publie sans paiement, et un
   `TournamentPublicationOrder` à `amountCents: 0`/`PAID` est tout de même créé pour que les
   republications suivantes soient reconnues comme déjà payées (règle #4).
6. **Un seul webhook Stripe, deux gestionnaires idempotents indépendants.** Plutôt que d'ajouter un
   dispatcher basé sur `metadata.type`, `PaymentsWebhookController` transmet chaque événement
   `checkout.session.completed` à `RegistrationsService.handleStripeEvent` **et**
   `TournamentsService.handlePublicationStripeEvent` : chacun cherche sa propre ligne par
   `stripeCheckoutSessionId` et ne fait rien si elle n'existe pas (même garantie d'idempotence déjà
   posée par l'ADR 0005) — pas de couplage entre les deux modules, pas de champ `type` à maintenir.
7. **Tarification en variables d'environnement, pas en dur** :
   `TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS` et `TOURNAMENT_PUBLICATION_FEE_PER_TEAM_CENTS`
   (défaut `0` pour ne rien casser en local/dev/e2e tant qu'elles ne sont pas provisionnées),
   cohérent avec le principe déjà posé par l'ADR 0004/0005 de laisser les décisions commerciales
   (tarifs, secrets) au porteur de projet plutôt que de les figer dans le code.
8. **Réutilisation de `StripeService.createCheckoutSession`** telle quelle (déjà générique :
   montant/devise/nom de produit/URLs/metadata) — aucune modification du service Stripe lui-même.

## Justification

- Calculer le prix à la publication plutôt qu'à la création évite de faire deviner à
  l'organisateur un nombre d'équipes qu'il ne connaît souvent pas encore, et évite tout le
  mécanisme de plafonds + paiement complémentaire qu'un modèle "capacité déclarée" aurait exigé.
- Ne pas re-facturer à chaque republication garde la mécanique simple à raisonner (un paiement =
  une transition `DRAFT → PUBLISHED` déverrouillée pour la vie du tournoi) et évite un système de
  facturation à l'usage bien plus complexe, non demandé pour cette itération.
- Deux gestionnaires webhook idempotents indépendants plutôt qu'un dispatcher : suit exactement le
  raisonnement déjà validé par l'ADR 0005 pour `RegistrationsService.handleStripeEvent`, et garde
  `TournamentPublicationOrder` complètement ignorant de l'existence de `Registration` (et
  réciproquement).

## Conséquences

- **Pas de facturation complémentaire si le tournoi grossit après publication** — ajouter des
  équipes/catégories à un tournoi déjà publié et payé n'entraîne aucun nouveau paiement. Accepté
  comme limitation connue de cette première version ; une facturation à l'usage post-publication
  nécessiterait un nouveau modèle de tarification, hors périmètre ici.
- **`TournamentsController.publish` change de contrat de retour** : au lieu de toujours renvoyer le
  `TournamentDetail` mis à jour, il peut désormais renvoyer `{ status: 'PENDING_PAYMENT',
  checkoutUrl }` si un paiement est requis — le front (`tournament-form.page.ts`) doit distinguer
  les deux formes, comme le fait déjà `register.page.ts` côté inscription joueur.
- **Nouvelle page de confirmation** côté admin (`.../publish/success`) sur le modèle de
  `register-success.page.ts` : sondage de l'état du tournoi (jusqu'à ce qu'il passe à `PUBLISHED`)
  plutôt que lecture directe de `session_id`, cohérent avec le choix déjà fait côté inscription de
  ne pas faire confiance à la redirection navigateur mais au webhook confirmé côté serveur.
- **`TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS`/`TOURNAMENT_PUBLICATION_FEE_PER_TEAM_CENTS`
  restent à `0` par défaut** — aucune organisation ne sera facturée tant que le porteur de projet
  n'aura pas explicitement fixé ces montants en production (`.env`), cohérent avec la position déjà
  prise sur `STRIPE_SECRET_KEY`.

## Réversibilité

Le calcul de prix et le modèle `TournamentPublicationOrder` sont confinés à
`TournamentsService`/`TournamentPublicationOrder` — ils n'affectent ni `Registration`, ni
`PlayerAccount`, ni le flux d'inscription joueur existant (ADR 0005). Revenir à une publication
gratuite reviendrait à court-circuiter uniquement l'étape de calcul de prix dans
`TournamentsService.publish`, sans toucher au reste du modèle `Tournament`.
