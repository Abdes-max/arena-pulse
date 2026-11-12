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

| Tableau           | Équipes | Étapes observées         | Match de classement            |
| ----------------- | ------- | ------------------------ | ------------------------------ |
| Champions League  | 8       | Quarts → Demies → Finale | Oui : petite finale (3e place) |
| Europa League     | 8       | Quarts → Demies → Finale | Non observé                    |
| Conférence League | 4       | Demies → Finale          | Non observé                    |

→ Le format (nombre de tours, présence ou non d'un match de classement) est **configurable par tableau**, pas uniforme pour tout le tournoi. C'est une contrainte de conception importante pour le modèle de données (`docs/architecture/data-model.md`).

- **CONFIRMÉ (admin, écran "Classement"/structure)** : l'organisateur construit la compétition phase par phase depuis un éditeur dédié : chaque poule dispose de boutons "+POULE" (ajouter une poule), "+BRACKET" (ajouter un tableau à élimination directe alimenté par les positions de sortie d'une phase précédente, taille annoncée "5 jusqu'à 8" équipes), et "+MATCH AMICAL" (ajouter un match hors classement). Chaque bracket individuel propose un bouton "+MATCH" pour ajouter un match de classement (ex. petite finale) à la volée.
- **CONFIRMÉ** : le bouton "AJOUTER UNE PHASE" porte l'aide contextuelle suivante : _"Ajoutez une phase supplémentaire si vous souhaitez affecter des équipes en fonction de leurs performances dans la ou les phases précédentes"_ — confirme explicitement que `QualificationRule` doit lier une position de sortie de phase à une phase suivante, comme modélisé dans `data-model.md`.

## Validation des poules et tirage de la phase finale

- La phase finale n'est **jamais tirée automatiquement** : l'organisateur clique sur « Valider les scores des phases de poules » une fois tous les matchs de poule terminés (joués, forfait ou annulés). Le tirage se fait à ce moment-là.
- Tant que les poules ne sont pas validées, aucun score, forfait ou effacement n'est possible sur un match de phase finale, et le tableau n'affiche que les libellés (« 1er Poule A »).
- Une fois validées, les poules sont verrouillées. « Modifier les scores » les rouvre : la phase finale revient aux libellés, et les scores déjà saisis en phase finale sont effacés après confirmation. La revalidation refait le tirage.
- Les affiches du premier tour suivent par défaut le schéma standard (1er de la liste contre le dernier). L'organisateur peut les choisir lui-même (« 1er Poule A » contre « 2e Poule B »…) tant qu'aucun match du tableau n'a de score ; changer la taille du tableau revient à l'appariement automatique.

## Calendrier : déplacer un match ou un créneau

- Un match (avec son créneau) ou un créneau libre peut être placé à n'importe quelle position de n'importe quel terrain, quelle que soit sa phase.
- Les créneaux qui suivent sur le terrain d'arrivée sont décalés de la durée du créneau déplacé ; sur le terrain quitté, ceux qui suivaient sont avancés d'autant. Les autres écarts (pause entre deux phases) sont conservés.
- Le déplacement est refusé en entier si une équipe se retrouvait sur deux matchs qui se chevauchent, sur n'importe quel terrain et dans n'importe quelle phase ; le message nomme l'équipe.
- Un créneau ajouté prend une durée (et un libellé facultatif) et se place à la suite du dernier créneau du terrain.

## Pré-inscriptions

- Pas de paiement en ligne : l'organisateur affiche un tarif indicatif par catégorie et des modalités de paiement (sur place, virement…), encaisse lui-même et coche chaque inscription payée, non payée ou dispensée.
- Sport collectif : un capitaine inscrit son équipe et ses joueurs. Sport individuel (tennis, badminton) : chaque joueur s'inscrit à son nom. Le padel se joue en paires et compte comme collectif.
- Chaque demande est validée à la main par l'organisateur (confirmer, refuser avec motif, mettre en liste d'attente). L'équipe n'apparaît dans le tournoi qu'une fois confirmée.
- Places limitées par catégorie : au-delà, les demandes vont en liste d'attente ; une catégorie complète refuse la confirmation.
- Le joueur peut annuler sa demande tant qu'elle n'est pas confirmée (« Mes inscriptions »).

## Classement final global

- Ordonné d'abord par **valeur du tableau atteint** (Champions League > Europa League > Conférence League), puis par **performance dans ce tableau** (Vainqueur > Finaliste > 3e/4e > Demi-finaliste éliminé > Quart de finaliste éliminé, etc.).
- Le classement final n'est donc pas un simple cumul de points : c'est une fonction déterministe de "quel tableau" + "quelle étape de sortie" pour chaque équipe.

## Matchs et scores

- Chaque carte de match affiche un code couleur : vert (victoire), rouge (défaite), orange (nul) — observé cohérent sur toutes les cartes de l'écran calendrier.
- **CONFIRMÉ (admin, écran "Scores")** : la saisie de score se fait par un champ texte inline "X - Y" directement dans une liste de matchs groupés par créneau horaire (tous terrains confondus), avec un indicateur de progression global par phase (ex. "40/40" scores saisis en Phase 1, "18/18" en Phase 2). Pas de distinction visible entre score "provisoire" et "validé" dans cette vue — à confirmer si une telle distinction existe ailleurs (**question ouverte maintenue, portée réduite**).
- Aucune donnée observée sur les forfaits/pénalités dans l'admin lors de cet audit (fonctionnalité potentiellement accessible depuis l'écran match lui-même, non ouvert pour rester dans un périmètre d'audit raisonnable) — reste **A_CONFIRMER**.

## Scores par sets (padel, tennis, volleyball, badminton)

