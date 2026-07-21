# Rôles et permissions

## Rôles confirmés par observation

| Rôle | Statut | Observation |
| --- | --- | --- |
| Visiteur public | CONFIRMÉ | Accède à toutes les pages testées (`/live/:slug`, `/team`, `/standings`, `/schedule`) sans authentification. |
| Administrateur de tournoi | CONFIRMÉ | Écran "Participants > Administrateurs" de `manage.tournifyapp.com` : liste d'administrateurs, chacun avec une matrice de permissions cochées individuellement (voir ci-dessous). Un seul compte administrateur observé sur le tournoi de référence (adresse e-mail non reproduite ici par précaution vie privée). |

## Modèle de permissions confirmé (admin Tournify)

Tournify **n'utilise pas de rôles nommés fixes** (type "organisateur", "arbitre"...) au niveau de l'écran Administrateurs, mais une **matrice de permissions booléennes indépendantes**, activables individuellement par administrateur et par tournoi :

| Permission observée | Interprétation |
| --- | --- |
| Gestion générale | Paramètres généraux du tournoi (nom, dates, lieux, divisions) |
| Gérer les participants | Équipes, joueurs, arbitres |
| Gérer la mise en page | Mise en page/apparence du site public |
| Gérer le calendrier | Génération et édition du planning des matchs |
| Gérer la présentation | Pages publiques affichées, réglages de partage |
| Gérer un site internet public | Publication/dépublication, configuration du site public |
| Gérer le diaporama | Configuration du mode diaporama plein écran |
| Gérer la conception | Personnalisation visuelle/design du tournoi |
| Gérer les scores | Saisie et correction des scores |
| Gérer l'avancement des phases | Structure des phases/poules/brackets, qualifications |

Chaque permission est un toggle indépendant (observé : toutes activées = coche verte pour l'unique administrateur du tournoi de référence). Il n'a pas été possible d'observer un cas avec permissions partielles (un seul administrateur présent sur ce tournoi) — **hypothèse restante** : on ne sait pas si Tournify propose des préréglages ("rôle arbitre" = telle combinaison de permissions) au moment de l'ajout d'un administrateur, ou si chaque case est cochée manuellement à chaque fois.

Par ailleurs, les **arbitres** et les **équipes** apparaissent comme des entités séparées des "administrateurs" (onglets distincts "Arbitres" / "Équipes" / "Administrateurs" dans la même section "Participants") : rien n'indique qu'un arbitre ou un responsable d'équipe dispose d'un compte de connexion à l'admin dans le tournoi de référence — leur accès potentiel (via lien dédié ou compte limité) reste **NON_ANALYSE**.

## Décision de conception pour Arena Pulse

Cette observation confirme et affine le modèle proposé initialement (`docs/architecture/data-model.md`) : plutôt que des rôles fermés, Arena Pulse adoptera un modèle **`TournamentAdministrator` ↔ `Permission[]`** directement inspiré de ce qui est confirmé ici, avec :
- Des **rôles globaux** simples au niveau `Organization` (`ORG_ADMIN`, `ORG_MEMBER`) pour la gestion des collaborateurs et des tournois.
- Des **permissions granulaires par tournoi**, reprenant une liste équivalente à celle observée (gestion générale, participants, calendrier, scores, présentation/site public, phases/qualifications), avec la possibilité d'ajouter des permissions futures sans casser le modèle (table `Permission` + table de jointure, pas un enum figé).
- Des **préréglages de permissions** (ex. "Arbitre" = uniquement "Gérer les scores" sur les matchs assignés) proposés à la création d'un administrateur, comme amélioration ergonomique par rapport à la référence (qui semble nécessiter de cocher chaque case manuellement — cf. `opportunities.md`).

Cette décision est raisonnable et réversible (ajustable sans migration de schéma lourde) — elle n'attend pas de validation bloquante supplémentaire.

## Question ouverte restante

- Portée exacte de la permission par rapport à un sous-ensemble du tournoi (ex. "Gérer les scores" donne-t-il accès à tous les matchs, ou peut-on le restreindre à un terrain/une poule précise pour un arbitre ?) — non observable avec un seul administrateur disposant de toutes les permissions.
