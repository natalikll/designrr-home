# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo coaches, consultants, and course creators who need to turn their own expertise or existing content into a polished lead-magnet ebook or presentation deck — quickly, and without hiring a designer.

## Product Purpose

Designrr lets one author write their content once in a single editor and publish it across multiple finished formats — an ebook (PDF, Flipbook, and gated Kindle/EPUB exports), a presentation deck, and a narrated video — instead of rebuilding the same material by hand for each format.

## Positioning

One source, many formats. The book editor, presentation editor, and narration/video studio all operate on the same underlying content and draw from one shared AI generation pool (Wordgenie), rather than being separate single-format tools a competitor could offer piecemeal.

## Operating Context

- Creation flow: chat/outline generation → book or presentation editor → optionally the narration/video studio → export or publish.
- The book editor (`src/components/book/BookEditorView.tsx`) is a TipTap-based WYSIWYG editor: cover templates, chapter-body editing, page/TOC management, multi-format export.
- The presentation editor and narration studio are sibling surfaces that share the book editor's conventions (panel model, tier gating, AI generation).
- Standard tier can export PDF/Flipbook for free; Kindle/EPUB export is gated to paid tiers.

## Capabilities and Constraints

- Four self-serve plan tiers — Standard, PRO, Premium, Agency Premium (`PlanId` in `src/stores/flowStore.ts`). Features and exports gate by `currentPlan`; a new prototype surface should account for all tiers it applies to, not just one.
- Wordgenie AI generation carries hard per-tier usage limits (`MANUSCRIPT_LIMITS`) shared across BOTH book and presentation generation — one pool, not two. A past bug let presentation generation bypass this limit; don't reintroduce a per-surface pool when building generation-adjacent features.

## Brand Commitments

"Designrr" is the product/company brand (sidebar logo, overall app identity). "Wordgenie" names specifically the AI-generation feature/button inside it, not a separate product — keep this distinction in copy and UI rather than treating the two names as interchangeable.

## Evidence on Hand

No customer testimonials, case studies, press, or benchmark data currently exist in this codebase. Future marketing-facing surfaces must not fabricate any of these; use real product screenshots/behavior (verified live against the running app) as the only evidence on hand until real customer evidence is supplied.

## Product Principles

1. One editor, many outputs — a change to core content should be reusable across ebook, presentation, and video, not siloed per format.
2. Every prototype ships for every plan tier it applies to (Standard/PRO/Premium), driven by `currentPlan`, not built for one tier and bolted on later.
3. AI generation is a metered, shared resource — one pool across book and presentation. A new surface must respect the existing limit, never spend from a quiet parallel one.
4. Fewer, more decisive choices over many toggles. Prefer one strong default to redundant options (extra Cancel/Back/"keep my styling"-style toggles with no real distinct upside).
5. Real research before non-trivial UI — pull actual competitor or in-product precedent rather than inventing a pattern from taste alone.
