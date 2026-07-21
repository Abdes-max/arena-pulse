# Règles métier observées

Toutes les règles ci-dessous sont issues du tournoi de référence "U10 Milloise Cup" (football, 20 équipes, 4 poules de 5). Elles doivent être traitées comme des **exemples de configuration**, pas comme des règles figées : le modèle doit les rendre configurables (§30 de la mission).

## Structure de compétition

- Le tournoi est composé d'une **phase de poules** suivie d'une **phase finale à élimination directe**.
- Phase de poules : 4 poules (A-D) de 5 équipes, format championnat aller-simple (chaque équipe joue les 4 autres une fois = 4 matchs de poule/équipe).
- Durée de match observée : 15 minutes côté texte éditorial public ; l'admin confirme un cadencement réel de 22 minutes par créneau en phase de poules (15 min de match + temps de battement), et une durée différente en phase finale (24 puis 22 minutes observées sur le calendrier) — **CONFIRMÉ** : la durée de créneau est configurable indépendamment par phase, via le bouton "DURÉE DU MATCH" de l'écran Calendrier admin.
- **CONFIRMÉ (admin)** : un tournoi peut être marqué "en ligne (eSport)" via une case à cocher dans Général — un même modèle couvre donc sport traditionnel et esport, cf. mission §12.

## Classement de poule

- Colonnes observées : J (joué), G (gagné), N (nul), P (perdu), PTS (points), PP (buts pour), PC (buts contre), +/- (différence de buts).
- **CONFIRMÉ (admin, "Général" > "Comptage de points")** : le nombre de points attribués en cas de victoire/nul/défaite est explicitement configurable (champs numériques dédiés), et non figé à 3/1/0 — le tournoi de référence utilise vraisemblablement 3/1/0 mais ce n'est pas une constante du produit.
- **CONFIRMÉ (admin)** : l'ordre des critères de départage en cas d'égalité de points est explicitement configurable via "MODIFIER LES CRITÈRES", avec au minimum les critères suivants observés, dans un ordre modifiable : **Nombre de points → Différence de buts → Nombre de buts marqués → Résultat respectif (confrontation directe)**. Ceci lève l'ancienne question ouverte sur les critères de départage.
- **CONFIRMÉ (admin)** : possibilité de configurer un classement additionnel indépendant ("Enregistrer plus de points") pour un critère externe au match, ex. fair-play ou pénalité — répond à la demande mission §30 sur le fair-play.
- **CONFIRMÉ (admin)** : possibilité de configurer les tirs au but pour les matchs à élimination directe terminés sur un nul ("Entrez les scores de la séance de tirs au but pour les matchs qui se sont terminés par un match nul").
- **CONFIRMÉ (admin)** : suivi optionnel de statistiques de joueurs individuels (buteurs, gardiens, statistiques personnalisées), si des joueurs ont été ajoutés aux équipes.

## Qualification vers la phase finale

- 1er et 2e de chaque poule (8 équipes) → tableau **"Champions League"**.
- 3e et 4e de chaque poule (8 équipes) → tableau **"Europa League"**.
- 5e de chaque poule (4 équipes) → tableau **"Conférence League"**.
- Règle explicitement annoncée dans le texte d'accueil du tournoi (donnée éditoriale), et confirmée par recoupement avec les brackets réels observés dans `standings`.

## Format de la phase finale (par tableau)

| Tableau | Équipes | Étapes observées | Match de classement |
| --- | --- | --- | --- |
| Champions League | 8 | Quarts → Demies → Finale | Oui : petite finale (3e place) |
| Europa League | 8 | Quarts → Demies → Finale | Non observé |
| Conférence League | 4 | Demies → Finale | Non observé |

→ Le format (nombre de tours, présence ou non d'un match de classement) est **configurable par tableau**, pas uniforme pour tout le tournoi. C'est une contrainte de conception importante pour le modèle de données (`docs/architecture/data-model.md`).

- **CONFIRMÉ (admin, écran "Classement"/structure)** : l'organisateur construit la compétition phase par phase depuis un éditeur dédié : chaque poule dispose de boutons "+POULE" (ajouter une poule), "+BRACKET" (ajouter un tableau à élimination directe alimenté par les positions de sortie d'une phase précédente, taille annoncée "5 jusqu'à 8" équipes), et "+MATCH AMICAL" (ajouter un match hors classement). Chaque bracket individuel propose un bouton "+MATCH" pour ajouter un match de classement (ex. petite finale) à la volée.
- **CONFIRMÉ** : le bouton "AJOUTER UNE PHASE" porte l'aide contextuelle suivante : *"Ajoutez une phase supplémentaire si vous souhaitez affecter des équipes en fonction de leurs performances dans la ou les phases précédentes"* — confirme explicitement que `QualificationRule` doit lier une position de sortie de phase à une phase suivante, comme modélisé dans `data-model.md`.

