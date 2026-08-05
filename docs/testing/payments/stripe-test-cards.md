# Cartes de test Stripe (dev local)

À utiliser sur toute page Stripe Checkout de l'app (inscription joueur payante
— ADR 0005 — ou publication payante d'un tournoi — ADR 0006). Mode test
uniquement, aucun vrai paiement n'est effectué. Date d'expiration : n'importe
quelle date future (ex. `12/34`). CVC et code postal : n'importe quelle
valeur valide (ex. `123` / `12345`).

| Numéro                | Résultat                             |
| ---------------------- | ------------------------------------- |
| `4242 4242 4242 4242` | Paiement accepté (cas nominal)       |
| `4000 0000 0000 0002` | Paiement refusé                      |
| `4000 0025 0000 3155` | Authentification 3D Secure requise   |

Liste complète : [docs Stripe — cartes de test](https://docs.stripe.com/testing#cards).

## Webhook en local

La confirmation du paiement (passage à `PAID`/`PUBLISHED`) dépend du webhook
Stripe, pas de la redirection navigateur seule. En local, il faut faire
tourner :

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

et reporter le secret `whsec_...` affiché dans `STRIPE_WEBHOOK_SECRET`
(`apps/api/.env`) — sinon la carte passe mais l'app reste bloquée sur
"paiement en cours de confirmation".
