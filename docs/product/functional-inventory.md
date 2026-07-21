# Inventaire fonctionnel

Source : analyse Chrome de `https://tournifyapp.com/live/u10milloisecup2026` (tournoi "U10 Milloise Cup", 20 équipes, 4 poules de 5).

Statut de chaque ligne :
- **CONFIRMÉ** : observé directement dans l'interface de référence.
- **HYPOTHÈSE** : requis par la mission (§5/§6) mais non observable sur ce jeu de données précis (ex. aucun match en direct au moment de l'audit) ou nécessitant l'accès admin.
- **NON_ANALYSE** : audit admin non réalisé à ce stade (en attente de connexion utilisateur).

## Site public

| # | Fonctionnalité | Statut | Détail |
| - | --- | --- | --- |
| 1 | Page d'accueil du tournoi (identité, dates, règles, lieu) | CONFIRMÉ | Onglet "TOURNOI", texte éditorial + encart lieu |
| 2 | Navigation par onglets (Tournoi / Mon équipe / Classements / Calendrier) | CONFIRMÉ | Barre de navigation persistante, sticky |
| 3 | Recherche d'une équipe | CONFIRMÉ | Barre "Trouver une équipe" + liste des 20 équipes, onglet "Mon équipe" |
| 4 | Fiche équipe (calendrier + classement contextualisés) | CONFIRMÉ | Sous-onglets "Calendrier" / "Classements" propres à l'équipe sélectionnée |
| 5 | Ajout d'une équipe en favori | CONFIRMÉ (bouton observé) | Bouton étoile "FAVORI" sur la fiche équipe ; effet de persistance non vérifié |
| 6 | Notification sur une équipe | CONFIRMÉ (icône observée) | Icône cloche à côté du bouton Favori ; comportement/contenu non testé |
| 7 | Classement de phase de poules (par poule) | CONFIRMÉ | Onglet "Classements" > "Phase 1", 4 tableaux (Poule A-D) avec J/G/N/P/PTS/PP/PC/+- |
| 8 | Tableaux à élimination directe (brackets) | CONFIRMÉ | Onglet "Classements" > "Phase 2", 3 brackets (Champions/Europa/Conférence League) |
| 9 | Classement final global | CONFIRMÉ | Onglet "Classements" > "Classement", classement 1-20 basé sur le résultat en phase finale |
| 10 | Calendrier / liste de tous les matchs | CONFIRMÉ | Onglet "Calendrier", grille de cartes match (poule, terrain, équipes, score) |
| 11 | Recherche dans le calendrier (équipe ou arbitre) | CONFIRMÉ | Barre "Trouver une équipe ou un arbitre" en tête du calendrier |
| 12 | Matchs en direct | HYPOTHÈSE | Aucun match "en direct" dans le jeu de données (tournoi entièrement joué) ; à confirmer sur un tournoi en cours |
| 13 | Rafraîchissement temps réel des scores | HYPOTHÈSE | Non vérifiable sans match en cours ; Tournify annonce du live, comportement exact (polling/websocket) non observable côté client |
| 14 | Partage d'un tournoi / d'un match | HYPOTHÈSE | Icône de partage observée sur le tableau "Classement" ; comportement (lien, réseaux sociaux) non testé |
| 15 | Mode diaporama plein écran | CONFIRMÉ (bouton observé) | Bouton "LANCEZ LE DIAPORAMA" présent sur toutes les pages ; probablement destiné à un affichage stade/gymnase. Contenu non testé (clic non déclenché pour rester non intrusif) |
| 16 | Sponsors | HYPOTHÈSE | Non présents sur ce tournoi de démonstration ; mentionnés dans la mission comme fonctionnalité de référence |
| 17 | Informations pratiques (lieu, horaires) | CONFIRMÉ | Encart "LIEU" + horaires dans le texte d'accueil |
| 18 | États de chargement | CONFIRMÉ | Squelettes gris observés sur l'onglet Classements lors du chargement |
| 19 | Accès sans compte | CONFIRMÉ | Toutes les pages testées sont accessibles sans authentification |
| 20 | QR code / lien direct | HYPOTHÈSE | URL slug lisible observée (`/live/u10milloisecup2026`), compatible avec un partage par lien ou QR code ; génération de QR non observée côté public |

## Administration

Audit réalisé après connexion autorisée du porteur de projet à `manage.tournifyapp.com` (lecture seule, aucune donnée modifiée). Détail écran par écran dans `screen-inventory.md` (section Administration), règles dans `business-rules.md`.

| # | Fonctionnalité | Statut | Détail |
| - | --- | --- | --- |
| 21 | Paramètres généraux du tournoi (nom, journées, lieux, divisions, langues) | CONFIRMÉ | Écran "Général" |
| 22 | Comptage de points configurable (barème victoire/nul/défaite) | CONFIRMÉ | Écran "Général" > "Comptage de points" |
| 23 | Critères de départage configurables et réordonnables | CONFIRMÉ | Idem, "MODIFIER LES CRITÈRES" |
| 24 | Classement additionnel (fair-play/pénalité) | CONFIRMÉ | "Enregistrer plus de points" |
| 25 | Suivi de statistiques joueurs individuels | CONFIRMÉ | "Suivre les statistiques des joueurs" |
| 26 | Gestion des équipes (liste, ajout, édition, export) | CONFIRMÉ | Écran "Participants > Équipes" |
| 27 | Import d'équipes | HYPOTHÈSE | Seul un export a été observé sur cet écran ; aucun bouton d'import visible |
| 28 | Ajout de joueurs par équipe | CONFIRMÉ (bouton observé) | Icône dédiée par ligne équipe |
| 29 | Gestion des arbitres | CONFIRMÉ (état vide observé) | Écran "Participants > Arbitres", aucun arbitre créé sur ce tournoi |
| 30 | Équipes pouvant arbitrer d'autres matchs | CONFIRMÉ | Toggle "Équipes en qualité d'arbitres" |
| 31 | Gestion des administrateurs et permissions | CONFIRMÉ | Écran "Participants > Administrateurs", matrice de 10 permissions |
| 32 | Construction du format de compétition (poules, brackets, qualifications en cascade) | CONFIRMÉ | Écran "Classement"/structure |
| 33 | Ajout d'un match de classement (petite finale) à la volée | CONFIRMÉ | Bouton "+MATCH" par tableau |
| 34 | Ajout de match amical hors classement | CONFIRMÉ | Bouton "+MATCH AMICAL" |
| 35 | Génération assistée du calendrier | CONFIRMÉ | Panneau "Planifier" (poules/brackets, tours, terrains) |
| 36 | Édition manuelle du calendrier (glisser-déposer) | A_CONFIRMER | Icônes d'action par ligne observées ; glisser-déposer effectif non testé explicitement |
| 37 | Gestion des pauses et créneaux vides | CONFIRMÉ | Blocs "Pause" et "Vider" par terrain |
| 38 | Ajout de terrain | CONFIRMÉ | Bouton "AJOUTER UN TERRAIN" |
| 39 | Réglage du nombre d'arbitres par match | CONFIRMÉ | Panneau "Arbitres" du Calendrier |
| 40 | Saisie/correction de score | CONFIRMÉ | Écran "Scores", champ inline par match, groupé par créneau horaire |
| 41 | Suivi de progression de la saisie des scores par phase | CONFIRMÉ | Indicateurs "40/40", "18/18" |
| 42 | Publication/dépublication et configuration du site public | CONFIRMÉ | Écran "Présentation", statuts "Actif", cases à cocher par page publique |
| 43 | Statistiques de fréquentation (visiteurs, utilisateurs appli) | CONFIRMÉ | "272 visiteurs individuels", "13 utilisateurs uniques" |
| 44 | QR code et affiche promotionnelle téléchargeable | CONFIRMÉ | Écran "Présentation" |
| 45 | Gestion des notifications push | CONFIRMÉ (bouton observé) | "GÉRER LES NOTIFICATIONS PUSH", contenu non ouvert |
| 46 | Mode diaporama (configuration) | CONFIRMÉ (onglet observé) | Onglet "Diaporama" de l'écran Présentation, contenu non ouvert |
| 47 | Personnalisation visuelle ("Design") | CONFIRMÉ (onglet observé) | Onglet "Design" de l'écran Présentation, contenu non ouvert |
| 48 | Création de compte / authentification / organisation multi-tournois | NON_ANALYSE | Connexion déjà active au moment de l'audit ; écran de login et dashboard multi-tournois non observés |
| 49 | Duplication / archivage / suppression de tournoi | NON_ANALYSE | Non observé dans le périmètre de ce tournoi unique |
| 50 | Forfaits, pénalités, tirs au but (saisie effective) | A_CONFIRMER | Configuration en amont confirmée (§Général), écran de saisie détaillé non ouvert |
| 51 | Import de données, journal d'audit | NON_ANALYSE | Non observé dans les écrans parcourus |

Voir [assumptions-and-open-questions.md](assumptions-and-open-questions.md) pour le détail des questions encore ouvertes.
