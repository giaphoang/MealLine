# Help Screenshot Capture Brief

A complete re-capture of every in-app help screenshot for 1.5.0. Written to be
handed to an agent working in this repository.

**Why all of them, not just the new ones:** 1.5.0 changed the sidebar (the
Service section, the Analytics lens tabs) and carries visual refinements
throughout. Every existing screenshot now shows chrome that no longer matches
what the reader sees, which is worse than no screenshot — a guide that shows a
different interface teaches the reader to distrust it.

---

## 0. Required reading, before anything else

**Read `AGENTS.md` in full.** It is required reading for agents in this
repository and it carries rules that will otherwise be violated in the first ten
minutes. In particular:

- **Radix tabs activate on pointer-down, not click.** A synthetic `.click()`
  never switches the Analytics lens tabs or the date-range presets. Dispatch
  `pointerdown` + `mousedown`. This is documented under "Lessons From Recent
  Work" and it reads as "the app is broken" when it is not.
- **Port 5173 is the only valid target.** The backend must be running on 3001;
  the app needs it for authentication and all data. If a login screen appears,
  **stop and ask the user to authenticate** — do not attempt a bypass and do not
  conclude the work is untestable.
- Do not revert unrelated work in the tree.

Then read `docs/user-guides/screenshot-plan.md` for the capture conventions this
brief follows.

---

## 1. Output contract

| | |
|---|---|
| **Save to** | `packages/frontend/public/help-screenshots/` |
| **Referenced from guides as** | `/help-screenshots/<name>.png` |
| **Light theme** | `<name>.png` |
| **Dark theme** | `<name>-dark.png` |
| **Format** | PNG |
| **Viewport** | 1440 × 900 for full-page shots; may crop tighter for dialogs |

**Every screenshot needs both themes.** The guides render inside the app and
follow the reader's current theme; a light screenshot on a dark page is jarring
and looks broken. There are no exceptions to the pair rule.

Overwrite the existing files at their existing names — the guides already
reference them and the markdown should not need editing for those. New captures
get new names and **do** need a matching `![alt](/help-screenshots/name.png)`
line added to the guide, plus a row in `screenshot-plan.md` with status `Added`.

---

## 2. Hard constraints

**Do not capture personal information.** The development database is a restored
copy of production. FEED does not store client PII by design, but these are real
and must not appear:

- **Staff and volunteer names or email addresses.** The Admin page shows a user
  roster. `et2.geiger@gmail.com` and any other real address must not be legible.
  Scroll past, crop out, or ask the user before capturing that page.
- Any address, phone number, or free-text note that names a person.
- Locally downloaded filenames that identify a real export.

If a screen cannot be captured without one of these, **skip it and report why**
rather than capturing and hoping it is small enough not to matter.

**Do not stage fake data to make a screenshot look better.** Real counts from
the restored data are correct and preferable. An empty state is worth capturing
honestly if that is what the screen does.

**Do not modify application code to improve a screenshot.** If a screen is
genuinely unphotographable, say so.

---

## 3. Setup

1. Confirm both servers respond: `http://localhost:5173` and
   `http://localhost:3001/api/health` (should report `1.5.0-beta.21`).
2. Confirm you are authenticated. A login screen means stop and ask.
3. Set the viewport to 1440 × 900.
4. For each screen: capture light, switch theme, capture dark, switch back.
   The theme control is in the top bar; the app uses `next-themes`, so the
   value also persists in `localStorage` under `theme` if that is easier to
   drive. Use `dark` and `light` explicitly — **not `system`**, which resolves
   differently depending on the host machine.
5. Analytics screens: set the date range to **All** unless a shot specifies
   otherwise, so counts are stable between light and dark captures.

Allow charts to finish animating before capturing. A half-drawn bar chart is a
common failure here.

---

## 4. Screenshot list

### A. Re-capture — existing names, unchanged filenames

These already exist and are referenced by guides. Overwrite in place.

