# Découpage des Pull Requests

Confirmation du découpage proposé par la mission (§38), sans modification à ce stade — l'audit du site public n'a pas révélé de raison de le réviser. Il sera réévalué après l'audit de l'administration (une PR intermédiaire pourrait s'avérer nécessaire, par ex. pour un "centre de gestion du direct" si celui-ci s'avère plus complexe que prévu).

| # | Branche | Contenu |
| - | --- | --- |
| 1 | `docs/001-functional-audit` | Cette PR : audit fonctionnel, inventaire, matrice de parité, architecture et modèle de données initiaux |
| 2 | `design/002-brand-and-design-system` | 3 directions artistiques, fondations de marque, design tokens, premiers composants — **non fusionnée avant choix explicite** |
| 3 | `feat/003-project-foundation` | Squelette monorepo, CI de base, conventions |
| 4 | `feat/004-design-system-foundation` | Implémentation du design system choisi |
| 5 | `feat/005-local-infrastructure` | Docker Compose local (PostgreSQL, backend, web, stockage, mailcatcher) |
| 6 | `feat/006-authentication-organizations` | Auth, organisations, collaborateurs |
| 7 | `feat/007-tournament-management` | CRUD tournoi, duplication, archivage |
| 8 | `feat/008-teams-and-participants` | Équipes, joueurs, import/export |
| 9 | `feat/009-fields-and-referees` | Sites, terrains, créneaux, arbitres |
| 10 | `feat/010-competition-formats` | Poules, phases finales, règles de qualification/classement |
| 11 | `feat/011-schedule-generation` | Génération automatique du calendrier |
| 12 | `feat/012-schedule-editor` | Édition manuelle, glisser-déposer, conflits |
| 13 | `feat/013-scorekeeping` | Saisie/correction/validation des scores, forfaits, pénalités |
| 14 | `feat/014-standings-and-qualification` | Recalcul automatique classements/qualifications |
| 15 | `feat/015-public-tournament-web` | Site public complet |
| 16 | `feat/016-realtime-updates` | Temps réel (WebSocket/SSE) |
| 17 | `feat/017-mobile-foundation` | Socle Ionic/Capacitor |
| 18 | `feat/018-team-following` | Favoris, suivi d'équipe mobile |
| 19 | `feat/019-mobile-notifications` | Notifications push |
| 20 | `feat/020-offline-mode` | Mode hors connexion |
| 21 | `feat/021-security-hardening` | Durcissement sécurité |
| 22 | `feat/022-accessibility-hardening` | Durcissement accessibilité |
| 23 | `feat/023-observability` | Observabilité |
| 24 | `feat/024-deployment` | Déploiement |

**Point d'attention identifié lors de cet audit** : l'admin n'étant pas encore analysée, le contenu exact de `feat/012-schedule-editor` (vue par terrain/équipe/poule, historique, undo/redo) et `feat/013-scorekeeping` (centre de gestion du direct) pourra nécessiter un début de scission une fois l'audit admin réalisé, si la complexité observée le justifie. Ce sera réévalué dans la prochaine mise à jour de ce document.
