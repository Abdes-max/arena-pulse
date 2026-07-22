# Matrice de parité fonctionnelle

Statuts possibles : `NON_ANALYSE` · `A_CONFIRMER` · `SPECIFIE` · `DESIGNE` · `EN_COURS` · `IMPLEMENTE` · `TESTE` · `VALIDE`.

Cette matrice est mise à jour à chaque Pull Request. Version mise à jour après audit du site public **et** de l'administration de référence.

| Domaine | Fonctionnalité de référence | Public web | Administration | Mobile | Priorité | Statut | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accueil | Page d'accueil tournoi (identité, règles, lieu) | Oui | Oui (édition) | Oui | P0 | A_CONFIRMER | Contenu éditorial à structurer, cf. `opportunities.md` |
| Navigation | Navigation par onglets Tournoi/Équipe/Classements/Calendrier | Oui | Oui (activable page par page) | Oui (bottom nav) | P0 | A_CONFIRMER | Admin : chaque page publique est individuellement activable (écran Présentation) |
| Équipes | Recherche d'équipe | Oui | Oui (gestion) | Oui | P0 | A_CONFIRMER | Filtre par poule à ajouter (amélioration) |
| Équipes | Fiche équipe (calendrier + classement) | Oui | Oui (édition) | Oui | P0 | A_CONFIRMER | |
| Équipes | Import / export d'équipes | N/A | Export confirmé, import non observé | N/A | P1 | A_CONFIRMER | Bouton "EXPORTER" observé ; aucun bouton d'import visible sur cet écran |
| Équipes | Favori équipe | Oui | N/A | Oui | P1 | A_CONFIRMER | Persistance et retour visuel à spécifier |
| Équipes | Notification sur équipe suivie | Oui | Oui (gestion notifications push) | Oui (push) | P1 | A_CONFIRMER | Bouton "GÉRER LES NOTIFICATIONS PUSH" observé, contenu non ouvert |
| Équipes | Statistiques joueurs individuels | N/A | Oui | N/A | P2 | A_CONFIRMER | Confirmé configurable, contenu non testé |
| Classements | Classement par poule | Oui | Oui (barème + critères de départage configurables) | Oui | P0 | A_CONFIRMER | Critères confirmés : points, diff. de buts, buts marqués, confrontation directe |
| Classements | Classement additionnel (fair-play/pénalité) | N/A | Oui | N/A | P2 | A_CONFIRMER | "Enregistrer plus de points" |
| Classements | Tableaux à élimination directe | Oui | Oui (construction visuelle par phase) | Oui | P0 | A_CONFIRMER | Composant bracket mobile à concevoir spécifiquement |
| Classements | Qualification en cascade entre phases | Oui (déduit du texte) | Oui (explicite, "AJOUTER UNE PHASE") | Oui | P0 | SPECIFIE | Confirmé côté admin, modélisé dans `data-model.md` (`QualificationRule`) |
| Classements | Classement final global | Oui | Oui | Oui | P0 | A_CONFIRMER | Colonnes vides observées côté public — bug à ne pas reproduire |
| Calendrier | Liste/recherche de tous les matchs | Oui | Oui (génération/édition) | Oui | P0 | A_CONFIRMER | Filtres persistants à ajouter (amélioration) |
| Calendrier | Matchs en direct + mise à jour temps réel | Oui | Oui (indicateurs de progression par phase) | Oui | P1 | A_CONFIRMER | Non observable en direct réel (tournoi de référence déjà joué) |
| Calendrier | Génération assistée du calendrier | N/A | Oui | N/A | P0 | SPECIFIE | Panneau "Planifier" confirmé (sélection poules/tours/terrains) |
| Calendrier | Édition manuelle / glisser-déposer | N/A | A_CONFIRMER | N/A | P0 | A_CONFIRMER | Icônes d'action par ligne observées ; drag-and-drop effectif non testé |
| Calendrier | Pauses et créneaux libres | N/A | Oui | N/A | P1 | SPECIFIE | Blocs "Pause"/"Vider" confirmés |
| Calendrier | Terrains multiples, ajout de terrain | N/A | Oui | N/A | P0 | SPECIFIE | |
| Calendrier | Affectation des arbitres, nombre par match | N/A | Oui | N/A | P0 | SPECIFIE | "Quatre arbitres par match" observé comme réglage |
| Scores | Saisie / correction de score | N/A | Oui (inline, groupé par créneau) | Oui (mobile terrain) | P0 | SPECIFIE | Écran "Scores" confirmé |
| Scores | Forfaits / pénalités / tirs au but | N/A | A_CONFIRMER | N/A | P1 | A_CONFIRMER | Configuration en amont confirmée, écran de saisie détaillé non ouvert |
| Organisation | Création/duplication/archivage de tournoi | N/A | NON_ANALYSE | N/A | P0 | NON_ANALYSE | Dashboard multi-tournois non observé (audit entré directement dans un tournoi existant) |
| Organisation | Authentification / organisation multi-utilisateurs | N/A | NON_ANALYSE | N/A | P0 | NON_ANALYSE | Connexion déjà active au moment de l'audit |
| Organisation | Gestion des permissions administrateur | N/A | Oui (matrice de 10 permissions) | N/A | P0 | SPECIFIE | Voir `roles-and-permissions.md` |
| Organisation | Terrains, sites, créneaux | N/A | Oui | N/A | P0 | SPECIFIE | |
| Organisation | Publication / dépublication du site public | N/A | Oui (par page) | N/A | P0 | SPECIFIE | Écran "Présentation" |
| Organisation | Statistiques de fréquentation | N/A | Oui | N/A | P2 | A_CONFIRMER | Visiteurs web + utilisateurs appli observés |
| Contenu | Sponsors | Oui | NON_ANALYSE | Oui | P2 | NON_ANALYSE | Absent du tournoi de référence utilisé, aucun écran dédié repéré lors de l'audit |
| Contenu | Partage tournoi/match, QR code, affiche | Oui | Oui (QR code + affiche confirmés) | Oui (natif) | P2 | A_CONFIRMER | |
| Affichage | Mode diaporama plein écran | Oui | Oui (onglet dédié confirmé) | N/A | P2 | A_CONFIRMER | Contenu non ouvert (précaution) |
| Affichage | Thème visuel du tournoi (choix parmi plusieurs directions artistiques pour le site public + diaporama) | Oui | Oui (sélection par l'organisateur) | N/A | P1 | SPECIFIE | Décision produit validée (`docs/design/visual-language.md`) : dépasse la référence (onglet "Design" observé côté admin Tournify sans être ouvert) — 3 thèmes complets proposés dès la conception plutôt qu'un simple réglage |
| Mobile | Application native iOS/Android | N/A | Oui (activable par tournoi) | Oui | P0 | A_CONFIRMER | Toggle "Afficher le tournoi dans l'appli" confirmé côté admin ; app elle-même non auditée (hors périmètre §1) |

**Légende N/A** : fonctionnalité non pertinente pour cette surface (ex. la génération de calendrier n'a pas de sens côté "public web").
