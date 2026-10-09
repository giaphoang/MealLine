# FEED User Guides

These Markdown files are the source for FEED's in-app Help section.

## Audience

Write for Social Services staff, volunteers, and administrators who need to do real
work quickly. Assume readers are comfortable helping people, not reading
technical manuals.

## Writing Rules

- Use plain language.
- Keep each guide short.
- Explain who, what, when, where, why, and how when those answers matter.
- Prefer short workflows over long explanations.
- Avoid technical terms unless staff need them to make a decision.
- Put implementation notes in the project docs, not in Help.

## File Rules

- Use ordered filenames: `01-getting-started.md`, `02-dashboard-alerts.md`.
- Use one `#` title per guide.
- Use `##` and `###` headings for sections that should appear in search and
  the guide table of contents.
- Use relative links between guides. The app rewrites links like
  `03-inventory.md#food-items` to the matching Help route.

## Screenshots

Help supports paired light- and dark-mode screenshots from
`packages/frontend/public/help-screenshots/`. Track completed and planned
captures in `screenshot-plan.md` so additions remain intentional,
privacy-safe, and workflow-based.
