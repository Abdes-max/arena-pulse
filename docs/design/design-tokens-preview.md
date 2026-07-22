# Design tokens — aperçu initial

Mission §15 : catégories de tokens à couvrir, partagées entre admin web, site public, mobile, e-mails. Ceci est un **aperçu documentaire** des catégories et de leur structure prévue — l'implémentation en code (`libs/design-tokens/`) est prévue pour `feat/004-design-system-foundation`, une fois la direction artistique choisie.

## Catégories (mission §15)

| Catégorie | Statut dans cette PR | Détail |
| --- | --- | --- |
| `colors` | Proposé par direction (3 variantes) | `docs/design/colors.md`, `visual-language.md` |
| `typography` | Proposé par direction (3 variantes) | `docs/design/typography.md` |
| `spacing` | Proposé, commun aux 3 directions | Échelle 4px : 4/8/12/16/24/32/48/64/96px |
| `sizing` | Proposé, commun | Cibles tactiles 44px min, largeurs de conteneur par breakpoint (`responsive-guidelines.md`) |
| `radii` | Variable par direction | A : 4-6px · B : 10-14px · C : angles chanfreinés (cf. `visual-language.md`) |
| `borders` | Commun | 1px par défaut, 2px sur les éléments de statut/sélection |
| `shadows` | Commun, volontairement discret | Mission §11 : éviter les ombres lourdes — une seule échelle sobre (sm/md/lg) |
| `opacity` | Commun | États désactivés 40%, overlays 60% |
| `breakpoints` | Commun | `docs/design/responsive-guidelines.md` |
| `motion` | Commun | `docs/design/motion-guidelines.md` (durées, easing) |
| `z-index` | Commun | Échelle standard (base/dropdown/modal/toast/diaporama) |
| `charts` | Commun, teintes ajustées par direction | Palette catégorielle accessible (cf. `docs/architecture` futur `realtime-strategy`/visualisation) |
| `sports-statuses` | Commun, teintes ajustées par direction | À venir / En direct / Terminé / Reporté / Annulé / Qualifié / Éliminé (cf. `colors.md`) |

## Exemple de structure (illustratif, pas encore implémenté)

```json
{
  "color": {
    "brand": { "primary": "{direction}", "accent": "{direction}" },
    "surface": { "background": "{direction}", "card": "{direction}" },
    "status": { "live": "{direction}", "qualified": "#16A34A", "eliminated": "#64748B" }
  },
  "space": { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px" },
  "radius": { "sm": "4px", "md": "8px", "lg": "14px" },
  "motion": { "fast": "150ms", "base": "250ms", "emotional": "600ms" }
}
```

## Prochaine étape

Une fois une direction choisie (ou un hybride défini), ce fichier sera remplacé par l'implémentation réelle des tokens dans `libs/design-tokens/` (`feat/004-design-system-foundation`), avec une valeur unique par token (plus de variantes A/B/C).
