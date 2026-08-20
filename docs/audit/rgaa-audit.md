# Audit d'accessibilité numérique (RGAA 4.1 / WCAG 2.1 AA) — arena-pulse

**Date** : 20 août 2026
**Périmètre** : site public (`apps/web/src/app/pages`, `shell/tournament-shell`), panneau organisateur (`apps/web/src/app/admin`), panneau super-admin (`apps/web/src/app/super-admin`), application mobile native iOS/Android (`apps/mobile`), design system partagé (`libs/design-system`, `libs/design-tokens`).
**Méthode** : revue de code exhaustive (templates, composants, styles, tokens de couleur), calcul de ratios de contraste WCAG sur les paires de couleurs clés de chaque thème. Les vérifications navigateur complémentaires prévues sur le site de production n'ont pas pu être menées (voir `docs/audit/securite-audit.md`, incident TLS observé pendant l'audit) — ce rapport repose donc sur l'analyse du code source.

Constat général : le design system de base (`ap-badge`, `ap-logo`, `ap-share-button`, `ap-text-field`, `ap-theme-mode-toggle`) est manifestement déjà pensé pour l'accessibilité (commentaires de code documentant des corrections de contraste antérieures, `aria-hidden` systématique sur les SVG décoratifs, `alt=""` correct sur les logos redondants avec le texte). Les problèmes ci-dessous sont donc des angles morts précis plutôt qu'une absence générale de démarche.

---

## Résumé exécutif

| Gravité | # |
| --- | --- |
| Bloquant | 2 |
| Majeur | 5 |
| Mineur | 7 |

---

## Constats — Bloquant

### [BLOQUANT] Aucun retour visible ni sonore quand un formulaire invalide est soumis
- **Fichier** : `apps/web/src/app/admin/pages/tournaments/tournament-form.page.ts:329-333`, `apps/web/src/app/admin/pages/login/login.page.ts:32-35`, `apps/web/src/app/admin/pages/register/register.page.ts:36-40`, `apps/web/src/app/pages/contact/contact.page.ts:37-41` (même motif sur au moins 10 formulaires du repo, y compris `super-admin-login.page.ts`, `pages/register/register.page.ts`, `pages/player-auth/{login,register}`, `admin/pages/accept-invitation`)
- **Thème RGAA** : 11. Formulaires
- **Problème** : `submit()` est implémenté partout comme `if (this.form.invalid || this.submitting()) { return; }`, sans jamais appeler `markAllAsTouched()`, définir de message d'erreur, ni déplacer le focus. Exemple concret : pour créer un tournoi (`name`/`sportId` requis), cliquer sur « Créer » avec le nom vide ne produit strictement rien de perceptible — ni message, ni champ marqué invalide visuellement ou pour un lecteur d'écran.
- **Recommandation** : à la soumission d'un formulaire invalide, appeler `form.markAllAsTouched()`, afficher un message d'erreur global (`role="alert"`) et/ou des erreurs par champ via `ap-text-field[errorMessage]`, et déplacer le focus vers le premier champ en erreur.

### [BLOQUANT] Aucune indication visuelle/ARIA des champs obligatoires dans `ap-text-field`/`ap-select`
- **Fichier** : `libs/design-system/src/lib/text-field/text-field.html:1-60`, `libs/design-system/src/lib/text-field/text-field.ts:39-56`, `libs/design-system/src/lib/select/select.html:1-21`
- **Thème RGAA** : 11. Formulaires (11.7 — identification des champs obligatoires)
- **Problème** : ni `TextField` ni `Select` n'exposent d'input `required`, ni ne rendent d'attribut `required`/`aria-required` sur l'élément natif, ni d'indication dans le `<label>`. Combiné au constat précédent, l'utilisateur n'a aucun moyen de savoir qu'un champ comme « Nom » ou « Sport » est obligatoire avant l'échec silencieux de soumission.
- **Recommandation** : ajouter un input `required` à `ap-text-field`/`ap-select`, le refléter par `[attr.required]`/`[attr.aria-required]="true"` sur l'élément natif, et par un indicateur visuel non uniquement coloré dans le label.

