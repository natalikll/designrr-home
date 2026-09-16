---
name: Designrr
description: One source, many formats — write once, publish as an ebook, a deck, and a narrated video.
colors:
  paper: "#FFFFFF"
  ink: "#15191F"
  ink-secondary: "#29323D"
  ink-muted: "#52637A"
  ink-faint: "#8596AD"
  surface: "#F6F7F9"
  surface-hover: "#EEF0F3"
  border: "#E0E5EB"
  interface-blue: "#006EFE"
  interface-blue-hover: "#0058CB"
  interface-blue-light: "#E8F1FF"
  genie-violet: "#5326BD"
  badge-tint-bg: "#DCE9FF"
  badge-tint-fg: "#0053C7"
  helper-amber: "#E5B94E"
  helper-bg: "#FAFAF5"
  danger: "#D62929"
  danger-bg: "#FEF2F2"
typography:
  display:
    fontFamily: "var(--font-nunito-sans), 'Nunito Sans', sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.13
    letterSpacing: "normal"
  headline:
    fontFamily: "var(--font-nunito-sans), 'Nunito Sans', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "var(--font-nunito-sans), 'Nunito Sans', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-nunito-sans), 'Nunito Sans', sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.interface-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
  button-primary-ai:
    backgroundColor: "linear-gradient(259.1deg, {colors.interface-blue} -2.17%, {colors.genie-violet} 103.16%)"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
  badge-tier:
    backgroundColor: "{colors.badge-tint-bg}"
    textColor: "{colors.badge-tint-fg}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
  nav-item-active:
    backgroundColor: "{colors.interface-blue-light}"
    textColor: "{colors.interface-blue}"
    rounded: "{rounded.md}"
---

# Design System: Designrr

## Overview

**Creative North Star: "The Quiet Studio"**

Designrr is a calm, precise, quietly confident workspace, not a loud one. The evidence is consistent everywhere you look for it: `TierBadge`'s own code comments describe deliberately avoiding a second color code so "no one has to learn a colour code that exists on exactly one screen"; pill tints are tuned pale rather than bold; usage-limit messaging uses amber, never red, for an expected and non-urgent limit; page shadows are soft and diffuse rather than hard and directional. Color and motion are rationed, which makes the moments that do use them — the Wordgenie blue-to-violet gradient, the sparkle/shimmer animation on outline generation — read as genuinely special rather than routine.

That restraint sits next to one real flourish: Wordgenie, the product's AI engine, gets its own visual language (a blue→violet gradient, sparkle particles, a shimmer sweep) wherever it acts. The system deliberately keeps these two registers apart — quiet interface chrome for everything the user directly controls, a brief spark of color and motion for the moments the AI is doing work on their behalf.

**Key Characteristics:**
- One restrained accent (Interface Blue) for all ordinary interactive states; the gradient is reserved for AI/Wordgenie actions and top-of-funnel marketing moments.
- Flat surfaces and hairline borders by default; shadow is rare and purposeful, not a blanket card treatment.
- Sentence-case labels throughout — badges, nav items, buttons — never artificial uppercase.
- A second, separate typography system (serif/script/display fonts) exists only for content the product generates on the user's behalf, never for the app's own chrome.

## Colors

A near-monochrome ink-on-white palette carries the interface; color is spent on exactly two things — the one interactive blue, and the rare AI-gradient moment.

