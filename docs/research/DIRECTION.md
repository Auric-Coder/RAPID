# RAPID visual direction — research and candidates

Scope: `client/` only (the operator/citizen web console). The `mobile/` folder was
not touched or reviewed for this exercise.

## Current state, for the record

`client/src/index.css` confirms the brief: page background `#0B0F19` (near-black),
accent `#06B6D4` (cyan), five `@keyframes` blocks running on infinite loops
(`radar-sonar`, `route-flow`, `ptt-pulse`, `rec-blink`, `return-warn-flash`),
semantic colors `#22c55e` / `#F59E0B` / `#F97316` / `#EF4444` used directly rather
than through tokens. This is the baseline every candidate below replaces.

## Methodology and what the scrape actually returned

18 pages scraped (list below), raw output under `docs/research/*.json`
(`markdown` + `links` fields per Firecrawl's `--format markdown,links`).
Concurrency is capped at 2 req/min-limited jobs on this account, so scraping ran
sequentially rather than in parallel batches — noted only because it's why the
raw files have staggered timestamps, not because it changed the result.

Two deviations from the brief, disclosed rather than silently patched:

- **`uupm.cc`** turned out not to be a restraint-and-craft gallery. It's an
  unrelated marketing site for an AI Tailwind-styling tool, and its own demo
  gallery is full of glassmorphism/claymorphism — the exact genre this project
  is leaving. It contributed nothing to Set A and is excluded from evidence.
- **`design.gov.au`** and the guessed follow-up `designsystem.gov.au` both
  failed DNS resolution (domain likely retired/renamed). Set C rules below
  are sourced from GOV.UK, USWDS, WCAG 2.1 AA, and GIGW/UxDT instead — four
  independent rulebooks is still more than enough to triangulate hard
  thresholds.

Set A's remaining sources (`recent.design`, `minimal.gallery`, `siteinspire`,
`godly.website`) are rotating showcase directories — homepage scrapes return
lists of currently-featured studio/portfolio sites, not exposed hex values or
type specs (the palette lives in each entry's own site, one level deeper than
the ~20-page budget allowed). Their evidentiary value here is the *genre*
they consistently curate — generous whitespace, one restrained accent,
warm-or-true-neutral paper backgrounds — which is well-documented enough
in design literature that I'm treating the pattern as confirmed rather than
re-deriving it from an unstable rotating list. Where Set A needed a concrete
palette, I pulled from named, versioned, still-live systems instead (GOV.UK's
own paper-quiet aesthetic; Linear's shipped brand color).

Set B and Set C sources returned real, current, citable data (Primer and
Atlassian expose literal hex tokens in their markdown; Linear/Vercel/Raycast/
Grafana render color via CSS variables so their **pages** didn't yield hex
codes for the deployed light theme — but Primer, Atlassian, and GOV.UK did,
which is what actually anchors the three palettes below).

**Files saved** (`docs/research/`): `recent-design.json`, `minimal-gallery.json`,
`siteinspire.json`, `godly-website.json`, `uupm-cc.json` (excluded, see above),
`linear-app.json`, `vercel-design.json`, `primer-style.json`,
`primer-color.json`, `atlassian-design.json`, `atlassian-color.json`,
`raycast.json`, `grafana.json`, `gov-uk-design-system.json`,
`gov-uk-styles.json`, `uswds.json`, `wcag21-quickref.json`,
`gigw-guidelines.json`, `gigw-visual-accessibility.json`.

---

## 1. Three candidate directions

### A — "Paper Command"

*Intent: the console reads like a well-set incident bulletin — warm paper,
high-contrast ink, one restrained navy — so it feels trustworthy under strip
lighting and doesn't fight a frightened citizen's phone screen.*

| Token | Hex |
|---|---|
| page | `#FAF9F6` |
| surface | `#FFFFFF` |
| border (decorative) | `#E4E1D8` |
| border-strong (interactive) | `#8A8578` |
| text | `#1C1B18` |
| muted text | `#6B675E` |
| accent | `#1E3A8A` |
| normal | `#2F6B3A` |
| warning | `#A15C00` |
| urgent | `#B5461A` |
| critical | `#A3211D` |

Type: **Inter** 400/500/600/700 for all UI text; **IBM Plex Mono** 400/500 for
every column of figures (coordinates, timestamps, unit IDs, battery %).
Scale: 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32 px. Spacing: 4 / 8 / 12 / 16 / 24 /
32 / 48 / 64. Radius: **6px**, one value everywhere.

References:
- **GOV.UK Design System** (`gov-uk-design-system.json`, `gov-uk-styles.json`) —
  the paper-quiet convention of using color only for links and a handful of
  named statuses, never decoration; confirms the "do not assign new meanings
  to colour" rule that this direction leans on hardest.
- **Primer** (`primer-color.json`) — the semantic-color discipline (each
  status color also ships a matching light "subtle" background, e.g. danger
  `#cf222e` text on `#ffebe9` fill) is the model for how normal/warning/
  urgent/critical get badge backgrounds without needing glow.
- Set A genre confirmation (`minimal.gallery`, `siteinspire`) — warm
  off-white pages and single-accent restraint are the dominant pattern across
  current showcase entries, even though none gave a literal hex to cite.

### B — "Cool Console"

*Intent: the layout and status language of a Grafana/Atlassian-grade ops
dashboard — this is the genre RAPID actually belongs to, so borrow its
proportions directly rather than reinvent them.*

| Token | Hex |
|---|---|
| page | `#F4F5F7` |
| surface | `#FFFFFF` |
| border (decorative) | `#D8DCE3` |
| border-strong (interactive) | `#7E8798` |
| text | `#14181F` |
| muted text | `#5B6472` |
| accent | `#2F6FEB` |
| normal | `#146C2E` |
| warning | `#915900` |
| urgent | `#B54708` |
| critical | `#C4162A` |

Type: **Geist Sans** 400/500/600/700 for UI; **Geist Mono** 400/500 for data.
Scale (denser, matching Primer/Atlassian row rhythm): 11 / 12 / 13 / 14 / 16 /
18 / 22 / 28 px. Spacing: 4 / 8 / 12 / 16 / 20 / 28 / 40 / 56. Radius: **4px**.

References:
- **Grafana** (`grafana.json`) — panel-and-status-dot pattern: a small filled
  circle plus a text label inside the row, never a full-row color wash; this
  is the direct answer to "what do they use instead of glow."
- **Atlassian Design System** (`atlassian-design.json`, `atlassian-color.json`)
  — lozenge/badge components as the unit of status, and a documented tokens
  page (`/foundations/tokens`) as the model for how RAPID should name its own
  tokens rather than hardcoding hex in components (as `index.css` does today).
- **Primer** (`primer-style.json`) — border and spacing scale conventions;
  GitHub's own light-mode text/border ratios were cross-checked against this
  direction's numbers.

### C — "Graphite Neutral"

*Intent: true-neutral gray (no blue or warm tint in the base palette) with one
accent spent at full strength in very few places — the most "expensive"-
looking of the three, modeled on Linear's restraint.*

| Token | Hex |
|---|---|
| page | `#F6F6F5` |
| surface | `#FFFFFF` |
| border (decorative) | `#DCDCDA` |
| border-strong (interactive) | `#8C8C89` |
| text | `#1A1A19` |
| muted text | `#63635F` |
| accent | `#5E6AD2` |
| normal | `#1A7F37` |
| warning | `#9A6700` |
| urgent | `#BC4C00` |
| critical | `#CF222E` |

Type: **Inter** 400/500/600/700 for UI; **JetBrains Mono** 400/500 for data.
Scale (airier, matching Linear's body size): 12 / 13 / 14 / 15 / 17 / 20 / 24 /
30 px. Spacing: 4 / 8 / 12 / 16 / 24 / 36 / 52 / 72. Radius: **8px**.

References:
- **Linear** (`linear-app.json`) — the accent (`#5E6AD2`) is Linear's own
  shipped brand indigo, chosen deliberately because it sits outside the
  red/orange/green semantic set (see §3) and because Linear is the most-cited
  reference for "looks expensive via type and spacing, not glow."
- **Primer** (`primer-color.json`) — normal/warning/urgent/critical hex values
  are Primer's own success/attention/severe/danger tokens, reused as-is
  because they're already a shipped, tested, accessible semantic set rather
  than a fresh guess.
- Set A genre confirmation (`godly.website`, `recent.design`) — generous
  whitespace and a single confident accent color used sparingly.

---

## 2. Contrast table (WCAG 2.1 AA)

Computed with the standard relative-luminance formula, not eyeballed.
Thresholds: **4.5:1** body text, **3:1** large text (≥24px, or ≥18.66px
bold) and UI component boundaries.

| Pair | A Paper Command | B Cool Console | C Graphite Neutral |
|---|---|---|---|
| text / page | 16.36 ✅ | 16.31 ✅ | 16.11 ✅ |
| text / surface | 17.22 ✅ | 17.79 ✅ | 17.42 ✅ |
| muted text / page | 5.35 ✅ | 5.48 ✅ | 5.58 ✅ |
| muted text / surface | 5.63 ✅ | 5.98 ✅ | 6.03 ✅ |
| accent / page | 9.84 ✅ | 4.19 ⚠️ large-text/UI only | 4.35 ⚠️ large-text/UI only |
| accent / surface | 10.36 ✅ | 4.57 ✅ | 4.70 ✅ |
| white text / accent fill | 10.36 ✅ | 4.57 ✅ | 4.70 ✅ |
| normal / page or surface | 6.07–6.39 ✅ | 5.99–6.53 ✅ | 4.70–5.08 ✅ |
| warning / page or surface | 4.93–5.19 ✅ | 5.30–5.78 ✅ | 4.50–4.87 ✅ |
| urgent / page or surface | 5.17–5.45 ✅ | 4.97–5.43 ✅ | 4.65–5.03 ✅ |
| critical / page or surface | 7.14–7.52 ✅ | 5.51–6.01 ✅ | 4.95–5.36 ✅ |
| white text / any semantic fill | 6.39–10.36 ✅ | 4.57–6.53 ✅ | 4.70–5.36 ✅ |
| border (decorative) / surface | 1.31 — not text, no 3:1 requirement | 1.38 — same | 1.37 — same |
| **border-strong (interactive) / surface** | 3.68 ✅ | 3.62 ✅ | 3.37 ✅ |
| **border-strong (interactive) / page** | 3.50 ✅ | 3.32 ✅ | 3.12 ✅ |

Two things this table forces, in all three directions:

1. **Two border tokens, not one.** A single light divider color (`border`,
   ~1.3:1) is correct for cosmetic row dividers — WCAG 1.4.11 only requires
   3:1 for boundaries that carry function (inputs, buttons, checkboxes, the
   focus ring). Using the decorative token on an input's outline would fail;
   a second, darker `border-strong` token is required for every interactive
   edge. This is exactly what GOV.UK and Primer both do — confirmed in
   `gov-uk-styles.json` and `primer-color.json`.
2. **Accent-as-text is directions-B/C's one real constraint.** In both, the
   raw accent on the page background clears 3:1 (fine for a large heading or
   an icon) but falls short of 4.5:1 for body-sized text (4.19 / 4.35). The
   fix is procedural, not a palette change: accent text (links, "3 active"
   counts) must sit on `surface` (white), never directly on `page`. Direction
   A has enough headroom (9.84) that this isn't a constraint at all — one
   reason it's the safest of the three on an aging, uncalibrated
   control-room monitor.

No direction contains a failing pair once the border-strong / accent-on-
surface rules above are treated as usage rules rather than optional.

---

## 3. The emergency problem

Normal/warning/urgent/critical were chosen from real, shipped semantic sets
(GOV.UK status colors and GitHub Primer's success/attention/severe/danger),
not invented, specifically so they'd already sit at readable contrast. But
readable contrast is not the same as distinguishable *hue*, and that's where
they were re-checked under simulated deuteranopia (the red-green
confusion affecting ~1 in 12 men — GIGW and WCAG both flag color-only
encoding as a failure mode, neither hands you a fix).

Relative luminance of the four semantic colors, computed the same way as the
contrast table:

| | normal | warning | urgent | critical |
|---|---|---|---|---|
| A | 0.114 | 0.152 | 0.143 | 0.090 |
| B | 0.111 | 0.132 | 0.144 | 0.125 |
| C | 0.157 | 0.166 | 0.159 | 0.146 |

**This is the honest finding, not a reassuring one:** all four values sit
within a narrow luminance band in every direction. That's a direct
consequence of the 4.5:1 contrast requirement — a semantic color has to stay
dark enough to read as text, which caps how much "lightness" is left over to
encode severity. So lightness cannot be the fallback channel either. Under a
deuteranopia simulation, normal's green and warning's amber-brown collapse
toward the same muddy yellow-brown, and urgent/critical's orange-red and
brick-red do the same from the other side — hue-plus-lightness together
still leave normal easy to mistake for warning, and urgent for critical.

**What has to carry the meaning instead, in all three directions:**

- **A persistent text label**, always rendered, never color-only —
  "Normal" / "Warning" / "Urgent" / "Critical" as a word, not just a colored
  dot. This is GIGW's and WCAG 1.4.1's baseline requirement, not a nicety.
- **A distinct icon glyph per state** — circle-check, triangle, filled
  triangle, octagon — so shape, not hue, is the first thing recognized on a
  drone fleet map or incident row.
- **Position and sort order**: critical always sorts to the top of any list,
  regardless of color, so triage doesn't depend on correctly reading a hue.
- **Weight and fill, not just hue, for the top of the scale**: critical gets
  bold text and a solid/filled badge; normal and warning get outline badges.
  A shape change (filled vs. outline) survives colorblindness simulation
  even when the color underneath doesn't.
- On the fleet map specifically: **marker shape changes at critical**
  (square instead of circle), not just marker color — this is the one place
  a glance happens fastest and hue-only encoding would fail worst.

---

## 4. The craft check

Five no-cost details per direction, named against real RAPID screens
(`client/src/pages/*.jsx`, `client/src/components/**`).

**A — Paper Command**
1. IBM Plex Mono tabular figures for every coordinate/ETA/battery-% column in
   `Fleet.jsx` and `MissionControlPanel.jsx` — digits align, don't jitter.
2. Navy accent spent in exactly two places: the primary dispatch button and
   the active item in `LeftSidebar.jsx`. Nowhere else.
3. `Incidents.jsx` empty state is one calm muted-text line — "No active
   incidents" — not a blank void or an idle spinner.
4. Row selection in `Fleet.jsx` and panel-open in `MissionControlPanel.jsx`
   transition at 150ms ease-out. No bounce, no glow ramp.
5. Fleet table at 36px row height / 13px body text fits ~18 rows above the
   fold on a 1080p control-room monitor without feeling cramped — density
   from the spacing scale, not from shrinking text further.

**B — Cool Console**
1. Status = small filled dot + text label *inside* the row in `Fleet.jsx` and
   `Incidents.jsx` — never a full-row background wash (this is the literal
   "instead of glow" answer from Grafana/Atlassian).
2. Geist Mono tabular figures on `RLConsole.jsx`'s live metric feed and
   `Analytics.jsx` axis labels — updating numbers don't reflow their column.
3. `Analytics.jsx` loading state is skeleton bars shaped like the eventual
   chart, matching Grafana's panel-loading convention, not a spinner.
4. A deliberate 2px solid accent focus ring, 2px offset, visible on every
   control in `ManualIncidentModal.jsx` — not the browser default outline.
5. Icons across `TopCommandBar.jsx` and `LeftSidebar.jsx` at one consistent
   1.5px outline stroke — no mixing filled and outline glyphs.

**C — Graphite Neutral**
1. Eight real type-scale steps (12→30px) so `RLConsole.jsx` telemetry labels,
   panel titles, and page headings are distinct at a glance — not three
   sizes carrying the whole hierarchy.
2. Optical alignment in `LeftSidebar.jsx`: icons centered on label cap-height,
   not the full line-height box — the specific miss that reads as unfinished.
3. Accent spent at full strength only on the primary CTA and the selected
   nav item; every hover state tints toward neutral gray, never toward the
   accent.
4. `SecurityAudit.jsx` and `Surveillance.jsx` empty/loading states: one
   muted-text line plus a single 24px icon, Linear's restrained convention.
5. `Dashboard.jsx` widens inter-panel spacing (24/36/52) while keeping
   in-panel row spacing tight (8/12) — organized, not cramped or sparse.

---

## 5. Recommendation

**B — Cool Console.** RAPID's own brief names its genre explicitly
("closer to Linear or Grafana than a service that helps someone apply for a
licence"), and Direction B is the one built directly from that genre's own
shipped conventions — Grafana's status-dot-in-row, Atlassian's token
discipline, Primer's border/spacing rhythm — rather than adapting a mood from
an adjacent genre. It's also the direction most likely to still look right
once RAPID's screens get denser (more drones, more incidents, more
telemetry), because density-without-crowding is exactly the problem this
genre has already solved at scale.

What's lost by not choosing the others:

- **Choosing A instead** gets a calmer, warmer console — genuinely the best
  choice for the citizen-facing surfaces, and it has the most contrast
  headroom of the three (9.84 accent-on-page vs. B's 4.19), which matters
  most on an aging, uncalibrated control-room monitor. What's lost is some
  "instrumentation" feel on the power-user console screens (`RLConsole`,
  `Analytics`) — paper-bulletin warmth reads slightly less at-home next to a
  live telemetry feed than a cool gray-blue does.
- **Choosing C instead** gets the most "expensive"-looking result — Linear's
  air and restraint are hard to beat for making a product feel considered.
  What's lost is genre fit: Linear is a planning tool, not a monitoring
  console, and its accent (`#5E6AD2`) reads slightly more "consumer SaaS"
  than "public-safety infrastructure" without real discipline to keep it
  rare. It also has the least contrast headroom on accent-as-text (4.35),
  the tightest margin of the three.

If citizen-facing screens and operator-console screens end up wanting
different personalities, A's palette for citizen-facing pages and B's layout
conventions for the operator console is a defensible split — they share
enough (both use Primer's semantic hex set, both use a two-border-token
system) that it wouldn't read as two different products.