---

## Constats — Majeur

### [MAJEUR] `<html lang>` figé sur « fr », jamais mis à jour par le sélecteur de langue
- **Fichier** : `apps/web/src/index.html:2` (`<html lang="fr">`), `libs/design-tokens/src/lib/language.service.ts:57-64`
- **Thème RGAA** : 8. Consultation / 12. Navigation
- **Problème** : `LanguageService.setLanguage()` appelle `TranslocoService.setActiveLang()` et persiste en `localStorage`, mais ne touche jamais `document.documentElement.lang` (aucune occurrence de `documentElement.lang`/`setAttribute('lang', ...)` dans tout le repo). Un utilisateur qui passe l'app en anglais/espagnol via `ap-language-switcher` continue d'avoir un document marqué `lang="fr"` : un lecteur d'écran prononcera le contenu traduit avec le mauvais moteur de synthèse vocale.
- **Recommandation** : dans `LanguageService.setLanguage()`, faire `document.documentElement.lang = code` en plus de `setActiveLang`.

### [MAJEUR] Panneau super-admin : aucun lien d'évitement (« Aller au contenu »)
- **Fichier** : `apps/web/src/app/super-admin/shell/super-admin-shell.html:1-101`
- **Thème RGAA** : 12. Navigation (12.7 — lien d'évitement)
- **Problème** : `app-shell.html` (admin organisateur) et `tournament-shell.html` (site public) ont tous deux un `.skip-link` vers `#main-content`. `super-admin-shell.html` n'en a aucun — un utilisateur clavier doit traverser tout le header avant d'atteindre le contenu de chaque page.
- **Recommandation** : ajouter le même `<a class="skip-link" href="#main-content">` que les deux autres shells, et un `id="main-content" tabindex="-1"` sur le `<main>`.

### [MAJEUR] Classements/calendrier en temps réel sans région `aria-live`
- **Fichier** : `apps/web/src/app/core/tournament-context.service.ts:14,26-42`, `apps/web/src/app/pages/standings/standings.page.html`
- **Thème RGAA** : 7. Scripts (contenu dynamique)
- **Problème** : le flux SSE (`TournamentEventStream`) rafraîchit silencieusement classements/calendrier dès qu'un score change. Aucune occurrence d'`aria-live` dans `apps/web/src` ni `libs/design-system`. Un utilisateur de lecteur d'écran consultant un classement pendant un match en direct n'est jamais informé d'un changement.
- **Recommandation** : envelopper la zone de classement (ou au moins le badge « live »/dernier résultat) dans une région `aria-live="polite"`, avec un texte concis annonçant la mise à jour.

### [MAJEUR] Thème Pulse Ember : `--ap-color-muted` sous le seuil de contraste AA
- **Fichier** : `libs/design-tokens/src/styles/_pulse-ember.scss:16` (`--ap-color-muted: #8a7367`) vs `:13` (`--ap-color-bg: #fffbf7`) et `:14` (`--ap-color-surface: #ffffff`)
- **Thème RGAA** : 3. Couleurs (contraste)
- **Problème** : ratio calculé `#8a7367` sur `#fffbf7` = **4.31:1**, sur `#ffffff` = **4.44:1** — les deux sous le seuil 4.5:1 requis pour du texte normal. Seul token `--ap-color-muted` des 5 thèmes à échouer (ink-signal 4.55–4.76, fresh-pitch 4.64–4.86, crimson-charge 4.96–5.21, neon-court 5.50–5.90 — tous ≥4.5). Les autres tokens de ce thème ont déjà été assombris pour passer l'AA (voir commentaires du fichier), mais `--ap-color-muted` a été oublié. Utilisé pour les libellés secondaires, dates, texte de statut des badges.
- **Recommandation** : assombrir `--ap-color-muted` en Pulse Ember (ex. ~#7a6055 ou plus foncé) jusqu'à ≥4.5:1.

### [MAJEUR] Tableaux de données sans `<th scope>` ni `<caption>`
- **Fichier** : `apps/web/src/app/pages/standings/standings.page.html:38-66,306-313` ; `apps/web/src/app/admin/pages/standings/standings.page.html` ; `apps/web/src/app/admin/pages/print-export/print-export.page.html:34-113` ; `apps/web/src/app/super-admin/pages/payments/super-admin-payments.page.html:11-20`
- **Thème RGAA** : 5. Tableaux
- **Problème** : aucun `<th>` de ces tableaux (classements, calendrier, historique paiements) n'a d'attribut `scope="col"`, et aucun tableau n'a de `<caption>` ni de légende équivalente (recherche exhaustive : zéro occurrence de `scope=`/`<caption` dans `apps/web/src`).
- **Recommandation** : ajouter `scope="col"` (et `scope="row"` où pertinent), et un `<caption>` (visible ou masqué visuellement) décrivant chaque tableau.

---

## Constats — Mineur

### [MINEUR] Cibles tactiles sous 44×44px sur plusieurs contrôles interactifs (web)
- **Fichier** : `libs/design-system/src/lib/theme-mode-toggle/theme-mode-toggle.scss:23-24` (24px de haut) ; `libs/design-system/src/lib/text-field/text-field.scss:108` (steppers ≈22px) ; `apps/web/src/app/pages/standings/standings.page.scss:219-224` (pagination 32×32px) ; `libs/design-system/src/lib/share-button/share-button.scss:9-11` (≈34×34px)
- **Thème RGAA** : 8. Consultation (taille des cibles)
- **Problème** : `--ap-touch-target-min: 44px` est bien défini et appliqué à `ap-text-field__input`, mais pas à ces contrôles plus petits.
- **Recommandation** : appliquer la même contrainte min-width/min-height, ou agrandir le padding cliquable sans changer la taille visuelle.

### [MINEUR] `ap-tabs` : rôle ARIA `tab`/`tablist` sans le comportement clavier attendu
- **Fichier** : `libs/design-system/src/lib/tabs/tabs.html:1-14`
- **Thème RGAA** : 7. Scripts
- **Problème** : pas de roving `tabindex`, pas de gestion des flèches gauche/droite entre onglets, pas de `aria-controls` reliant onglet et panneau.
- **Recommandation** : implémenter le pattern clavier complet, ou retirer les rôles ARIA `tablist`/`tab` si le composant reste un simple groupe de boutons de filtre.

### [MINEUR] Menus hamburger mobiles sans fermeture au clavier (Échap)
- **Fichier** : `apps/web/src/app/admin/shell/app-shell.ts:159`, `apps/web/src/app/super-admin/shell/super-admin-shell.ts:34`, `apps/web/src/app/shell/tournament-shell.ts:100`
- **Thème RGAA** : 7. Scripts / 12. Navigation
- **Problème** : contrairement à `ap-language-switcher` (qui gère `keydown.escape`), aucun des 3 shells ne ferme son menu mobile via Échap.
- **Recommandation** : ajouter un gestionnaire `keydown.escape` qui referme le menu et rend le focus au bouton hamburger.

### [MINEUR] Disclosure équipe (super-admin) sans `aria-controls`
- **Fichier** : `apps/web/src/app/super-admin/pages/tournaments/super-admin-tournament-detail.page.html:60-69`
- **Thème RGAA** : 7. Scripts
- **Problème** : le bouton disclosure qui déplie la liste des joueurs a bien `[attr.aria-expanded]`, mais pas de `aria-controls` pointant vers le panneau déplié.
- **Recommandation** : donner un `id` au bloc de contenu déplié et le référencer via `[attr.aria-controls]`.

### [MINEUR] Mobile natif — cibles tactiles sous 44pt/48dp (round-pager, thème, retour, partage)
- **Fichier** : `apps/mobile/src/app/pages/standings/standings.page.scss:154-166` (32×32px) ; `libs/design-system/src/lib/theme-mode-toggle/theme-mode-toggle.scss:19-24` (zone cliquable réelle ≈24px de haut) ; `apps/mobile/src/app/shell/tournament-shell.scss:42-49` et `libs/design-system/src/lib/share-button/share-button.scss:5-25` (≈34×34px)
- **Thème RGAA/WCAG** : 11.10 / WCAG 2.5.8 Target Size
- **Problème** : mêmes composants que le constat web ci-dessus, particulièrement visibles côté mobile natif où l'écran tactile est le seul mode d'interaction (pas de clavier/souris de secours).
- **Recommandation** : identique — porter ces cibles à au moins 44×44px/pt.

### [MINEUR] Mobile natif — double arrêt clavier redondant sur la ligne « Partager » (Paramètres)
- **Fichier** : `apps/mobile/src/app/pages/tournament-entry/tournament-entry.page.html:204-229`, `libs/design-system/src/lib/share-button/share-button.html:1-8`
- **Thème RGAA** : 7. Scripts (navigation clavier)
- **Problème** : la ligne « Partager » est un `div role="button" tabindex="0"` englobant `<ap-share-button>`, lui-même un vrai `<button>` interne toujours focusable au clavier (désactivé seulement en pointeur via CSS). Deux arrêts de tabulation consécutifs pour la même action.
- **Recommandation** : ajouter `[attr.tabindex]="-1"` sur `<ap-share-button>` dans ce contexte englobé.

### [INFO] Points vérifiés conformes — mobile natif
- `apps/mobile/src/index.html` : `lang="fr"` présent, viewport sans blocage de zoom (pas de `maximum-scale=1`/`user-scalable=no`).
- Typographie exclusivement en `rem` (aucun `px` trouvé dans `apps/mobile/src/app/**/*.scss`) — compatible Dynamic Type/Font scale.
- Boutons icône-seule audités (partage, thème, langue, retour, favoris, réglages) : tous disposent d'un `aria-label` correct et dynamique.
- Round-pager : alternative clavier/tap complète et bien annoncée aux gestes de swipe.

---

## Annexe — calculs de contraste (thèmes, `--ap-color-muted` sur fond clair)

| Thème | Couleur muted | Fond | Ratio | Seuil AA (texte normal) |
| --- | --- | --- | --- | --- |
| ink-signal | — | — | 4.55–4.76 | ✅ |
| fresh-pitch | — | — | 4.64–4.86 | ✅ |
| crimson-charge | — | — | 4.96–5.21 | ✅ |
| neon-court | — | — | 5.50–5.90 | ✅ |
| **pulse-ember** | `#8a7367` | `#fffbf7` / `#ffffff` | **4.31 / 4.44** | ❌ (< 4.5) |

## Annexe — méthode et limites

- Revue de code exhaustive (recherche par motifs sur `aria-live`, `scope=`, `<caption`, `required`, `lang`, `skip-link`, tailles de cibles tactiles dans les feuilles de style) plutôt que test manuel au lecteur d'écran (VoiceOver/TalkBack/NVDA) sur l'application déployée.
- Les vérifications navigateur complémentaires prévues sur le site de production (ordre de focus observé, rendu réel des contrastes, comportement des lecteurs d'écran) n'ont pas pu être menées : un incident TLS a empêché l'accès à `https://tournarena.com/` pendant l'audit (voir `docs/audit/securite-audit.md`). Les constats ci-dessus restent fondés sur l'analyse du code source et des calculs de contraste théoriques, pas sur une observation runtime.
- Cet audit ne remplace pas un test utilisateur avec des personnes en situation de handicap, requis pour une déclaration de conformité RGAA officielle.