## Classement final global

- Ordonné d'abord par **valeur du tableau atteint** (Champions League > Europa League > Conférence League), puis par **performance dans ce tableau** (Vainqueur > Finaliste > 3e/4e > Demi-finaliste éliminé > Quart de finaliste éliminé, etc.).
- Le classement final n'est donc pas un simple cumul de points : c'est une fonction déterministe de "quel tableau" + "quelle étape de sortie" pour chaque équipe.

## Matchs et scores

- Chaque carte de match affiche un code couleur : vert (victoire), rouge (défaite), orange (nul) — observé cohérent sur toutes les cartes de l'écran calendrier.
- **CONFIRMÉ (admin, écran "Scores")** : la saisie de score se fait par un champ texte inline "X - Y" directement dans une liste de matchs groupés par créneau horaire (tous terrains confondus), avec un indicateur de progression global par phase (ex. "40/40" scores saisis en Phase 1, "18/18" en Phase 2). Pas de distinction visible entre score "provisoire" et "validé" dans cette vue — à confirmer si une telle distinction existe ailleurs (**question ouverte maintenue, portée réduite**).
- Aucune donnée observée sur les forfaits/pénalités dans l'admin lors de cet audit (fonctionnalité potentiellement accessible depuis l'écran match lui-même, non ouvert pour rester dans un périmètre d'audit raisonnable) — reste **A_CONFIRMER**.

## Planification du calendrier (admin)

- **CONFIRMÉ** : le calendrier admin est organisé en colonnes par terrain (ex. "Pelouse 1", "Synthétique 2"), chacune affichant une chronologie unique de créneaux (matchs de poule ET de phase finale mélangés chronologiquement sur le même terrain).
- **CONFIRMÉ** : un panneau latéral "Planifier" permet une génération assistée : sélection des poules/brackets à placer, sélection des tours, sélection des terrains, avec un compteur de progression (ex. "0/56 PLANIFIER") et un bouton "VIDER LE SCHÉMA" pour tout réinitialiser.
- **CONFIRMÉ** : un second onglet du panneau latéral gère les arbitres, avec un réglage du nombre d'arbitres par match (ex. "Quatre arbitres par match" observé) et un état vide "Pas encore d'arbitres. Ajoutez votre premier arbitre."
- **CONFIRMÉ** : des créneaux de pause ("Pause", ex. 50 minutes) sont insérables dans le calendrier de chaque terrain, ainsi que des "ÉVÉNEMENT" génériques (nature exacte non testée).
- **CONFIRMÉ** : des créneaux vides sont affichés explicitement avec un bouton "Vider" — un créneau planifié peut donc exister sans match assigné (slot réservé mais libre), plutôt que l'absence de ligne.
- **CONFIRMÉ** : les équipes peuvent elles-mêmes être désignées comme arbitres d'autres matchs via un réglage dédié ("Équipes en qualité d'arbitres").

## Permissions administrateur (admin)

- **CONFIRMÉ (Participants > Administrateurs)** : Tournify n'utilise pas des rôles nommés fixes mais une matrice de permissions granulaires cochées individuellement par administrateur : Gestion générale, Gérer les participants, Gérer la mise en page, Gérer le calendrier, Gérer la présentation, Gérer un site internet public, Gérer le diaporama, Gérer la conception, Gérer les scores, Gérer l'avancement des phases. Voir `roles-and-permissions.md` pour la reprise complète et la décision de modélisation associée.

## Hors périmètre observable dans cette itération

Les règles suivantes n'ont pas pu être confirmées (non ouvertes lors de cet audit pour rester dans un périmètre raisonnable, ou nécessitant un tournoi en cours) :
- Détail exact des forfaits et pénalités (écran de saisie de match non ouvert).
- Distinction score provisoire / validé.
- Règles de repos minimal entre deux matchs d'une même équipe (non visible dans le panneau "Planifier" au niveau observé).
- Mécanique exacte du temps réel (WebSocket/SSE/polling).