Décision TournArena, inspirée de Tournify (« Scoring and tiebreakers ») : chaque sport a un format de score, `GOALS` (un score par équipe, football et autres) ou `SETS` (détail set par set).

- **Sports concernés** : Padel, Tennis, Badminton (2 sets gagnants par défaut), Volleyball (3 sets gagnants). Les autres sports restent en `GOALS`.
- **Nombre de sets gagnants** : défaut du sport, modifiable par phase (`setsToWin`, ex. 2 en poule et 3 en finale). Nombre maximal de sets : 2 × sets gagnants − 1.
- **Saisie** : un set par ligne (domicile / extérieur), au clavier ou par le composant `ap-sets-input`. En direct, la saisie est tolérante (personne n'a encore atteint le nombre de sets gagnants, dernier set possiblement à égalité). À la validation : un set ne peut pas finir à égalité, une équipe atteint exactement le nombre de sets gagnants, aucun set n'est joué après.
- **Source de vérité** : `homeScore` / `awayScore` valent le nombre de sets gagnés, recalculé côté serveur à partir de `sets` (les valeurs envoyées sont ignorées). Vainqueur, avancement du tableau, Glicko, récap et classement final lisent donc ces valeurs sans changement.
- **Pas de nul, pas de tirs au but** en format `SETS`. Le format `GOALS` refuse `sets`.
- **Barème du set décisif** (règle de classement) : `decidingSetWinPoints` / `decidingSetLossPoints`. Un match qui va au set décisif (le perdant a gagné nombre de sets gagnants − 1 sets) rapporte ces points au lieu du barème normal victoire/défaite. Défaut volleyball : 3-2 → 2 points au vainqueur, 1 au perdant.
- **Classement de poule** : colonnes Sets +, Sets −, Diff. sets et Diff. jeux (tennis, padel) ou Diff. points (volleyball, badminton). Nouveaux critères `SET_DIFFERENCE`, `GAME_DIFFERENCE`, `SETS_WON` ; ordre par défaut en sets : points, confrontation directe, différence de sets, différence de jeux ou points.
- **Affichage** : « 6-4 3-6 10-7 » sous le score en sets (cartes de match, programme, détail équipe, écran TV). Wrapped : libellés en sets, sans nuls ni tirs au but.
- **Padel** : le 3e set est un super tie-break à 10 points (ex. 10-7).
- Écarts connus : le tableau à élimination directe n'affiche que les sets gagnés, et les cartes « plus gros scores » du Wrapped aussi.

## Planification du calendrier (admin)

- **CONFIRMÉ** : le calendrier admin est organisé en colonnes par terrain (ex. "Pelouse 1", "Synthétique 2"), chacune affichant une chronologie unique de créneaux (matchs de poule ET de phase finale mélangés chronologiquement sur le même terrain).
- **CONFIRMÉ** : un panneau latéral "Planifier" permet une génération assistée : sélection des poules/brackets à placer, sélection des tours, sélection des terrains, avec un compteur de progression (ex. "0/56 PLANIFIER") et un bouton "VIDER LE SCHÉMA" pour tout réinitialiser.
- **CONFIRMÉ** : un second onglet du panneau latéral gère les arbitres, avec un réglage du nombre d'arbitres par match (ex. "Quatre arbitres par match" observé) et un état vide "Pas encore d'arbitres. Ajoutez votre premier arbitre."
- **CONFIRMÉ** : des créneaux de pause ("Pause", ex. 50 minutes) sont insérables dans le calendrier de chaque terrain, ainsi que des "ÉVÉNEMENT" génériques (nature exacte non testée).
- **CONFIRMÉ** : des créneaux vides sont affichés explicitement avec un bouton "Vider" — un créneau planifié peut donc exister sans match assigné (slot réservé mais libre), plutôt que l'absence de ligne.
- **CONFIRMÉ** : les équipes peuvent elles-mêmes être désignées comme arbitres d'autres matchs via un réglage dédié ("Équipes en qualité d'arbitres").

## Permissions administrateur (admin)

- **CONFIRMÉ (Participants > Administrateurs)** : Tournify n'utilise pas des rôles nommés fixes mais une matrice de permissions granulaires cochées individuellement par administrateur : Gestion générale, Gérer les participants, Gérer la mise en page, Gérer le calendrier, Gérer la présentation, Gérer un site internet public, Gérer le diaporama, Gérer la conception, Gérer les scores, Gérer l'avancement des phases. Voir `roles-and-permissions.md` pour la reprise complète et la décision de modélisation associée.

## Mode assistance (super-admin)

- Le super-admin peut entrer dans l'admin de n'importe quel tournoi pour y faire les mêmes actions que l'organisateur ; il agit en tant que premier administrateur de l'organisation (le plus ancien).
- La session dure 2 h au plus, n'est jamais prolongée et ne vaut que pour l'onglet ouvert ; elle survit à un rechargement de cet onglet. « Quitter l'assistance » ou une connexion normale y met fin.
- Chaque entrée est inscrite au journal du super-admin (tournoi et compte utilisé). La suppression du compte de l'organisateur est refusée pendant l'assistance.

## Hors périmètre observable dans cette itération

Les règles suivantes n'ont pas pu être confirmées (non ouvertes lors de cet audit pour rester dans un périmètre raisonnable, ou nécessitant un tournoi en cours) :

- Détail exact des forfaits et pénalités (écran de saisie de match non ouvert).
- Distinction score provisoire / validé.
- Règles de repos minimal entre deux matchs d'une même équipe (non visible dans le panneau "Planifier" au niveau observé).
- Mécanique exacte du temps réel (WebSocket/SSE/polling).
