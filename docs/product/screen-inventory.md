# Inventaire des écrans — Site public

Périmètre : uniquement le site public de référence (accès autorisé et testé). L'administration sera documentée dans une itération suivante, après connexion.

Convention par écran : Objectif · Utilisateurs · Données affichées · Actions · Règles métier · États · Erreurs possibles · Dépendances · Desktop/Tablette/Mobile · Opportunités de différenciation.

---

## 1. Accueil du tournoi (`/live/:slug`)

- **Objectif** : présenter le tournoi (identité, dates, règles de format, lieu) comme page d'atterrissage.
- **Utilisateurs** : spectateurs, parents, joueurs, toute personne ayant le lien.
- **Données affichées** : nom du tournoi, logo du club organisateur, date, texte éditorial libre (horaires, règles de format, nombre d'équipes/poules/terrains), encart lieu.
- **Actions disponibles** : naviguer vers Mon équipe / Classements / Calendrier ; lancer le diaporama.
- **Règles métier observées** : le texte de règles (qualification, phase finale) est un bloc éditorial libre, pas une donnée structurée affichée séparément — la mise en forme (emenatnt) semble être écrite manuellement par l'organisateur.
- **États** : nominal uniquement observé. État vide (tournoi sans description) et erreur (tournoi introuvable) non testés.
- **Dépendances** : aucune, écran d'entrée.
- **Desktop** : mise en page 2 colonnes (contenu + encart lieu latéral).
- **Tablette/Mobile** : non vérifié de façon fiable via l'outil d'automatisation (redimensionnement de fenêtre sans effet confirmé sur le rendu) — **à revérifier manuellement**.
- **Opportunités de différenciation** :
  - Problèmes observés : le texte de règles est un pavé de texte libre avec emojis, peu scannable, aucune hiérarchie visuelle entre "infos pratiques" et "règles de format".
  - Informations difficiles à trouver : les règles de qualification (qui va où) sont noyées dans un paragraphe, pas dans un composant dédié.
  - Proposition pour Arena Pulse : structurer ces informations en blocs typés (bloc "Format", bloc "Infos pratiques", bloc "Qualification") avec composants réutilisables plutôt qu'un texte libre, tout en gardant un champ éditorial libre optionnel pour les annonces.

---

## 2. Recherche d'équipe (`/live/:slug/team`)

- **Objectif** : retrouver rapidement une équipe parmi toutes celles du tournoi.
- **Utilisateurs** : parents/joueurs cherchant leur propre équipe, spectateurs suivant une équipe adverse.
- **Données affichées** : barre de recherche + grille de boutons (une par équipe, triée alphabétiquement), 4 colonnes en desktop.
- **Actions disponibles** : taper une recherche + "Rechercher" ; cliquer directement une équipe dans la grille.
- **Règles métier** : liste exhaustive des 20 équipes, sans distinction visuelle de poule sur cet écran (la poule n'apparaît qu'après clic).
- **États** : nominal observé (20 équipes). État vide (aucune équipe) et état "aucun résultat" de recherche non testés.
- **Dépendances** : mène à l'écran 3 (fiche équipe).
- **Opportunités de différenciation** :
  - Problèmes observés : pas de filtre par poule sur cette grille, obligeant à connaître le nom exact de l'équipe.
  - Améliorations proposées : filtre par poule/catégorie, recherche instantanée (sans bouton "Rechercher"), affichage du logo d'équipe dans la grille (actuellement absent, seulement du texte).

---

## 3. Fiche équipe (`/live/:slug/team/:teamId`)

- **Objectif** : vue centrée sur une équipe — ses matchs et son classement.
- **Utilisateurs** : parents/joueurs/coach de l'équipe, spectateurs suivant cette équipe.
- **Données affichées** : nom + logo équipe ; sous-onglet Calendrier (liste des matchs joués/à venir de cette équipe, groupés par section "Joué" avec poule, terrain, adversaire, score) ; sous-onglet Classements (bracket de la phase finale de l'équipe + classement de sa poule).
- **Actions disponibles** : bouton "Favori" (étoile), icône de notification (cloche), bouton "Retour vers" (navigation arrière), bascule Calendrier/Classements.
- **Règles métier observées** : une équipe éliminée en poule (5e) n'a que sa poule + son bracket "Conférence League" affiché ; le contenu s'adapte donc au niveau réellement atteint par l'équipe, pas à un bracket générique.
- **États** : section "Joué" avec un chevron d'expansion/réduction (accordéon) — suggère l'existence d'une section "À venir" en tournoi non terminé, non observable ici (tournoi 100% joué).
- **Erreurs possibles** : équipe sans aucun match encore joué (tournoi non démarré) — non testé.
- **Dépendances** : alimenté par écran 2 (recherche) ; les scores viennent des mêmes données que l'écran 6 (calendrier global).
- **Opportunités de différenciation** :
  - Problèmes observés : le bouton Favori et la cloche de notification ne donnent aucun retour visuel testé (pas de confirmation, pas de tooltip) ; on ne sait pas si l'état favori persiste après rechargement (cookie/localStorage) — **question ouverte**.
  - Limites d'accessibilité potentielles : icônes seules (étoile, cloche) sans libellé texte visible — risque pour lecteurs d'écran, à vérifier.
  - Proposition : ajouter un libellé visible ou un `aria-label` explicite, confirmer visuellement l'ajout aux favoris (toast/snackbar), et exposer une vue "prochains matchs" dédiée même quand il n'y en a plus.

---

## 4. Classements — Phase 1 / Poules (`/live/:slug/standings`, onglet "Phase 1")

- **Objectif** : consulter le classement de chaque poule de la phase de groupes.
- **Utilisateurs** : tous publics.
- **Données affichées** : un tableau par poule (A-D), colonnes rang, équipe, J, G, N, P, PTS, PP, PC, +/-, trié par PTS décroissant.
- **Actions** : accordéon "Calendrier de la Poule X" sous chaque tableau (repliable).
- **Règles métier observées** : tri par points, mais les critères de départage en cas d'égalité (confrontation directe ? différence de buts ? buts marqués ?) ne sont pas explicites dans l'UI — **question ouverte**, seule la position finale est visible, pas la règle appliquée.
- **États** : squelette de chargement gris observé avant l'affichage des données (~1-2s).
- **Dépendances** : les qualifications vers la Phase 2 découlent de ce classement (1er/2e → Champions League, 3e/4e → Europa League, 5e → Conférence League), mais ce lien n'est pas visualisé explicitement sur cet écran (il faut le déduire du texte d'accueil).
- **Opportunités de différenciation** :
  - Problèmes observés : aucune indication visuelle sur CE tableau de qui est qualifié pour quoi (pas de code couleur / ligne de séparation "zone de qualification").
  - Proposition : ligne de séparation visuelle + badge de couleur indiquant la zone de qualification directement dans le tableau de poule (ex. liseré vert pour "Champions League", orange pour "Europa League").

---

## 5. Classements — Phase 2 / Tableaux à élimination (`/live/:slug/standings`, onglet "Phase 2")

- **Objectif** : visualiser la progression en phase finale sous forme de bracket.
- **Utilisateurs** : tous publics.
- **Données affichées** : 3 brackets indépendants (Champions League 8 équipes avec petite finale, Europa League 8 équipes, Conférence League 4 équipes), avec logo, nom d'équipe (tronqué si long) et score par match, organisés en colonnes (quarts → demies → finale).
- **Actions** : accordéon "Calendrier de [nom du tableau]" sous chaque bracket.
- **Règles métier observées** : seule la Champions League a une "petite finale" (match de classement 3e/4e) ; les deux autres tableaux n'en ont pas — confirme une règle configurable par tableau, pas globale.
- **États** : squelette de chargement identique à l'écran 4.
- **Dépendances** : suit directement les qualifications de l'écran 4.
- **Opportunités de différenciation** :
  - Problèmes observés : noms d'équipe tronqués sans mécanisme de survol/tooltip testé pour voir le nom complet (ex. "Marseill...", "Mar Vivo" versus "AS Mar Vivo") ; lisibilité réduite sur les brackets à 8 équipes.
  - Limites mobiles attendues : un bracket à 8 équipes sur 3 colonnes est large — nécessitera un défilement horizontal ou une vue simplifiée sur petit écran (non vérifiable avec l'outil de redimensionnement disponible, à tester manuellement).
  - Proposition : bracket repensé avec zoom/pan tactile, noms complets au clic/tap, mise en évidence du chemin de l'équipe favorite dans le bracket.

---

## 6. Classement final (`/live/:slug/standings`, onglet "Classement")

- **Objectif** : donner un classement unique 1-20 de toutes les équipes du tournoi.
- **Utilisateurs** : tous publics, en particulier pour la remise des récompenses.
- **Données affichées** : rang, équipe, "Score final" en texte (ex. "Gagnant Finale CL - Champions League", "Perdant Quart de final 3 - Champions League") ; colonnes PTS/BP/BC/+- présentes dans l'en-tête mais vides sur les lignes observées (probablement non pertinentes pour un classement inter-tableaux).
- **Actions** : icône de partage en haut à droite du tableau (non testée).
- **Règles métier observées** : le classement ordonne d'abord par tableau atteint (Champions League > Europa League > Conférence League), puis par performance dans ce tableau (vainqueur > finaliste > demi-finaliste > quart de finaliste) — confirme une hiérarchie de valeur entre les 3 brackets de phase finale.
- **États** : colonnes PTS/BP/BC/+- vides — soit une donnée non calculée pour ce contexte, soit un bug d'affichage de la référence à noter comme **point faible observé**, pas à reproduire tel quel.
- **Dépendances** : agrège les résultats des 3 brackets de l'écran 5.
- **Opportunités de différenciation** :
  - Problèmes observés : colonnes d'en-tête vides (PTS/BP/BC/+-) créent une incohérence visuelle dans la référence.
  - Proposition : soit remplir ces colonnes avec des données pertinentes (ex. bilan global du tournoi), soit les supprimer si non applicables à ce type de classement multi-tableaux ; ajouter un export/partage visible (image ou lien) pour affichage réseaux sociaux/podium.

---

## 7. Calendrier complet (`/live/:slug/schedule`)

- **Objectif** : lister l'ensemble des matchs du tournoi (poules + phases finales) avec recherche.
- **Utilisateurs** : tous publics, arbitres cherchant leurs matchs, coachs planifiant leur journée.
- **Données affichées** : grille de cartes match (poule/tableau, terrain, deux équipes avec logo, score, code couleur vert/rouge/orange pour victoire/défaite/nul), grille 3 colonnes en desktop.
- **Actions** : barre "Trouver une équipe ou un arbitre" + bouton "Rechercher".
- **Règles métier observées** : les cartes de phase finale reprennent le même composant que les cartes de poule (libellé "Quart de final 5", "Demi EL 1", "Finale CL" à la place du libellé "Poule X") — un seul type de composant carte pour tous les contextes dans la référence.
- **États** : nominal (matchs tous joués). États "à venir" (sans score), "en direct", et "aucun résultat de recherche" non observés/testés.
- **Dépendances** : source de données commune avec les écrans 3, 4, 5, 6.
- **Opportunités de différenciation** :
  - Problèmes observés : un seul type de carte pour poule ET phases finales — perd en lisibilité pour un match de finale qui mériterait une mise en avant (c'est justement le composant "featured match" demandé en §20 de la mission, absent ici).
  - Informations difficiles à trouver : pas de filtre par poule/terrain/statut sur cette page, uniquement une recherche texte — pour un tournoi à 90+ matchs, le défilement serait long.
  - Proposition Arena Pulse : filtres persistants (poule, terrain, statut : à venir/en direct/terminé), plusieurs composants de match différenciés (carte compacte, carte "en direct" mise en avant, carte de résultat), tri chronologique par défaut avec ancre "aujourd'hui".

---

# Inventaire des écrans — Administration

Périmètre : `manage.tournifyapp.com`, après connexion autorisée du porteur de projet. Navigation observée : menu latéral fixe avec 6 entrées (Général, Participants, Classement, Calendrier, Présentation, Scores) en haut à gauche, plus un en-tête global (retour, nom du tournoi, "Classe mondiale", "Présentation", "Assistance"). Aucune modification n'a été effectuée sur le tournoi de référence pendant cette exploration (lecture seule stricte).

## A1. Général (`/tournament/:id/settings`)

- **Objectif** : configurer les paramètres de base du tournoi.
- **Utilisateurs** : administrateur avec la permission "Gestion générale".
- **Données affichées/éditables** : nom du tournoi, journées de match (liste avec ajout), lieux (liste avec ajout), case "tournoi en ligne (eSport)", divisions (liste colorée avec ajout), langues de présentation (sélecteur de drapeaux), section repliable "Audience" (découvrabilité), section repliable "Comptage de points" (barème victoire/nul/défaite, tirs au but, critères de départage réordonnables, classement additionnel type fair-play, suivi de statistiques joueurs).
- **Actions** : ajouter un jour/lieu/division, éditer chaque élément (icône crayon), cocher/décocher des options, réordonner les critères de départage ("MODIFIER LES CRITÈRES"), ajouter un comptage de points alternatif.
- **Règles métier confirmées** : voir `business-rules.md` (barème de points et critères de départage explicitement configurables, pas figés).
- **Opportunités de différenciation** : la page mélange plusieurs niveaux de complexité sur un seul écran long à faire défiler (identité du tournoi ↔ règles de calcul fines) ; Arena Pulse pourrait scinder cela en étapes/onglets plus progressifs (cf. mission §21, "formulaires longs avec étapes/sections").

## A2. Participants — Équipes (`/tournament/:id/teams`)

- **Objectif** : gérer la liste des équipes participantes.
- **Utilisateurs** : administrateur avec la permission "Gérer les participants".
- **Données affichées** : tableau avec case à cocher (sélection multiple), colonne icône "responsable d'équipe", nom, logo, joueurs (bouton d'ajout), icône d'édition par ligne.
- **Actions** : "EXPORTER", "AJOUTER UNE ÉQUIPE", édition/suppression par ligne, ajout de joueurs par équipe, sélection multiple pour actions groupées (nature exacte des actions groupées non testée).
- **États** : nominal (20 équipes) ; état vide non observé sur ce tournoi.
- **Opportunités de différenciation** : aucun import visible sur cet écran (uniquement export) — la mission demande explicitement l'import d'équipes (§10.1) ; à concevoir comme un net plus pour Arena Pulse si confirmé absent de la référence.

## A3. Participants — Arbitres (`/tournament/:id/teams`, onglet Arbitres)

- **Objectif** : gérer les arbitres et leur affectation.
- **Données affichées** : état vide illustré ("Ajoutez des arbitres. Utilisez ensuite la page du calendrier pour assigner les arbitres aux matchs."), toggle "Équipes en qualité d'arbitres".
- **Actions** : "AJOUTER UN ARBITRE".
- **Opportunités de différenciation** : bon exemple d'état vide pédagogique (illustration + explication du prochain pas) à reprendre dans le design system Arena Pulse (cf. mission §25).

## A4. Participants — Administrateurs (`/tournament/:id/teams`, onglet Administrateurs)

- **Objectif** : gérer les comptes ayant accès à l'administration et leurs permissions.
- **Données affichées** : tableau avec une colonne par permission (10 colonnes, voir `roles-and-permissions.md`), coche verte si accordée.
- **Actions** : "AJOUTER UN ADMINISTRATEUR", édition par ligne.
- **Opportunités de différenciation** : cocher 10 permissions individuellement pour chaque nouvel administrateur est une charge cognitive/temps non négligeable ; Arena Pulse peut proposer des préréglages de rôle (cf. `roles-and-permissions.md`) tout en gardant la personnalisation fine en option avancée.

## A5. Classement / structure de compétition (`/tournament/:id/structure`)

- **Objectif** : construire visuellement le format de compétition (poules + phases finales + qualifications).
- **Données affichées** : colonne "Phase 1" avec les poules (équipes listées, éditables), colonne "Phase 2" avec un bloc par tableau à élimination directe (Champions/Europa/Conférence League), chaque tableau affichant ses tours (quarts/demies/finale) avec équipes et scores en lecture.
- **Actions** : "+POULE", "+BRACKET (5 jusqu'à 8)", "+MATCH AMICAL" par colonne de phase ; "+MATCH" par tableau (ajout d'un match de classement type petite finale) ; "AJOUTER UNE PHASE" (avec aide contextuelle explicite sur la logique de qualification en cascade) ; éditer/supprimer poule ou tableau (icônes crayon/corbeille).
- **Règles métier confirmées** : voir `business-rules.md` — c'est l'écran qui confirme le mécanisme de qualification en cascade entre phases.
- **Opportunités de différenciation** : écran dense mais puissant ; c'est l'un des écrans les plus complexes de toute l'administration et un bon candidat pour un mode "assistant pas-à-pas" en plus du mode expert actuel, pour les organisateurs non-experts (cf. mission §21).

## A6. Calendrier (`/tournament/:id/schedule`)

- **Objectif** : construire et ajuster le planning des matchs.
- **Données affichées** : une colonne par terrain, chronologie unique de créneaux horaires par colonne (matchs de poule et de phase finale mélangés chronologiquement), créneaux "Pause" et créneaux vides ("Vider"), verrou "DURÉE DU MATCH".
- **Actions** : panneau latéral "Planifier" (génération assistée par sélection de poules/brackets/tours/terrains, compteur de progression, "VIDER LE SCHÉMA") ; panneau "Arbitres" (réglage du nombre d'arbitres par match, ajout d'arbitres) ; ajout de "PAUSE"/"ÉVÉNEMENT" par terrain ; "AJOUTER UN TERRAIN" ; "EXPORTER".
- **Règles métier confirmées** : voir `business-rules.md`, section "Planification du calendrier".
- **Opportunités de différenciation** : pas de glisser-déposer confirmé à l'usage lors de cet audit (icônes d'action par ligne observées au survol plutôt qu'un drag visible) — à vérifier plus précisément avant de considérer le drag-and-drop comme acquis dans la référence ; Arena Pulse peut se différencier en le rendant explicitement fluide et tactile (mission §21).

## A7. Présentation (`/tournament/:id/presentation`)

- **Objectif** : configurer ce qui est visible sur le site public/l'application mobile/le diaporama.
- **Données affichées** : 3 onglets "Site web et application" / "Diaporama" / "Design" ; bloc "Site Web" (statut Actif, lien public, compteur de visiteurs individuels — 272 observés, code QR) ; bloc "Application" (statut Actif, toggle "Afficher le tournoi dans l'appli", bouton "Gérer les notifications push", compteur d'utilisateurs uniques — 13 observés) ; grille "Pages" avec case à cocher par page publique (Tournoi, Mon équipe, Classements, Calendrier, Arbitres, S'inscrire).
- **Actions** : activer/désactiver chaque page publique, télécharger une affiche promotionnelle, gérer les notifications push, éditer chaque page ("MODIFIER LA PAGE").
- **Règles métier confirmées** : le site public et l'application mobile sont bien deux surfaces distinctes mais pilotées par la même configuration "Présentation" ; le nombre de pages public réellement affichées est configurable (ex. "Arbitres" et "S'inscrire" étaient décochées sur le tournoi de référence, expliquant leur absence lors de l'audit public).
- **Opportunités de différenciation** : bons signaux de valeur produit (stats de visite, QR code, affiche téléchargeable) à reprendre et enrichir pour Arena Pulse.

## A8. Scores (`/tournament/:id/results`)

- **Objectif** : saisir/consulter les scores de tous les matchs.
- **Données affichées** : tableau de bord "Progrès" par phase (ex. "40/40", "18/18" scores saisis), liste de créneaux horaires (accordéon), chaque créneau déplié affichant terrain / équipe A / score inline éditable "X - Y" / équipe B / lien vers la poule.
- **Actions** : "EXPORTER", "CLASSEMENT" (accès rapide), édition inline du score.
- **Opportunités de différenciation** : vue dense et efficace (groupée par horaire, tous terrains visibles simultanément) — bon pattern à conserver pour le "centre de gestion du direct" d'Arena Pulse (mission §21), en ajoutant des indicateurs visuels de matchs en cours vs terminés vs à venir.

## Écrans non couverts par cette itération

- Écran de détail d'un match unique (ouverture d'une fiche match dédiée pour forfait/pénalité/tirs au but) : non ouvert pour rester dans un périmètre d'audit raisonnable.
- Mode diaporama plein écran (public et admin) : bouton/onglet identifiés mais non activés pour rester non intrusif sur le tournoi de référence pendant l'audit.
- Écran "Classe mondiale" (lien visible dans l'en-tête admin, nature non explorée) : **NON_ANALYSE**.
- États réellement "en direct" : le tournoi de référence utilisé est entièrement joué (données historiques), aucun match en direct n'était disponible au moment de l'audit.
- Création d'un tournoi depuis zéro (dashboard multi-tournois, formulaire de création) : cet audit est entré directement dans un tournoi existant via lien fourni ; l'écran de création n'a pas été observé.