### Primary
- **Interface Blue** (#006EFE): the one interactive color in the app's own chrome — links, active nav state, selected states, ordinary primary buttons (Publish, Save-style actions). Darkens to **Interface Blue Hover** (#0058CB) on press/hover.

### Secondary
- **Genie Violet** (#5326BD): never appears alone. It exists only as the far end of the Wordgenie gradient (`linear-gradient(259.1deg, #006EFE -2.17%, #5326BD 103.16%)`), which marks an action as AI-powered — the "Wordgenie" button, AI-generated content buttons, the outline-generation glow/shimmer, and top-of-funnel marketing headlines (`gradient-text`).

### Neutral
- **Paper** (#FFFFFF): the base surface everywhere — page background, sidebar, cards.
- **Ink** (#15191F): primary text and the app's own foreground color.
- **Ink Secondary** (#29323D) / **Ink Muted** (#52637A) / **Ink Faint** (#8596AD): a three-step fade for secondary text, muted labels/icons, and placeholder text, in that order.
- **Surface** (#F6F7F9) / **Surface Hover** (#EEF0F3): the one-step-off-white fill for panels and hover states — never a second border, just a fill change.
- **Border** (#E0E5EB): the app's only structural border color, always 1px.

### Semantic
- **Badge Tint** (bg #DCE9FF / fg #0053C7): tuned specifically for accessible contrast on a pale pill (5.60:1 at 10px bold) — shared by every tier badge in the system, tier or promotional offer alike. Do not introduce a second tint for a second kind of gate.
- **Helper Amber** (#E5B94E) on **Helper Bg** (#FAFAF5): the confirmed choice for expected, non-urgent usage-limit messaging (verified against 13 real competitor products — none use red for this case).
- **Danger** (#D62929) on **Danger Bg** (#FEF2F2): reserved for destructive actions and true errors (e.g. Log out) — never for an expected limit.

### Named Rules
**The Gradient Means AI Rule.** Interface Blue is the default for every ordinary primary action. The blue→violet gradient is not a second "extra bold" primary button — it is a semantic marker that Wordgenie (the AI engine) is the actor. If a button doesn't involve AI generation, it doesn't get the gradient.

**The One Badge Rule.** Every tier badge — Pro, Premium, Agency, and the non-tier "offer" badge — shares one pill shape and one color tint. Only the label text changes. A badge is shown only when the current viewer doesn't already own that tier (`shouldShowTierBadge`); never badge something the viewer already has.

## Typography

**Interface Font:** Nunito Sans (`var(--font-nunito-sans)`, with system-ui/sans-serif fallback) — every piece of the app's own chrome: navigation, buttons, badges, form labels, body copy, marketing headlines.

**Content Font Roster (generated content only):** Fraunces, Newsreader, Source Sans 3, Parisienne, Anton, Syne, Manrope, Courier Prime — loaded and used exclusively inside the book editor's cover templates and its seven named text-style presets (Manuscript, Statement, Whisper, Rosewood, Marquee, Gilded, Typewriter). None of these appear in the app's own interface.

**Character:** Nunito Sans reads as clean, rounded-but-not-cute, and unremarkable on purpose — it should never compete for attention with the content the user is creating.

### Hierarchy
- **Display** (700, `clamp(2.5rem, 5vw, 3.75rem)`, 1.13 line-height): hero/marketing headlines — often paired with `gradient-text`.
- **Headline** (700, 22px, 1.3): section and modal titles.
- **Body** (400, 14px, 1.5): standard interface text, the large majority of the UI.
- **Label** (700, 11px, 0.02em tracking): badges, nav items, eyebrows — sentence case, not uppercase, except where the label is itself a short proper noun like "PRO."

### Named Rules
**The Two Type Systems Rule.** Interface type is always Nunito Sans. The expanded serif/script/display roster exists solely to typeset content the product generates for the user (a book cover, a chapter heading, a named text-style preset) — never promote one of those fonts into app chrome, and never let Nunito Sans leak into a cover template.

## Layout

A persistent white left sidebar (global navigation: Home, Projects, Landing pages, Docs, Media, plus account/plan controls) sits beside a content area whose own internal layout is surface-specific — the book and presentation editors each run a three-column model (left insert/tools rail, center canvas, right properties rail). Spacing follows a 4/8/16/24px rhythm. Sidebar nav rows are flat pills (no border) that fill with Interface Blue Light on hover/active rather than gaining a shadow or outline.

## Elevation & Depth

Flat by default. Badges, pills, nav states, and most cards carry no shadow at all — a 1px Border line is the only separation most surfaces need. The one shadow token in real use, `0 1px 2px rgba(15,23,51,0.04), 0 10px 28px rgba(15,23,51,0.08)` (soft, diffuse, two-layer), is reserved for surfaces that need to visually lift off a canvas — an editor page sitting on the book/presentation stage, a template preview card — not applied as a default card treatment.

### Shadow Vocabulary
- **Lifted Page** (`box-shadow: 0 1px 2px rgba(15,23,51,0.04), 0 10px 28px rgba(15,23,51,0.08)`): editor pages and template preview cards that sit on a canvas, distinguishing "a page" from "a panel."

### Named Rules
**The Rare Shadow Rule.** Shadow means "this is a discrete page sitting on a surface," not "this is a card." Most containers stay flat with a hairline border; reach for the Lifted Page shadow only when something needs to read as an object resting on the canvas beneath it.

## Shapes

A small, deliberate radius scale: 6px for compact controls (buttons, small badges' corners where not fully pill), 8px for standard panels and cards, 12px for larger containers and dropdowns/modals, and a full 999px pill for badges and tier labels. Borders are always a single hairline (1px, `#E0E5EB`) — no heavier structural borders anywhere in the interface.

## Components

### Buttons
- **Shape:** 6px radius for compact in-chrome actions (Publish, Save-style), 12px (`rounded-xl`) for the shared `Button` component used on marketing/onboarding/chat surfaces.
- **Primary (interface):** Interface Blue background, white text, 600 weight — the default for any ordinary action.
- **Primary (AI):** the Wordgenie gradient background (see The Gradient Means AI Rule), white text, subtle scale-on-hover/tap (1.02 / 0.98 via Framer Motion) rather than a shadow change.
- **Secondary:** white background, 1px Border, Ink text, fills Surface on hover.
- **Ghost:** transparent, Ink Secondary text, fills Surface on hover.

### Badges (signature component)
- **Style:** one flat pill geometry in three sizes (18px / 21px / 24px tall), Badge Tint background and foreground, sentence-case label text, optional star/crown glyph (off by default — the label alone carries the meaning).
- **Rule:** never shown for a tier the current viewer already owns (see The One Badge Rule).

### Cards / Containers
- **Corner Style:** 8-12px radius.
- **Background:** Paper, occasionally Surface for a nested/inset panel.
- **Shadow Strategy:** flat by default; Lifted Page shadow only for canvas-resting pages/template cards (see Elevation & Depth).
- **Border:** 1px Border color.

### Navigation
- **Style:** white sidebar, Nunito Sans 400/14px rows, Ink text at rest.
- **Hover:** Surface fill, no border or shadow change.
- **Active:** Interface Blue text on Interface Blue Light fill — a flat color-fill state, never a shadow or outline.

### Text-Style Presets (signature component, content-only)
Seven named, fixed-look typography presets available inside the book editor for flowing content — not app chrome. Each pairs one font from the Content Font Roster with a fixed size/color/weight: **Manuscript** (Newsreader italic), **Statement** (Syne 800, bold geometric), **Whisper** (Manrope, small tracked caps), **Rosewood** (Parisienne script), **Marquee** (Anton, condensed caps), **Gilded** (Newsreader, warm gold), **Typewriter** (Courier Prime mono). This is the one place in the product where typographic personality is allowed to be loud — because it's the user's content speaking, not the app's own voice.

## Do's and Don'ts

### Do:
- **Do** use Interface Blue (#006EFE) as the one interactive color for ordinary actions and states.
- **Do** reserve the blue→violet gradient for actions Wordgenie (AI) actually performs, per The Gradient Means AI Rule.
- **Do** keep every tier/offer badge on the one shared pill shape and Badge Tint, per The One Badge Rule.
- **Do** use amber (Helper Amber) for expected, non-urgent usage-limit messaging.
- **Do** keep interface type to Nunito Sans; confine the Content Font Roster to generated book/presentation content.
- **Do** default to a flat, hairline-bordered surface; reach for the Lifted Page shadow only when something needs to read as resting on a canvas.

### Don't:
- **Don't** badge a plan tier the current viewer already owns.
- **Don't** invent a second color code for a gate that already has one (tier badges, offer badges) — reuse Badge Tint.
- **Don't** use red for an expected, non-urgent limit; red (Danger) is for destructive actions and true errors only.
- **Don't** let a serif/script/display content font (Fraunces, Newsreader, Parisienne, Anton, Syne, Manrope, Courier Prime) appear in the app's own chrome — those exist for generated content only.
- **Don't** add a shadow to an ordinary card/panel by default — most surfaces stay flat with a hairline border.
- **Don't** add extra confirmation toggles or redundant Cancel/Back-style buttons where one decisive default will do.
