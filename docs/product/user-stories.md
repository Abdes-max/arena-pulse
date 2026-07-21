# User stories — MVP

Format `Given / When / Then` détaillé dans `docs/testing/acceptance-scenarios.md` (à créer lors des PR de développement correspondantes). Ce fichier liste les user stories de haut niveau issues de l'audit, priorisées à titre indicatif (P0 = MVP bloquant, P1 = MVP important, P2 = amélioration).

## Site public

- **P0** — En tant que visiteur, je veux ouvrir un tournoi via un lien public sans créer de compte, afin de consulter ses informations immédiatement.
- **P0** — En tant que visiteur, je veux rechercher une équipe par nom, afin de retrouver rapidement celle qui m'intéresse.
- **P0** — En tant que visiteur, je veux consulter le calendrier et le classement d'une équipe précise, afin de suivre sa progression.
- **P0** — En tant que visiteur, je veux consulter le classement de chaque poule, afin de savoir qui est en tête.
- **P0** — En tant que visiteur, je veux consulter les tableaux à élimination directe, afin de suivre la phase finale.
- **P0** — En tant que visiteur, je veux consulter un classement final unique du tournoi, afin de connaître le palmarès.
- **P1** — En tant que visiteur, je veux ajouter une équipe en favori, afin d'y accéder plus rapidement à ma prochaine visite.
- **P1** — En tant que visiteur, je veux recevoir une notification quand le score d'une équipe suivie change, afin de ne rien manquer sans garder l'onglet ouvert.
- **P1** — En tant que visiteur, je veux voir les matchs en direct mis à jour automatiquement, afin de suivre le tournoi sans rafraîchir manuellement.
- **P2** — En tant que visiteur, je veux partager un tournoi ou un match sur les réseaux sociaux, afin d'informer mon entourage.
- **P2** — En tant que spectateur au bord du terrain, je veux une expérience mobile fluide et lisible en extérieur, afin de suivre le tournoi confortablement sur site.

## Administration — HYPOTHÈSE (à confirmer après audit admin)

- **P0** — En tant qu'organisateur, je veux créer un tournoi et configurer ses équipes/poules/terrains, afin de préparer l'événement.
- **P0** — En tant qu'organisateur, je veux générer automatiquement le calendrier des poules, afin de gagner du temps par rapport à une planification manuelle.
- **P0** — En tant qu'organisateur, je veux ajuster manuellement le calendrier (glisser-déposer) en cas de conflit, afin de corriger les problèmes de dernière minute.
- **P0** — En tant que gestionnaire de scores, je veux saisir le score d'un match en quelques secondes depuis mobile, afin de mettre à jour le direct sans délai.
- **P0** — En tant qu'organisateur, je veux que les classements et qualifications se recalculent automatiquement après chaque score, afin de ne pas avoir à le faire manuellement.
- **P0** — En tant qu'organisateur, je veux publier/dépublier le site public, afin de contrôler quand les informations deviennent visibles.
- **P1** — En tant qu'organisateur, je veux dupliquer un tournoi existant, afin de gagner du temps pour une édition suivante.
- **P1** — En tant qu'organisateur, je veux inviter des collaborateurs avec des rôles différents, afin de déléguer certaines tâches (arbitrage, scores) en toute sécurité.

Ces user stories seront revues et complétées après l'audit de l'administration.
