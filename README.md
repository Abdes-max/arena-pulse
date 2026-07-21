# Arena Pulse (nom de travail)

Plateforme premium de gestion de tournois sportifs — site public, administration web, applications mobiles iOS/Android, backend centralisé, API REST, temps réel et notifications.

> **Statut** : phase d'audit fonctionnel et de conception initiale. Aucune implémentation applicative n'a encore démarré. Voir `docs/` pour l'ensemble de la documentation produit, design et architecture.

## Documentation

- Vision produit : [`docs/product/product-vision.md`](docs/product/product-vision.md)
- Inventaire fonctionnel : [`docs/product/functional-inventory.md`](docs/product/functional-inventory.md)
- Inventaire des écrans : [`docs/product/screen-inventory.md`](docs/product/screen-inventory.md)
- Matrice de parité fonctionnelle : [`docs/product/feature-parity-matrix.md`](docs/product/feature-parity-matrix.md)
- Hypothèses et questions ouvertes : [`docs/product/assumptions-and-open-questions.md`](docs/product/assumptions-and-open-questions.md)
- Architecture (proposition initiale) : [`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md)
- Modèle de données (proposition initiale) : [`docs/architecture/data-model.md`](docs/architecture/data-model.md)
- Découpage des Pull Requests : [`docs/product/pull-request-plan.md`](docs/product/pull-request-plan.md)

## Workflow Git

- Branche par défaut : `master`. Aucun développement direct dessus.
- Toute évolution passe par une branche dédiée (`feat/…`, `fix/…`, `docs/…`, `design/…`, `chore/…`) et une Pull Request revue avant fusion.

Le reste du contenu (installation, démarrage local, tests, builds mobiles) sera complété au fil des Pull Requests de fondation technique (`feat/003-project-foundation`, `feat/005-local-infrastructure`).
