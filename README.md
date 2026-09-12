# PAIRA — Full Site Handoff

## Overview
PAIRA is a bilingual (Turkish / English) marketing + lead-generation website for a
company that guides legal professionals through AI adoption. It has a Turkish site at
the project root and a mirrored English site under `en/`. The centerpiece is an
interactive "AI Readiness Score" self-assessment (15 questions, branching by role,
scored client-side with a personalized result). The rest are content/marketing pages
plus lead-capture forms.

Live domain (intended): **mypaira.com**

> **This document describes the original design bundle as delivered.** During deployment
> the pages were renamed to clean lowercase slugs and moved under `site/`. The original
> filenames are kept here because `site/_redirects` still 301s them. For the current
> deployed state, see `DEPLOY.md` and `AGENTS.md`.

## About the design files
This bundle is a **complete, working static site built as HTML**. Each page is a
self-contained HTML file that renders and works as-is in a browser, on top of a small
in-house rendering runtime (`support.js`, the `<x-dc>` / `<sc-if>` / `<sc-for>` custom
tags). Two valid paths for whoever deploys this:

1. **Ship as-is (fastest, recommended).** Every page already includes `support.js` and
   all markup, so the site works as a plain static site. Host the folder on any static
   host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3+CloudFront, nginx). No
   build step, no server, no database required. See "Deployment" below.
2. **Rebuild in a framework (cleaner long-term).** Recreate the pages in the target
   stack (React/Next, Astro, Vue, etc.) using the exact copy, layout, colors, and
   typography documented here. Match it pixel-perfectly — this is a hi-fi design.

The Scorecard's lead capture submits to a real backend (see "Backend work needed"
below); the contact, newsletter, and VibeLegal forms are front-end only.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions. Recreate
pixel-perfectly if rebuilding.

---

## Site map / pages

Turkish (root) ↔ English (`en/`) pairs — layout and structure are identical per pair:

| Turkish file | English file | Purpose | Deployed as, in `site/` (TR / EN) |
|---|---|---|---|
| `Ana Sayfa.dc.html` | `en/Home.dc.html` | Home / landing | `index.html` / `en/index.html` |
| `Skorkart.dc.html` | `en/Scorecard.dc.html` | **AI Readiness Score** interactive assessment | `skorkart.html` / `en/scorecard.html` |
| `Danismanlik.dc.html` | `en/Consulting.dc.html` | AI Adoption consulting service | `danismanlik.html` / `en/consulting.html` |
| `Egitimler.dc.html` | `en/Trainings.dc.html` | Training programs + sign-up forms | `egitimler.html` / `en/trainings.html` |
| `Etkinlikler.dc.html` | `en/Events.dc.html` | Events (Pera Forum, corporate, VibeLegal) | `etkinlikler.html` / `en/events.html` |
| `Manifesto.dc.html` | `en/Manifesto.dc.html` | Brand manifesto (long-form text) | `manifesto.html` / `en/manifesto.html` |
| `Hakkimizda.dc.html` | `en/About.dc.html` | About + team (4 people) | `hakkimizda.html` / `en/about.html` |
| `PairaNotes.dc.html` | `en/PairaNotes.dc.html` | Newsletter page (Substack embed + RSS feed) | `paira-notes.html` / `en/paira-notes.html` |
| `VibeLegal.dc.html` | `en/VibeLegal.dc.html` | Community application page | `vibe-legal.html` / `en/vibe-legal.html` |
| `Iletisim.dc.html` | `en/Contact.dc.html` | Contact form + booking | `iletisim.html` / `en/contact.html` |
| `Aydinlatma Metni.dc.html` | `en/PrivacyPolicy.dc.html` | KVKK notice (TR) / GDPR privacy policy (EN) | `aydinlatma-metni.html` / `en/privacy-policy.html` |
| `index.html` | — | Root redirect → `Ana Sayfa.dc.html` | — (deployed `index.html` is the TR home itself) |

Language switch: a TR/EN pill in every header links each page to its counterpart.
The TR privacy page is a KVKK "Aydınlatma Metni"; the EN page is a GDPR Privacy Policy
(a deliberate legal adaptation, not a literal translation).

---

## Global layout & navigation

- **Max content width:** 1240px, centered, 32px horizontal padding.
- **Sticky header** (all pages): PAIRA wordmark (letter-spacing 0.4em) left; nav right
  with page links, a TR/EN language pill, and a dark "Discover Your Score" button
  linking to the Scorecard. Header background `rgba(255,255,255,0.96)` + `blur(8px)`,
  bottom border `#D7E0EA`.
