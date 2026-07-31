# Hypothèses et questions ouvertes

Mis à jour après l'audit du site public **et** de l'administration de référence (connexion autorisée du porteur de projet, lecture seule, aucune donnée modifiée).

## Questions résolues par l'audit admin

- ~~Séparation réelle des rôles~~ → **Résolu** : Tournify n'a pas de rôles nommés fixes, mais une matrice de 10 permissions booléennes par administrateur. Voir `roles-and-permissions.md`.
- ~~Critères de départage en cas d'égalité~~ → **Résolu** : configurables et réordonnables (points, différence de buts, buts marqués, confrontation directe), plus un classement additionnel optionnel type fair-play. Voir `business-rules.md`.
- ~~Mécanique de qualification entre phases~~ → **Résolu** : confirmée explicitement via le bouton "AJOUTER UNE PHASE" et son aide contextuelle sur l'admin.
- ~~Génération de calendrier~~ → **Résolu (partiellement)** : un panneau "Planifier" assisté existe (sélection poules/tours/terrains) ; le glisser-déposer manuel reste à confirmer plus précisément (icônes d'action par ligne observées, mais pas de drag testé explicitement).

## Questions encore bloquantes ou à approfondir

1. **Dashboard multi-tournois et création de tournoi** : l'audit est entré directement dans un tournoi existant via lien fourni ; l'écran de connexion, le tableau de bord multi-tournois, et le formulaire de création d'un nouveau tournoi n'ont pas été observés. Impacte `data-model.md` (champs exacts de `Tournament` à la création) et `user-journeys.md` (parcours A1).
2. **Portée fine d'une permission** : "Gérer les scores" donne-t-il accès à tous les matchs du tournoi ou peut-il être restreint à un terrain/une poule pour un arbitre ? Non observable avec un seul administrateur disposant de toutes les permissions sur le tournoi de référence.
3. **Distinction score provisoire / validé** : non visible sur l'écran "Scores" observé (simple champ éditable par match) — à confirmer si un mécanisme de validation existe ailleurs (ex. sur un écran de détail de match non ouvert).
4. **Détail des forfaits, pénalités et tirs au but** : configuration en amont confirmée (écran Général), mais l'écran de saisie effective (probablement une fiche de détail de match) n'a pas été ouvert pour rester dans un périmètre d'audit raisonnable.
5. **Mécanique exacte du temps réel** (WebSocket vs SSE vs polling, fréquence, reconnexion) : non observable sans tournoi en cours au moment de l'audit. Impacte `docs/architecture/realtime-strategy.md` (à produire lors d'une PR ultérieure).
6. **Comportement du bouton Favori / de la cloche de notification côté public** (persistance par cookie, compte, ou uniquement par appareil) : boutons identifiés mais non activés lors de cet audit pour rester non intrusif sur le tournoi de référence.
7. **Import d'équipes** : un export a été confirmé sur l'écran "Participants > Équipes", mais aucun bouton d'import n'a été repéré à cet endroit précis — à revérifier avant de considérer cette fonctionnalité absente de la référence (pourrait être ailleurs, ex. à la création du tournoi).

## Hypothèses de travail (non bloquantes, à valider en continu)

| Hypothèse | Statut | Impact si invalidée |
| --- | --- | --- |
| Barème de points par défaut 3/1/0 (victoire/nul/défaite) | Confirmé configurable, valeur par défaut du tournoi de référence non vérifiée chiffre par chiffre dans l'UI (déduit des totaux) | Faible — reste configurable dans le modèle |
| Modèle de permissions granulaires (plutôt que rôles fermés) | **Confirmé par l'audit admin** | N/A — décision alignée avec la référence |
| Existence de "matchs de consolation" côté Tournify | Non observée dans le jeu de données actuel ; le bouton "+MATCH AMICAL" pourrait couvrir un besoin proche mais distinct | Moyen — le modèle prévoit déjà ce cas (§30), donc pas de blocage réel |
| Rendu mobile/tablette du site public de référence | Non vérifiable de façon fiable avec les outils d'automatisation disponibles lors de cet audit | Faible — à revérifier manuellement avant de figer les guidelines responsive |
| Le mode "diaporama" est un affichage plein écran type "vidéoprojecteur de gymnase" | Onglet de configuration confirmé côté admin ("Diaporama"), contenu non ouvert côté public ni admin | Faible — fonctionnalité P2, peut être affinée plus tard |
| Arbitres/responsables d'équipe n'ont pas de compte de connexion admin propre | Déduit de la séparation "Équipes"/"Arbitres" vs "Administrateurs" dans l'UI, non testé positivement | Moyen — impacte le modèle `Referee`/`TeamMember` s'ils s'avèrent être aussi des `User` authentifiables |

## Décisions proposées sans attente de validation (raisonnables, standards, réversibles)

Conformément à la mission (§4), les décisions suivantes sont considérées comme suffisamment standards pour être prises sans bloquer l'avancement, mais restent documentées et modifiables :
- Architecture monorepo (apps/libs/infra/docs).
- Modèle de permissions granulaires par tournoi (`TournamentAdministrator` ↔ `Permission[]`), désormais aligné sur un comportement confirmé de la référence plutôt qu'une simple hypothèse.
- Utilisation d'identifiants non prédictibles (UUID) pour toutes les entités.
- PostgreSQL + Flyway pour la persistance et les migrations.

## Décisions qui attendront une validation explicite avant implémentation

- Choix final de la direction artistique (Arena Pulse ou alternative) — PR `design/002-brand-and-design-system`, non fusionnée avant choix.
- Préréglages de permissions ("rôles" proposés à la création d'un administrateur) — amélioration ergonomique proposée, pas observée dans la référence, à valider avant implémentation.
- Stratégie technique définitive du temps réel (WebSocket vs SSE) — dépend de contraintes d'hébergement non encore discutées.
- Choix Keycloak vs authentification "maison" via `@nestjs/passport`/`passport-jwt` (mission §27 : "Keycloak peut être utilisé si son intégration est justifiée" — backend désormais NestJS, cf. `docs/architecture/adr/0002-backend-nestjs-instead-of-spring-boot.md`).
- **Prestataire de paiement pour `feat/025-player-registration-and-payments`** — aucune intégration de paiement n'existe dans le repo à ce jour. Implique un choix de prestataire (Stripe le plus probable vu l'écosystème NestJS), un modèle de comptes joueurs publics (distincts des `User` organisateurs actuels), et des questions de conformité (PCI) à trancher avant implémentation.
- **Algorithme de rating pour `feat/026-rating-system`** (ELO, Glicko, ou variante) et son articulation avec le classement par points déjà confirmé aligné sur la référence auditée (`business-rules.md`) — à traiter comme un complément affiché en plus du classement existant, pas un remplacement, sauf décision contraire explicite.
- **Fournisseur et garde-fous pour `feat/027-ai-assistant`** — choix du fournisseur LLM, gestion de la clé API/coûts, et périmètre des actions que l'assistant peut effectuer (lecture seule vs création/modification de données) à définir avant implémentation.
