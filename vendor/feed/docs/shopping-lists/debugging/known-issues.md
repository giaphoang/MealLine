# Shopping Lists PDF – Known Issues and TODOs
This document tracks defects, limitations, and pending tasks for the server‑side React‑PDF exporter. Use it as a living, prioritized backlog tied to specific files.

## Border Radius Rendering Issues (UPDATE: Solutions Available)
- **Issue**: React PDF has known issues with borderRadius + borders causing corner artifacts
- **Status**: Three solutions implemented and available for evaluation
- **Files**:
  - `docs/shopping-lists/react-pdf-reference-comparison.md` - Live comparison of all 3 solutions
  - `docs/shopping-lists/border-solutions-evaluation.md` - Detailed evaluation guide
- **Solutions**:
  1. No borders with shadow/background (clean but less definition)
  2. Nested view approach (reliable borders via padding trick)
  3. Square tables (eliminates issue entirely)
- **Next Steps**: Evaluate solutions in React PDF REPL and choose preferred approach

## Rendering / Layout
- Issue: Collapsed table rows at column/page boundary (overlapping text)
  - Symptom: On the last page (or top of a continued column), some rows render with extremely small heights; text overlaps (see shared rasterized exports for Hygiene at top of a column).
  - Suspected root cause:
    - Mismatch between estimated row height (18pt) and effective render height when combined with padding/borders at page break.
    - React‑PDF/Yoga rounding at the top of a new page/column when header offset and table header combine.
  - Affected files:
    - `packages/backend/src/services/react-pdf/components/SplitPageDocument.tsx`
    - `packages/backend/src/services/react-pdf/pagination/splitPaginator.ts`
  - Status: Open
  - Proposed mitigations:
    - Enforce explicit row height/minHeight on `tr`/`td` and consistent `lineHeight` for Text (e.g., 1.2× font size) to align with `metrics.rowPt`.
    - Add a one‑time measurement sample to confirm actual rendered row height and tune `rowPt`.
    - Add a unit fixture with a category split exactly at the boundary to reproduce consistently.
- Limitation: Variable‑height rows not yet implemented
  - Risk: Long item names may wrap; current paginator counts each item as a 1‑row height, leading to potential visual overflow or dense packing.
  - Plan: Width‑based measurement for Items column (Helvetica, 9–10pt), map 1–2 lines → 1–2 row units. Clamp to 2 lines for MVP.
  - Affected files: `splitPaginator.ts` (estimate + split), `SplitPageDocument.tsx` (line wrapping).
  - Status: Planned (Phase 3).
- Limitation: Column ratios not recalculated when a column is hidden
  - Example: Hygiene category hides `Limit` column; current 16/16/68 ratios leave unused space.
  - Plan: Recompute ratios based on visible columns (e.g., Qty 25–30%, Items remainder).
  - Status: Planned.
- Behavior: Header offset is approximate
  - Current values: Title+Date ≈ 32pt; Title‑only ≈ 20pt; Date‑only ≈ 14pt.
  - Plan: Convert to measured header block height or set exact Text lineHeight to remove drift; add doc constants.
  - Status: Planned.
## Visuals / UX
- Clean‑slate presentation
  - Completed: Removed legacy card frames/rounded borders; adopted table‑first layout with compact spacing.
  - Follow‑ups: Lighten header background shade and cell borders if needed after final row-height tuning.
- Category icons (Lucide SVG)
  - Not implemented. Requires mapping DB category icon names to inline Svg paths.
  - Files: new `PdfIcon` helper + usage in `SplitPageDocument.tsx` section headers.
  - Status: Planned (Phase 4).
## API / Integration
- Download filename + attachment mode
  - Not implemented. Desired: `Title {Language} (DD-MMM-YYYY).pdf` for `disposition=attachment`.
  - Files: `packages/backend/src/routes/shopping-lists.ts` (pdf-react), minor FE action.
  - Status: Planned (post‑MVP).
- Auth in local dev
  - Frontend appends `auth` query param for dev basic auth. Confirm middleware actually consumes this param for the `/pdf-react` route.
  - Files: backend auth middleware, `packages/backend/src/routes/shopping-lists.ts`.
  - Status: Verify.
## Internationalization / Fonts
- Font coverage for non‑Latin scripts
  - Legacy React-PDF exporter note: Helvetica-only output could not support broad non-Latin coverage.
  - Active Shopping List Builder note: PDFMake now embeds Liberation Sans and the canvas preview loads the same family, fixing common symbols such as `→` plus accented Latin, Greek, and Cyrillic text.
  - Remaining limitation: Arabic, CJK, and full RTL workflows still need locale-specific font registration and visual PDF validation.
  - Status: Partially resolved for the active builder path; planned for Arabic/CJK/RTL.
## Test Coverage / Fixtures
- Add fixtures for stress scenarios
  - Huge category with split near boundary; many short sections; multilingual long names; hidden columns; header present/absent.
  - Script exists to render samples from fixtures: `packages/backend/scripts/generate-react-pdf-samples.ts`.
  - Status: In progress.
## Acceptance criteria (pending items)
- No overflow and no overlapping text at column/page boundaries with and without header present.
- Correct packing with 1‑ and 2‑line items (variable‑height rule) without changing total row counts unexpectedly.
- Column width ratios adapt when Limit column hidden.
- Optional attachment download produces a filename in `Title {Language} (DD-MMM-YYYY).pdf` format.