| Filename (add `-dark` for the pair) | Route | What must be visible |
|---|---|---|
| `getting-started-dashboard-sidebar` | `/` | Sidebar expanded, showing the 1.5.0 navigation, beside the Dashboard |
| `dashboard-overview` | `/` | Full dashboard: alert summary and cards |
| `inventory-food-items-table` | `/food-items` | Table with the status filter visible |
| `translations-table` | `/translations` | Table with filter controls and records |
| `translations-find-missing-dialog` | `/translations` | The Find Missing Translations dialog open |
| `document-translator-upload-dialog` | `/document-translator` | Upload dialog with the DOCX drop area |
| `document-translator-dialog` | `/document-translator` | Translate Document dialog, Basic tab |
| `document-translator-list` | `/document-translator` | Document table with translated files |
| `shopping-lists-table` | `/shopping-lists` | The lists table |
| `shopping-lists-export-menu` | `/shopping-lists` | Row menu open, showing Download PDF and Translate & Download PDF |
| `shopping-lists-export-settings-dialog` | `/shopping-lists` | Export Settings dialog with the filename preview |
| `shopping-list-builder-canvas` | `/shopping-lists/builder` | Builder canvas with side panels |
| `ai-configuration-list` | `/ai-configuration` | Configuration list. **No API key values legible** |
| `help-search-results` | `/help` | Search results for a common term |

### B. New — Analytics (highest priority; 1.5.0's headline feature)

| Filename | Route | What must be visible |
|---|---|---|
| `analytics-lens-tabs` | `/analytics?range=all` | The four lens tabs — Operations, Procurement, Service, Clients — with the date-range presets beneath |
| `analytics-report-selection` | `/analytics?range=all` | Selection mode active, several cards chosen and numbered |
| `analytics-report-review` | `/analytics?range=all` | The Generate Report review dialog listing the chosen cards |
| `analytics-service-summary` | `/analytics?range=all&tab=service` | Service Summary: tiles including "People served \*", the source pills, and the footnote below |
| `analytics-turned-away` | `/analytics?range=all&tab=service` | Turned Away card: three tiles with their icons, and the chart |
| `analytics-clients-map` | `/analytics?range=all&tab=clients` | **Where Households Live** — the bubble map with markers over the metro, and the footnote |
| `analytics-clients-age` | `/analytics?range=all&tab=clients` | Age of People Served: all eight bands with the four-bullet footnote |

For `analytics-clients-map`, let the map finish loading tiles and markers — it
is the slowest thing in the app. All 237 markers should be present.

### C. New — Service Log

| Filename | Route | What must be visible |
|---|---|---|
| `service-log-day` | `/service-log` | The service-date control and the configured metric cards |
| `service-log-metric-dialog` | `/service-log` | The metric configuration dialog with icon selection |

### D. New — Data Management

| Filename | Route | What must be visible |
|---|---|---|
| `data-management-overview` | `/data-management` | The page with import history |
| `add-data-drop` | `/data-management` | Add Data dialog, file drop area, before a file is chosen |
| `add-data-review` | `/data-management` | The detected-source review step with reconciliation counts. Use a synthetic or already-imported file; **no client data** |

If a real import cannot be driven safely, capture the drop area only and report
the review step as not captured. Do not fabricate the screen.

### E. New — Settings and Admin

| Filename | Route | What must be visible |
|---|---|---|
| `settings-overview` | `/settings` | The settings page |
| `settings-operating-hours` | `/settings` | The recurring operating-hours control |
| `admin-overview` | `/admin` | The Admin page **with the user roster cropped out or obscured** |

Admin is the highest-risk page in this list. If you cannot frame it without a
legible email address, skip it and say so.

---

## 5. When you are done

1. Every file present in both light and dark. A missing `-dark` pair is an
   incomplete capture.
2. New captures referenced from their guide with a descriptive alt attribute —
   alt text describes what the reader will see, not "screenshot".
3. `docs/user-guides/screenshot-plan.md` updated: new rows for new captures,
   status `Added`, and existing rows moved from `Planned` to `Added` where they
   now exist.
4. Report explicitly: what was captured, what was skipped, and why. **A skipped
   shot with a stated reason is a good outcome; a captured shot containing a
   real email address is not.**

Do not commit unless the user asks. Leave the changes in the working tree and
report what is there.
