# Règles d'accessibilité

Engagements pris dès la conception du design system (mission §11, §16, §27 : conformité RGAA/WCAG).

## Engagements

- **Contraste** : WCAG AA (4.5:1) minimum sur tout texte, AAA (7:1) visé pour les scores et données consultées en extérieur — vérifié pour chacune des 3 directions avant choix final (Direction C identifiée comme la plus à risque, cf. `visual-language.md`).
- **Couleur jamais seule** : chaque information de statut (direct, qualification, victoire/défaite, conflit) est doublée d'un texte ou d'une icône — règle détaillée dans `colors.md`.
- **Cibles tactiles** : 44×44px minimum, espacement 8px minimum entre cibles adjacentes.
- **Focus clavier visible** systématiquement, jamais supprimé pour des raisons esthétiques.
- **Labels explicites** sur toute icône interactive seule (favori, notification, partage) — point faible identifié dans l'audit de la référence (`docs/product/opportunities.md`, absence de libellé visible sur ces boutons).
- **Navigation clavier complète** sur le site public et l'administration (tabulation logique, pas de piège de focus dans les modales).
- **`prefers-reduced-motion`** respecté (cf. `motion-guidelines.md`).
- **Textes alternatifs** sur tous les logos d'équipe/sponsors.
- **Échelle de police système respectée** côté mobile (Dynamic Type iOS, échelle Android), jamais de tailles figées empêchant l'agrandissement utilisateur.

## Plan de test (renvoi)

Le détail des scénarios de test d'accessibilité (outils utilisés, écrans prioritaires, critères de passage) sera formalisé dans `docs/testing/accessibility-test-plan.md` lors des PR de développement correspondantes — hors périmètre de cette PR de design.