- **Footer** (all pages): dark `#15233E` background, PAIRA blurb, three link columns
  (mirrors the site map), copyright row `© 2026 PAIRA · mypaira.com`.
- **Section rhythm:** alternating white `#FFFFFF`, light `#F4F7FA`, and dark `#15233E`
  bands, separated by 1px `#D7E0EA` borders. Vertical padding typically 72–96px.

---

## Design tokens

**Colors**
| Token | Hex | Use |
|---|---|---|
| Ink / primary dark | `#15233E` | Headings, dark sections, primary buttons |
| Deep blue (button hover) | `#223E68` | Button hover, dark cards |
| Body text | `#22324B` | Paragraph text |
| Muted text | `#5C6B82` | Secondary text, captions |
| Link / accent blue | `#2E6FB0` | Links, eyebrow labels |
| Light blue | `#ABD4EC` | Text on dark bg, accents |
| Pale blue tint | `#E9F2F9` | Card fills, hover fills |
| Panel gray | `#F4F7FA` | Section backgrounds |
| Border | `#D7E0EA` | All hairline borders |
| Gold / brass | `#A8842C` | Eyebrow accents, "Later"/premium marks |
| Gold dark (text) | `#6B5418` | Text on gold-bordered chips |
| Deep blue-2 (blue chip text) | `#1B4F86` | Chip labels |

**Typography** (Google Fonts)
- Display / serif: **Cormorant Garamond** — weights 400/500/600, plus italics.
  Used for H1–H3, scores, pull quotes.
- UI / sans: **Outfit** — weights 300/400/500/600. Body, nav, buttons, labels.
- Import (in every page `<head>`):
  `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500;1,600&family=Outfit:wght@300;400;500;600&display=swap`
- Representative sizes: hero H1 60–64px; section H2 34–38px; card H3 21–28px;
  body 15–18px; eyebrow label 12px uppercase, letter-spacing 0.16em, weight 600.

**Radii & shadows**
- Border radius: 8px (inputs/buttons), 10–12px (cards), 999px (pills/chips).
- Card shadow: `0 2px 12px rgba(21,35,62,0.04)`; elevated form `0 4px 24px rgba(21,35,62,0.05)`.

**Buttons**
- Primary: bg `#15233E`, white text, 8px radius, ~14–16px 500 weight; hover bg `#223E68`.
- Secondary/outline: 1px `#15233E` border, `#15233E` text; hover fills `#15233E`/`#E9F2F9`.

---

## The AI Readiness Score (Skorkart / Scorecard) — behavior

The only page with substantial logic, all of it client-side in the page's script class.
Phases (`state.phase`):

1. **landing** — hero + "what you get" grid + founder quote; two "Get Your Score" CTAs.
2. **lead** — capture form: full name*, email*, title, organization*, phone (optional),
   a mandatory consent checkbox, an optional newsletter checkbox. Validates required
   fields, email format, and mandatory consent before continuing. Submitting this form
   sends a `partial` lead record to the backend (see "Backend work needed").
3. **segment** — "Which describes you best?" → law firm (A) / in-house (B) / individual
   lawyer (D). Chooses which 15-question set to run (D reuses set A).
4. **degerlendirme** — 15 questions: 12 scored Yes/No/"No, but it's my priority"
   (Yes = points, others = 0), across 3 categories (Efficiency & Capacity, Risk &
   Compliance, Competition & Positioning), then 3 qualifying questions (firm size,
   12-month priority, contact preference). Progress bar + "back" link.
