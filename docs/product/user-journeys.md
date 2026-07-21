# Parcours utilisateurs

## Parcours confirmés (site public)

### J1 — Parent/joueur suit son équipe le jour du tournoi
1. Reçoit un lien vers le tournoi (SMS, réseau social, affichage club).
2. Arrive sur l'accueil du tournoi, lit les informations pratiques (heure de rendez-vous, lieu).
3. Va dans "Mon équipe", recherche/clique son équipe.
4. Consulte le calendrier de son équipe (matchs joués, scores).
5. Ajoute l'équipe en favori (bouton étoile) pour un accès plus rapide la prochaine fois.
6. Consulte le classement de sa poule pour savoir si l'équipe est qualifiée.

*Point de friction observé* : aucune confirmation visuelle après le clic sur "Favori" — l'utilisateur ne sait pas si l'action a été prise en compte (voir `opportunities.md`).

### J2 — Spectateur suit l'ensemble du tournoi
1. Arrive sur l'accueil, comprend le format (poules → 3 tableaux finaux) via le texte éditorial.
2. Va dans "Calendrier" pour voir tous les matchs, éventuellement filtre/recherche une équipe ou un arbitre.
3. Va dans "Classements" pour suivre la progression : Phase 1 (poules) pendant la matinée, bascule vers Phase 2 (brackets) l'après-midi.
4. Consulte le classement final en fin de journée.

*Point de friction observé* : passer de "qui est qualifié" (poules) à "dans quel tableau" nécessite de relire le texte d'accueil, l'information n'est pas répétée sur l'écran de classement de poule lui-même.

### J3 — Utilisation en bord de terrain (mobile)
1. Ouvre le lien sur son téléphone en extérieur.
2. Consulte rapidement le prochain match de l'équipe suivie.
3. Rafraîchit pour voir un score mis à jour.

*Non vérifiable dans cette itération* : le rendu mobile réel n'a pas pu être confirmé de façon fiable avec l'outil d'automatisation disponible (redimensionnement de fenêtre sans effet visible confirmé) — à tester manuellement sur un vrai appareil avant de tirer des conclusions définitives sur l'ergonomie mobile de la référence.

## Parcours attendus côté administration — HYPOTHÈSE (NON_ANALYSE)

Ces parcours sont déduits du périmètre demandé en §6/§10.1 de la mission et devront être confirmés/révisés après l'audit admin :

### A1 — Organisateur crée un tournoi de A à Z
Créer compte/organisation → créer tournoi → définir sport/catégories → importer équipes → définir terrains/créneaux → configurer format (poules + qualifications + brackets) → générer calendrier automatiquement → ajuster manuellement (glisser-déposer) → publier le site public.

### A2 — Gestionnaire de scores le jour J
Se connecter → ouvrir le "centre de gestion du direct" → sélectionner un match en cours → saisir le score → valider → vérifier que le classement se met à jour automatiquement.

### A3 — Arbitre consulte ses affectations
Se connecter (ou accès simplifié) → consulter la liste de ses matchs assignés avec terrain/horaire.

Ces trois parcours sont marqués **HYPOTHÈSE** et devront être requalifiés en CONFIRMÉ ou ajustés après connexion à `manage.tournifyapp.com`.
