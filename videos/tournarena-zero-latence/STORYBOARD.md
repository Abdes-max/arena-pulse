---
format: 1080x1920
duration: 15s
message: "Un score saisi apparaît instantanément sur le site public — zéro latence."
arc: Hook → Feature showcase (comparison) → Benefit confirmation → CTA
audience: organisateurs de tournois sportifs (clubs, écoles, ligues amateurs)
mode: autonomous
music: none
---

## Video direction

- **Palette system** (from `frame.md`, hand-corrected to TournArena's own "Ink & Signal" dark
  mode — see that file's header comment): ground `{colors.ink-black}` #0B1220, card surface
  `{colors.ink-black-alt}` #141B2E, hairlines `{colors.border-dark}` #1F2A44, text
  `{colors.cream}` #E7ECF5, muted text `{colors.cream-muted}` #94A3B8, the single accent
  `{colors.fire-orange}` (role name inherited from the preset; the actual hex is signal-blue
  #38BDF8) — one accent only, no second hue, per the pack's own rule.
- **Motion grammar**: long-tail `power3` eases throughout (no bounce except the one earned
  overshoot in Frame 2's badge-pop). Reveal model: since this video is silent (no voiceover —
  see `music: none` + no `SCRIPT.md`), each frame's Scenes are paced to the BEAT structure
  itself instead of spoken cues — nothing appears before its narrative turn, exactly the same
  anti-front-load discipline the VO-paced model enforces, just cued to the shot's own beats.
- **Rhythm**: Frame 1 is a fast flash-hook (no held middle). Frame 3 is this video's deliberate
  held breather — the payoff line lands and just sits, no further motion, between Frame 2's busy
  split-cards and Frame 4's settle-and-reveal close.
- **Negative list**: no bounce/spring outside Frame 2's one badge-pop; no camera drift/push on
  any frame (comparison-split is camera-static by rule; the others are flat/centered); no
  floating bokeh or generic "AI" gradient; no browser chrome / real cursor; no front-load-then-
  freeze and no screensaver (independently-floating, uncomposed elements).
- **Caption-band keep-out**: captions are not generated for this project (no narration), but
  every frame still keeps its content in the top ~83% of the canvas for bottom-edge consistency
  with the rest of the site's own components.

## Frame 1 — Hook

- scene: Massive lowercase Barlow display crashes in on the dark ground: "0 seconde d'attente."
- voiceover:
- duration: 2s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Pain validation (silently contradicts the refresh-and-wait expectation every organizer has)
- beat: curiosity
- blueprint: kinetic-type-beats (Adapt)
- asset_candidates:

Open cold on the promise — no product shot yet, just the claim, at full display scale (13cqw territory), lowercase, negative-tracked, on the ink-black ground with the signal-blue accent doing the work on the number/percent.

Adapt: fixed-line flash-in sub-shape, single beat (no escalation, no word-swap — the line is short enough to land whole).

Scene 1 (0.0–0.3s): flat ink-black field. "0" hard-cut FLASHES in dead-center at `display` scale (13cqw), signal-blue, no fade/slide — Centered, ~40% of frame.
Scene 2 (0.3–2.0s): "seconde d'attente." lands beside/beneath it via a fast per-word staggered fade (each word ~0.1s apart) in cream at `h1` scale, completing the line lowercase, negative-tracked — Centered, now ~55% of frame, 2 depth layers (numeral foreground, line midground). Holds static from ~1.2s to the cut — no breathing, no drift.

## Frame 2 — Comparison

- scene: Split-screen, two equal panels divided by a 1px vertical rule — left panel shows an organizer entering a score inside the TournArena admin (styled UI recreation, dark surface, score input mid-tap); right panel shows the tournament's public site already displaying that same score, live-badge pulsing green.
- voiceover:
- duration: 6s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-comparison.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: relief + control
- blueprint: comparison-split (Adapt)
- asset_candidates:

Both panels are CSS-built UI recreations using frame.md's own tokens (surface #141B2E, border #1F2A44, signal #38BDF8) rather than a captured screenshot — the private organizer flow sits behind login and was never in the crawl, and asset-descriptions.md has no matching UI asset for either surface. Keep both panels' chrome minimal (a score row, a live badge) so the split reads instantly at a glance on a 9:16 phone screen. This is the proof beat — the whole video's claim lives here.

Adapt: single accent color stands in for the blueprint's "accent A / accent B" pair (the pack has only one accent, signal-blue — both side-glows use it, differentiated by a mono `label` chip instead of hue: "ORGANISATEUR" left, "PUBLIC" right). Content is a UI card, not an image/label/subtitle triple — keeps the mirrored-tilt signature move and inner-edge badge pop.

Scene 1 (0.0–0.8s): centered kicker "zéro rafraîchissement" (the word "zéro" in signal-blue) slides DOWN into place from just above on the ink-black field, two faint signal-blue ambient glow blooms seated at 30%/70% — Centered, ~25% of frame.
Scene 2 (0.8–2.3s): left card — mono `label` chip "ORGANISATEUR", one score row ("Les Aigles · 3–1") mid-edit with a soft focus ring on the score field — arrives from the left wing with a mirrored `rotateY` tilt (+tilt), scaling ~0.85→1, shadow falling right. Split-screen, left half, 2 depth layers.
Scene 3 (1.0–2.5s, ~0.2s behind Scene 2): right card — mono `label` chip "PUBLIC", the SAME score row already showing "3–1" — arrives from the right wing with the mirrored tilt (−tilt), shadow falling left; the two entries overlap so the whole thing reads as one arrival, not two beats. Split-screen, right half, symmetry axis at 50%.
Scene 4 (2.5–3.2s): a small green-dot "EN DIRECT" pill badge lands at the right card's inner edge (~0.3s spring-pop, the one earned overshoot in this video), overlapping the card ~15%.
Scene 5 (3.2–6.0s): both cards hold, settled, with a gentle phase-opposed idle float (left `sin(t)`, right `sin(t+π)`) — low-amplitude, reads as alive, never synchronized, never a lazy breathing scale.

## Frame 3 — Confirmation

- scene: Statement frame, ink-black ground, cream text with ONE clause inked in signal-blue: "le score est saisi. le public le voit."
- voiceover:
- duration: 4s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-confirmation.html
- type: benefit_highlight
- persuasion: Feature-to-benefit translation
- beat: confidence
- blueprint: titlecard-reveal (Reproduce)
- asset_candidates:

Restates Frame 2's demonstration as a plain declarative line — the payoff, not a new claim. One clause ("le public le voit") carries the accent color; the rest stays cream.

This is the video's deliberate held breather (see Video direction) — the calmest frame between Frame 2's busy split and Frame 4's settle-and-reveal.

Scene 1 (0.0–0.4s): static camera on the ink-black field, empty-to-text — nothing on screen yet.
Scene 2 (0.4–1.8s): "le score est saisi." fades in centered while scaling ~95%→100% (smooth power3 ease-out), cream, `h2` scale. Holds.
Scene 3 (1.8–4.0s): the line translates up and fades out as "le public le voit." (the clause "le voit." inked signal-blue, rest cream) translates up from below-center and fades in to take its place — the single slide-up crossfade IS the one move. Holds static to the cut.

## Frame 4 — Brand outro / CTA

- scene: TournArena wordmark lockup (icon mark + "TournArena" set in Space Grotesk, signal-blue "Arena") centered, "tournarena.com" beneath it, small "Conçu par Kelto Studio" credit line at the very bottom.
- voiceover:
- duration: 3s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-outro.html
- type: cta
- persuasion: Authority by association (the Kelto Studio credit, small and secondary) + direct CTA
- beat: inevitability
- blueprint: logo-assemble-lockup (Adapt)
- asset_candidates:

Logo built as an inline SVG lockup matching frame.md's own tokens (same mark as `apps/web/public/favicon.svg`, recolored for the dark register — see the launch poster in `docs/marketing/launch/` for the exact precedent), not a captured asset. Kelto Studio's own mark (`sites/kelto-studio/brand/kelto-mark.svg`) appears small, bottom-right, same treatment as the poster.

Adapt: the Brand_Outro `settled-lockup-reveal` variant — no predecessor beat, no morph chain (this frame is only 3s; a full assemble build doesn't fit). Fits our short closing card cleanly: the lockup is already there, decorations leave, the URL completes it.

Scene 1 (0.0–0.4s): the TournArena icon mark + "TournArena" wordmark lockup is already centered at t=0, slightly small, with 3–4 faint signal-blue satellite dots drifting loosely around it.
Scene 2 (0.4–1.6s): the satellite dots drift further outward and fade to 0; the lockup settles to its final scale and shifts slightly up-center to leave room below — Centered, ~35% of frame.
Scene 3 (1.6–3.0s): "tournarena.com" fades/wipes in beneath the lockup (mono `label` scale); the small "Conçu par Kelto Studio" credit line + Kelto mark fade in last, bottom edge, lowest visual weight. Holds static to the end.