5. **result** — score % (total/18), tier (Observer ≤35, Practitioner ≤75, Pioneer >75),
   per-category bars, a tier-specific paragraph, and role/priority-specific primary +
   secondary CTAs (training links, Calendly call, PAIRA Notes, advanced programs, events).
   Plus a "personal report" card (shown on-screen and downloadable as a PDF via the
   browser's print dialog — it is not emailed) and a restart link. Reaching this phase
   sends a `complete` lead record to the backend, upserted onto the same row as the
   `partial` write from step 2.

Scoring detail: category max = [6, 7, 5], total max = 18; `pct = round(total/18*100)`.
Full question text and CTA routing live in the `sets()` and `resultContent()` methods of
`Skorkart.dc.html` / `en/Scorecard.dc.html` — copy verbatim.

---

## Other interactive bits

- **Home "What we change" table** (`Ana Sayfa` / `Home`): two tabs (Law Firms /
  In-house) toggle a Today→Later comparison table. Data in the page's script.
- **PairaNotes**: embeds the Substack subscribe iframe
  (`https://burakozdemirlegal.substack.com/embed`) and fetches recent posts from the
  Substack RSS feed with two fallbacks (`api.rss2json.com`, then `api.allorigins.win`),
  showing skeleton → cards → empty/error states.
- **Contact / Events**: Contact reads a `topic`/`konu` URL query param to preselect the
  subject dropdown; Events links carry that param (e.g. `Contact.dc.html?topic=Corporate%20Events`).
- **Training sign-up cards**: the free "Getting Started" course and all other programs
  use a "Notify me when it opens" email + Send + consent block (front-end only).

---

## Backend work needed

**Wired up (live):**
1. **Scorecard lead capture** — `POST /api/lead` (Cloudflare Pages Function) writes to
   a D1 database (source of truth) and best-effort mirrors to a Google Sheet. See
   `DEPLOY.md` → "Lead capture (Scorecard)" for the architecture and
   `tools/SHEET_SETUP.md` for the non-technical Sheet setup.

**Fast-follow (same `/api/lead` pattern, not yet built):**
2. **Contact form** — deliver message + subject to an inbox/CRM.
3. **Newsletter / "notify me" forms** (PairaNotes, Trainings, Home footer, Events) —
   subscribe to Substack or an ESP; honor the consent checkbox.

**Deferred:**
4. **Trainings program sign-ups** beyond the "notify me" capture.
5. **VibeLegal application** — store/route community applications.
6. Consider a cookie-consent banner (the privacy pages reference cookies).

Third-party services already referenced: **Substack** (newsletter), **Calendly**
(`https://calendly.com/burakoz-demir/30min-1`, booking), **Google Fonts**, **Wix**
(named in the privacy policy as current infra — replace as needed).

## Deployment (ship-as-is route)
1. Upload the whole `site/` folder to any static host, preserving the `en/` subfolder and
   `assets/` folder and keeping `support.js` at the site root — every page, TR and EN,
   loads it via the absolute path `/support.js`.
2. `site/index.html` is the Turkish home page, so a host that serves `index.html` as the
   directory entry point needs no extra config.
3. The original bundle's filenames contained spaces and Turkish characters (e.g.
   `Ana Sayfa.dc.html`, `Aydinlatma Metni.dc.html`), which links had to URL-encode
   (`Ana%20Sayfa.dc.html`). The deployed files use clean lowercase slugs instead, and
   `site/_redirects` 301s the old names. Rename further only by updating every `href`.
4. All external calls (fonts, Substack, RSS proxies, Calendly) require outbound HTTPS at
   runtime in the visitor's browser — no server config needed.

## Assets

The original bundle's images are kept in `original_assets/`. What actually ships is the
WebP conversion in `site/assets/`. Verified against the pages:

| Original | Deployed (`site/assets/`) | Used by |
|---|---|---|
| `burak-ozdemir.jpeg` | `burak-ozdemir.webp` | Home hero (TR + EN), About |
| `anil-akbas-sq.png` | `anil-akbas-sq.webp` | About (TR + EN) |
| `mert-ozoner-sq.png` | `mert-ozoner-sq.webp` | About (TR + EN) |
| `selma-toktas-sq2.png` | `selma-toktas-sq2.webp` | About (TR + EN) |
| `egitim-atolye.jpg` | `egitim-atolye.webp` | Trainings (TR + EN) |
| `kurumsal-etkinlik.jpg` | `kurumsal-etkinlik.webp` | Events (TR + EN) |
| `topluluk-bulusmasi.jpg` | `topluluk-bulusmasi.webp` | Events (TR + EN) |
| `yuzucu-havuz-en.png` and the root `skorkart-hero-tr.png` (byte-identical) | `skorkart-hero.webp` | Scorecard (TR + EN) — one shared file |

**Referenced by nothing.** These four converted along with the rest and are still in
`site/assets/`, but no page loads them. Safe to delete: `anil-akbas.webp`,
`selma-toktas.webp`, `selma-toktas-sq.webp`, `yuzucu-havuz.webp`.

Replace any of these with final licensed versions as needed — but see `AGENTS.md` §9:
images are cached for 30 days and filenames are not content-hashed, so a replacement
under the same filename will not reach visitors who already cached the old one. Change
the filename instead.

## Files
- Runtime: `support.js` (required by every page; **do not modify**). There is exactly one
  copy, at the site root; every page, TR and EN, loads it via the absolute path
  `/support.js`.
- Root: the Turkish pages (originally `*.dc.html`, deployed as the slugs in the site map
  table above) + `index.html`.
- `en/`: the English pages.
- `assets/`: images listed above.
