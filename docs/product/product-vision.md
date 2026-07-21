# Vision produit — Arena Pulse (nom de travail)

## Contexte

Arena Pulse est une plateforme premium de gestion de tournois sportifs : site public de suivi, administration de tournoi, applications mobiles iOS/Android, backend centralisé, API REST, temps réel et notifications. Elle vise une parité fonctionnelle avec les capacités observées sur l'application de référence Tournify (benchmark fonctionnel uniquement — voir `docs/product/assumptions-and-open-questions.md` pour le détail de ce qui a pu être vérifié), tout en proposant une expérience plus moderne, plus accessible et plus premium visuellement.

**Nom de travail** : "Arena Pulse" est un nom provisoire (mission §14) — aucun logo ni identité de marque définitive n'est validé à ce stade. La validation de la direction artistique interviendra dans la PR `design/002-brand-and-design-system`.

## Ce que la V1 doit permettre (parité fonctionnelle)

- **Public** : rechercher/consulter un tournoi, ses équipes, son calendrier, ses classements (poules et phases finales), un classement final ; suivre une équipe favorite ; recevoir des mises à jour en temps réel.
- **Administration** : créer et configurer un tournoi (équipes, terrains, formats, qualifications), générer et éditer un calendrier, saisir des scores, publier un site public.
- **Mobile** : les mêmes capacités de suivi public, en natif iOS/Android, avec notifications push et mode dégradé hors connexion.

La parité fonctionnelle signifie « permettre les mêmes tâches », pas « reproduire visuellement ou techniquement » la référence — voir la section propriété intellectuelle de la mission.

## Ce qui différencie Arena Pulse (dès la V1, approfondi ensuite)

D'après les points faibles identifiés dans `docs/product/opportunities.md` :
- Composants de match différenciés par contexte (mis en avant, en direct, résultat, compact) plutôt qu'une carte unique.
- Informations de format/qualification structurées plutôt qu'en texte libre.
- Retours utilisateur systématiques (confirmations visuelles) sur les actions asynchrones.
- Filtres persistants sur le calendrier, au-delà de la seule recherche texte.
- Accessibilité pensée dès le design system (labels, contrastes, focus).

## Valeurs de marque

Énergie, compétition, précision, maîtrise, instantanéité, émotion, convivialité, confiance, modernité, professionnalisme, accessibilité — univers sportif généraliste (football, basketball, handball, rugby, volleyball, tennis, padel, futsal, sport scolaire/universitaire, esport), pas exclusivement football malgré le tournoi de référence utilisé pour l'audit.

## Ce que la V1 ne couvre pas encore

Les fonctionnalités différenciantes avancées (au-delà de la parité) sont hors périmètre de cette première phase et seront ajoutées dans des itérations ultérieures, une fois le socle fonctionnel et le design system validés. L'architecture doit rester extensible pour les accueillir sans refonte majeure.

## Statut de cet audit

Cette version du document couvre uniquement le **site public** de référence (accès autorisé sans connexion). L'audit de l'**administration** est en attente de connexion de l'utilisateur porteur du projet à `manage.tournifyapp.com` et fera l'objet d'une mise à jour de ce document et de la matrice de parité.
