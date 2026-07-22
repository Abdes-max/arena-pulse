# Règles mobile

Mission §22. L'application mobile suit les conventions iOS/Android tout en conservant l'identité commune (tokens partagés, composants natifs).

## Structure

- **Navigation inférieure** (bottom tab bar), 5 onglets maximum : Accueil, Tournois suivis, Calendrier/Matchs du jour, Classements, Profil/Notifications — à confirmer lors de la conception détaillée mobile (`feat/017-mobile-foundation`).
- Zones d'action principales dans la moitié basse de l'écran (accessible au pouce, usage à une main — mission §22).
- Gestes tactiles : glisser pour rafraîchir (pull-to-refresh), swipe pour naviguer entre jours/phases sur le calendrier.

## Interaction

- Retour haptique léger sur les actions clés (ajout favori, validation de score côté gestionnaire) — jamais systématique pour ne pas fatiguer l'utilisateur.
- Transitions natives (push/pop iOS, Material motion Android) plutôt que des transitions web génériques.
- Skeleton screens pendant le chargement (cohérent avec `motion-guidelines.md`).
- Actions rapides depuis l'écran d'accueil (raccourcis iOS/Android) vers "Mon équipe suivie" et "Matchs du jour".

## Hors connexion

- Cache des dernières données consultées (tournoi suivi, équipe favorite, dernier classement connu), avec indicateur explicite "dernières données du [heure]" quand hors connexion.
- Rafraîchissement manuel toujours disponible même hors connexion (affiche l'échec proprement, ne bloque pas l'UI).

## Lisibilité extérieure

Priorité de contraste la plus élevée du système (AAA visé) sur les écrans consultés au bord d'un terrain en plein soleil : score, prochain match, statut du direct — cf. `colors.md` et `accessibility-guidelines.md`.

## Notifications enrichies

Contenu minimal viable pour la V1 : équipe, score, statut (mi-temps/terminé équivalent selon sport). Le détail exact des templates de notification sera spécifié dans `feat/019-mobile-notifications`.
