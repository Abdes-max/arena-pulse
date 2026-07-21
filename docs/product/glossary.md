# Glossaire

Termes métier utilisés dans l'ensemble de la documentation produit. Les termes marqués **[HYPOTHÈSE]** n'ont pas été confirmés par observation directe et devront être validés.

| Terme | Définition |
| --- | --- |
| Tournoi | Événement sportif organisé sur une ou plusieurs journées, regroupant plusieurs équipes autour d'un ou plusieurs sports/catégories. |
| Organisation | Entité (club, ligue, société d'événementiel) qui possède un ou plusieurs tournois et regroupe des collaborateurs. |
| Sport | Discipline sportive du tournoi (football, basketball, etc.). Un tournoi peut couvrir plusieurs sports **[HYPOTHÈSE]**. |
| Catégorie | Regroupement d'âge ou de niveau (ex. U10, Seniors, Loisir). |
| Division | Sous-regroupement d'une catégorie, utilisé quand plusieurs niveaux coexistent dans une même catégorie. |
| Phase de compétition | Étape du format de compétition : phase de poules, phase finale, matchs de classement. |
| Poule | Groupe d'équipes qui s'affrontent en round-robin (championnat) durant la phase de poules. Observé : 4 poules de 5 équipes (Poule A à D) dans le tournoi de référence. |
| Groupe | Terme générique pouvant désigner une poule ou un regroupement de bracket **[HYPOTHÈSE — à distinguer de « Poule » dans le modèle final]**. |
| Tableau à élimination directe / Bracket | Représentation graphique d'une phase finale à élimination directe (quarts, demi-finales, finale). Observé pour 3 niveaux distincts dans le tournoi de référence : Champions League, Europa League, Conférence League. |
| Qualification | Mécanisme qui détermine quelles équipes accèdent à quelle phase finale selon leur classement de poule. Observé : 1er/2e → « Champions League », 3e/4e → « Europa League », 5e → « Conférence League ». |
| Classement de poule | Tableau trié par points (PTS), avec colonnes J (joué), G (gagné), N (nul), P (perdu), PTS, PP (buts pour), PC (buts contre), +/- (différence). |
| Classement final | Classement global de toutes les équipes du tournoi, dérivé du résultat de chaque équipe dans son tableau final (ex. « Gagnant Finale CL », « Perdant Quart de final 3 »). |
| Match de classement | Match disputé pour départager une position finale (ex. petite finale pour la 3e place). Observé : présent uniquement pour la « Champions League » du tournoi de référence (petite finale), absent pour les autres tableaux. |
| Match de consolation | Match proposé à une équipe éliminée pour lui garantir un nombre minimum de rencontres **[HYPOTHÈSE — non observé dans le jeu de données actuel]**. |
| Terrain | Lieu physique où se déroule un match (ex. « Pelouse 1 », « Synthétique 2 »). |
| Site / Lieu | Emplacement géographique regroupant un ou plusieurs terrains (ex. « Stade Marius Requier, Aix-en-Provence »). |
| Créneau | Plage horaire réservée sur un terrain, pour un match ou pour une pause. Confirmé côté admin : un créneau peut exister sans match assigné (affiché "Vider"), et des créneaux de pause dédiés sont insérables entre les matchs. |
| Arbitre | Officiel affecté à un ou plusieurs matchs. Recherchable via la barre "Trouver une équipe ou un arbitre" du calendrier public. |
| Équipe favorite | Équipe suivie par un visiteur via le bouton « Favori », pour un accès rapide et des notifications **[HYPOTHÈSE sur les notifications, bouton cloche observé mais comportement non testé]**. |
| Diaporama | Mode d'affichage plein écran destiné à un écran de stade/gymnase, accessible via le bouton "LANCEZ LE DIAPORAMA" présent sur toutes les pages publiques. |
| Publication / Dépublication | Confirmé côté admin (écran "Présentation") : le site web et l'application ont chacun un statut "Actif", et chaque page publique (Tournoi, Mon équipe, Classements, Calendrier, Arbitres, S'inscrire) est activable/désactivable indépendamment via une case à cocher. |
| Permission | Autorisation booléenne indépendante accordée à un administrateur pour un tournoi donné (ex. « Gérer les scores »). Confirmé côté admin : Tournify utilise une matrice de 10 permissions cochées individuellement plutôt que des rôles nommés fixes. |
