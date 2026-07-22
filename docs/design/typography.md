# Typographie

Les 3 paires de polices par direction sont détaillées dans `visual-language.md`. Ce document fixe l'échelle et les règles communes (mission §17).

## Échelle type (commune, valeurs en rem, base 16px)

| Style | Taille | Graisse | Usage |
| --- | --- | --- | --- |
| Display / Nom du tournoi | 2.5–3.5rem fluide | 600-900 (selon direction) | Hero de la page d'accueil publique, écran de diaporama |
| Titre de section | 1.5–2rem | 600-700 | En-têtes de page, titres de phase |
| Score | 1.75–3rem selon contexte | 600-700, **chiffres tabulaires obligatoires** | Cartes de match, brackets |
| Nom d'équipe | 0.875–1.125rem | 500-600 | Troncature avec titre complet au survol/tap (répond à un point faible observé dans l'audit, cf. `opportunities.md`) |
| Statut / Badge (LIVE, qualifié...) | 0.75rem | 600-700, majuscules, tracking large | Toujours accompagné d'une icône |
| Corps de texte | 1rem (16px) | 400 | Jamais en dessous de 0.875rem pour du texte de lecture |
| Information secondaire | 0.875rem | 400-500 | Légendes, horaires, lieux |
| Bouton | 0.875–1rem | 600 | |
| Message d'erreur | 0.875rem | 500 | Toujours associé à une icône, jamais la couleur seule |

## Règles transverses

- **Chiffres tabulaires obligatoires** (`font-variant-numeric: tabular-nums` ou équivalent) pour tous les scores et classements, afin que les colonnes de chiffres restent alignées (mission §17).
- **Hauteur de ligne** : 1.5 pour le corps de texte, 1.1-1.2 pour les titres d'affichage/scores.
- **Tailles fluides** (`clamp()` en web) entre mobile et desktop plutôt que des breakpoints figés pour les titres d'affichage.
- Une police d'impact (display) ne doit jamais être utilisée pour du texte de lecture continue (répété de `visual-language.md` pour la Direction C, mais vaut pour toutes).
- Respect strict de l'échelle système iOS/Android (Dynamic Type / échelle de police système) côté mobile — ne jamais coder les tailles en pixels durs sans respecter la mise à l'échelle système (accessibilité).
