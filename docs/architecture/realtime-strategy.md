# Stratégie temps réel

Tranche le point resté ouvert depuis l'audit initial
(`docs/product/assumptions-and-open-questions.md`, `docs/architecture/architecture-overview.md`)
sur le choix WebSocket vs Server-Sent Events (SSE) pour les mises à jour en
temps réel, implémenté dans `feat/016-realtime-updates`.

## Décision : Server-Sent Events (SSE), pas WebSocket

Le besoin réel — le site public reçoit des mises à jour de match, il n'en
envoie jamais — est strictement unidirectionnel (serveur → client). SSE
couvre exactement ce besoin :

- `EventSource` est natif aux navigateurs, aucune dépendance client
  supplémentaire (contrairement à `socket.io-client`).
- Reconnexion automatique avec backoff intégrée à `EventSource`, pas de
  logique de reconnexion à écrire côté client.
- Fonctionne sur HTTP/1.1 simple, sans upgrade de connexion ni
  configuration de proxy particulière.
- NestJS l'expose nativement via le décorateur `@Sse()`
  (`apps/api/src/tournaments/public.controller.ts`), sans nouvelle
  dépendance côté serveur non plus.

Un WebSocket (Socket.IO via `@nestjs/websockets`) n'apporterait rien ici
puisqu'aucun message client→serveur n'est nécessaire, et ajouterait de la
complexité pour scaler à plusieurs instances (sessions collantes ou
adaptateur Redis).

**Portée** : le site public uniquement. La collaboration temps réel côté
admin-web (plusieurs organisateurs sur le même écran) n'a jamais été
demandée ni auditée côté référence — hors scope.

## Format des événements

Un seul type d'événement pour l'instant : `match-updated`
(`apps/api/src/tournaments/realtime.service.ts`), délibérément minimal —
`{ type: 'match-updated', matchId: string }`, **jamais** le payload complet
du match. Le client reçoit le signal, puis rappelle l'endpoint REST public
qu'il utilise déjà (`GET :slug/phases/:phaseId/matches`,
`GET :slug/knockout-brackets/:bracketId/matches`, etc.) pour obtenir les
données à jour. Ça évite de dupliquer la sérialisation déjà faite par ces
endpoints dans un second format, et garde une seule source de vérité pour
la forme des données.

Émis par : `ScoresService` (saisie/validation/effacement de score, forfait,
annulation de forfait) et `BracketsService.tryAdvanceRound` (nouveaux
matchs de tour suivant).

## Endpoint

`GET /api/v1/public/tournaments/:slug/events` — flux SSE, public (comme le
reste de `PublicController`), un flux par tournoi. Le client (`public-web`,
`TournamentContextService`) ouvre la connexion une fois le tournoi chargé,
et la ferme au changement de tournoi ou à la destruction du composant.

Les événements reçus sont regroupés côté client avec un court debounce
(300 ms) avant de déclencher un rafraîchissement, pour absorber les rafales
(plusieurs scores saisis coup sur coup par un arbitre).

## Limite connue : une seule instance API

Le `RealtimeService` est un simple `Subject` RxJS en mémoire — il ne
fonctionne correctement que si l'API tourne en une seule instance. Si l'API
est un jour déployée sur plusieurs instances (scaling horizontal), les
clients connectés à une instance ne recevront pas les événements émis sur
une autre. La piste dans ce cas : un bus pub/sub distribué (Redis pub/sub
est l'option la plus simple à intégrer à NestJS) partagé entre instances.
Non implémenté maintenant — prématuré tant qu'une seule instance suffit.
