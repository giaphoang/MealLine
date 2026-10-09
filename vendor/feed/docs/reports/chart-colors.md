# Chart Color System (IBM Carbon)

Reports charts with multiple series use the IBM Carbon Design System
data-visualization palette, ported from the approach proven on the ZEV
Dashboard project.

## Why Carbon

- Carbon provides a broad set of hue families designed with color-vision
  accessibility in mind.
- FEED selects specific grades that achieve at least **4.5:1 contrast** against
  the actual light and dark card surfaces. This exceeds the 3:1 WCAG threshold
  for meaningful non-text graphics.
- Every light-mode value has a paired dark-mode grade, and automated tests read
  FEED's theme tokens and verify every configured pair.
- Charts retain legends and tooltips so meaning never depends on color alone.

References:

- <https://medium.com/carbondesign/color-palettes-and-accessibility-features-for-data-visualization-7869f4874fca>
- <https://v10.carbondesignsystem.com/guidelines/accessibility/color/>

## Implementation

`packages/frontend/src/lib/colors.ts` defines:

- `carbonChartColors` — ten hue families (blue, cyan, teal, green,
  magenta, purple, red, orange, yellow, warm gray), each with a
  `primary` and `secondary` grade and light/dark values. Light mode uses
  darker 60/70-range Carbon tokens; dark mode uses lighter 40/30-range tokens.
- `CARBON_CATEGORICAL_ORDER` — a hue-hopping order for categorical
  series so adjacent lines sit far apart on the color wheel.
- `carbonTheme(family, grade)` — a ChartConfig-ready `{ light, dark }`
  theme object.
- `carbonCategoricalTheme(index)` — the Nth categorical color: primaries
  first, then secondaries (20 distinct colors).

## Usage: Operational Pressure (Reports)

- **Limited Supply** is fixed to Carbon orange (warning-adjacent),
  **Clearance** to Carbon purple, and **Categories with Limits** to teal.
- The adaptive per-limit series ("1 Per Household", "2 Per Person", …)
  draw from the remaining seven families in hue-hopping order, then
  their secondary grades — so up to 14 limit configurations render
  before any color repeats, and no series ever collides with the two
  fixed Food Item status lines or the category-policy line.

Regression tests assert that pressure-chart lines remain distinct and that
every palette color maintains at least 4.5:1 contrast against the corresponding
FEED card surface in both themes.

## Usage: Seasonal Inbound Weight (Analytics)

- The current calendar year always uses the first Carbon categorical color.
  Each preceding year advances one position through the 20-color sequence.
- A year's color is derived from its distance from the current year, not its
  position in the selected subset. Selecting or clearing years therefore never
  recolors the series that remain visible.
- The current-year line uses a wider stroke and a restrained glow derived from
  the same light/dark chart color. The legend and tooltip retain explicit year
  labels so the emphasis does not make color the only means of identification.
- The sequence repeats after 20 years. This keeps the mapping deterministic for
  longer histories while preserving distinct colors throughout FEED's current
  imported procurement range.

## Adding a new multi-series chart

1. Fix semantically meaningful series to a family with
   `carbonTheme('<family>')` (e.g. warnings → orange, alerts → red).
2. Color dynamic series with `carbonCategoricalTheme(index)`, or filter
   `CARBON_CATEGORICAL_ORDER` to exclude the families you fixed in
   step 1.
3. Don't rely on color alone — keep the legend and tooltip labels.

## Print readiness: the palette is isoluminant

Carbon's categorical grades are chosen to sit at roughly equal luminance, so no
series visually dominates another. That is the right property on a screen and
it is what makes the palette colour-vision safe. It has one consequence that
only matters on paper.

Measured on a real exported report — three procurement cards, actual data, a
configured non-default brand:

| series    | contrast on white | greyscale value |
| --------- | ----------------- | --------------- |
| `#007d79` | 4.99:1            | 111             |
| `#ba4e00` | 5.03:1            | 111             |
| `#8a3ffc` | 5.00:1            | 111             |
| `#198038` | 5.02:1            | 111             |

Every series is comfortably legible against paper. Adjacent series, however,
differ by **1.00–1.01:1** — they are separated by hue alone. Converted to
greyscale all four map to exactly **111/255**, a spread of zero. On a mono
printer or a photocopy every bar becomes the same grey and the legend is the
only remaining way to read the chart.

This is inherent to Carbon and predates the white-label work; it is specific to
the PDF path because that is the output that gets printed. Pantries print on
whatever is in the office.

### Shipped in 1.7.5-beta.5: colour and greyscale together

An export packages two renderings of the same
report, and the reader chooses which to print.

The colour version stays exactly as it is — Carbon, isoluminant, unchanged. The
greyscale version varies **lightness** across the series, because with no hue
available lightness is the only channel left to carry the distinction.

Three alternatives were considered and rejected:

- **Patterns or hatching on bars.** Works regardless of colour, and adds visual
  noise to every chart including the colour one, where there is no problem to
  solve.
- **Varying lightness in the colour version.** Lightness reads as rank, so it
  would imply a hierarchy among series that do not have one. That objection is
  exactly why it is the right choice in a greyscale-only rendering, where the
  reader knows hue has been removed.
- **Direct-labelling every series.** Adds text to a visualisation to compensate
  for a rendering problem, and the report already direct-labels values.

Two artifacts cost more bytes than one and are otherwise free: nothing about the
colour output changes, so no reader of the colour report can regress.

### How it is built

`greyscalePrintTheme` in `packages/backend/src/services/reports/print-theme.ts`
converts every colour except the series with `greyscaleOf`, which returns the
grey of identical relative luminance. Because luminance is preserved, contrast
survives the conversion exactly — a heading that cleared 7.05:1 in colour clears
7.00:1 in grey — so the greyscale rendering needs no separate contrast proof.

The series ramp is replaced rather than converted, since converting is the thing
that fails. `PRINT_GREYSCALE_SERIES` is **six** steps spaced evenly in perceptual
lightness between L 0.20 and L 0.66:

| step | hex       | on white |
| ---- | --------- | -------- |
| 1    | `#161616` | 18.10:1  |
| 2    | `#2c2c2c` | 13.97:1  |
| 3    | `#434343` | 9.89:1   |
| 4    | `#5c5c5c` | 6.69:1   |
| 5    | `#777777` | 4.48:1   |
| 6    | `#929292` | 3.11:1   |

Six, not seven, and both ends are pinned by something real. The light end cannot
pass L 0.66 without dropping under the 3:1 that WCAG 1.4.11 asks of a meaningful
graphic; the dark end bottoms out against the ink. Seven steps fit between them
arithmetically, at 1.23x apart — but that is about what a mono printer resolves,
and less than a reader separates on a photocopy of a photocopy. Six is the
honest count. The range past it is bought with texture, not with a seventh step
nobody can see.

**The order the ladder is handed out matters more than the ladder.** Charts take
`palette[0]`, `palette[1]`, and so on in sequence, so a two-series chart gets
whatever the first two entries are. Shipping the ladder in lightness order gave
that chart steps 1 and 2 — the two darkest *neighbours*, which is the ramp's
worst possible pair and was unreadable in print. The fix is to spend the extremes
first and subdivide from there, a bisection order:

    [0, 5, 3, 2, 4, 1]

Separation then degrades gracefully instead of starting at its worst. Measured as
the smallest contrast gap between any two series a chart of *n* bars gets:

| series | worst pair | before (sequential) |
| ------ | ---------- | ------------------- |
| 2      | 5.82x      | 1.30x               |
| 3      | 2.15x      | 1.30x               |
| 4      | 1.48x      | 1.30x               |
| 5–6    | 1.30x      | 1.30x               |

Two- and three-series charts are the common case and are now unmistakable; a
six-series chart is no worse than it was. The order was picked by brute force
over all 720 permutations, ranked on the worst pair at two series, then three,
then four.

### Lines are not small bars

A filled bar is a slab of grey a centimetre across. A series line is a two-unit
stroke crossing other strokes over a gridded plot, and the two do not carry the
same number of levels — six greys that separate cleanly as areas do not separate
at all as thin lines. Every line card in the export read poorly even after the
fill ramp was fixed, because the fix was for a different mark.

So `PRINT_GREYSCALE_STROKES` is a **three**-level ramp, and lines take the rest
of their separation from dashing — the channel a stroke has and an area does
not, and the oldest convention in printed technical drawing:

| level | hex       | on white | dashes                                |
| ----- | --------- | -------- | ------------------------------------- |
| 1     | `#161616` | 18.10:1  | solid, `6 3`, `1.5 2.5`, `7 2.5 1.5 2.5` |
| 2     | `#929292` | 3.11:1   | "                                     |
| 3     | `#5c5c5c` | 6.69:1   | "                                     |

Three levels against four dash styles is twelve distinguishable lines, which is
exactly what the longest line card in the report needs. The worst pair among the
three levels is 2.15x, against 1.30x if the fill ramp had been reused. Lighter
levels are stroked slightly heavier (2, 2.2, 2.5) so the three carry equal
visual weight; a 2-unit stroke at 3:1 and one at 18:1 do not.

Dashing starts at the fourth series, not the seventh. Waiting for the greys to
run out would mean six unreadable lines first, which is the whole defect.

**A line chart's legend must be drawn from the same source.** `legendSvg` takes a
`variant`, and the line cards pass `'line'`, which draws a short dashed rule
instead of a filled square. A filled swatch beside a dashed line names the right
series with the wrong appearance — worse than no legend, because it asserts a
correspondence that is not there.

### Past six series: texture

`procurement-legacy-donations-over-time` carries **twelve** series, and the ramp
wrapped: the last six printed as exact copies of the first six, with a legend
confidently naming both. There is no seventh grey to add, so the range is
extended with texture, and only once the greys are gone:

| series | treatment                            |
| ------ | ------------------------------------ |
| 1–6    | solid grey, no pattern at all        |
| 7–12   | the same six greys, textured         |
| 13–18  | the same six greys, second texture   |

The textures vary by **structure**, not by angle: horizontal rules, one
diagonal, dots, vertical rules, the other diagonal, a grid, a checker. A first
pass used a hatch and a cross-hatch, which is one family at two densities — they
read as "more hatched" and "less hatched", which is a *magnitude*, and magnitude
is the one thing a categorical series must not imply. They are also drawn to
roughly equal coverage for the same reason: a dense texture beside a sparse one
reads as heavier, inventing a ranking among categories that have none.

Texture is noisier than a flat fill. That is exactly why it is the extension and
not the scheme — a chart of six or fewer series never sees one, and the colour
rendering never sees one at all, because hue has as many usable steps as a chart
has series and would be paying the noise for nothing. A bar that carries its own
label is left flat regardless: in `hBarSvg` the row fill is decorative, and
texturing something already named is noise with no information in it. Only the
segments, which are decoded from a legend, take it.

The texture lines are cut in the paper colour rather than drawn in a darker
grey, so a textured series reads *lighter* than the solid series it shares a
step with. The pair is separated twice over, by texture and by apparent
lightness.

### Why the patterns are hand-written

Not for want of looking. `textures` and `svg-patterns` both carry a good
catalogue and were both evaluated:

| package        | why not                                                        |
| -------------- | -------------------------------------------------------------- |
| `textures`     | writes into a d3 selection — needs d3-selection and a DOM       |
| `svg-patterns` | returns a virtual-dom tree; pulls `virtual-dom`, dead since 2016 |
| `patternomaly` | canvas-based, for Chart.js — wrong renderer entirely            |

This renderer builds SVG as strings in a process with no DOM, deliberately (see
the header of `analytics-print.ts`). Either library therefore costs a DOM shim
in the report path — the one path that must not break — to deliver what is
ultimately a dozen `<path d>` values. All three were last published in 2022.
Taking the geometry and leaving the rendering layer is the smaller and more
durable dependency.

### Stacked bars name their own parts

`stackedHBarSvg` printed only the row total. On screen the split is a tooltip
away; print has no hover, so the Demographics Questions Response Rate card
showed a total with no way to see how much of it was answered — which is the
entire question the card exists to answer.

Each segment now carries its own value, centred, when the text fits inside it,
and is simply left out when it does not rather than spilling over a neighbour it
does not belong to. `seriesLabelInk` picks ink or paper by contrast against the
grey *behind* a texture rather than the texture itself: a patterned fill is part
grey and part paper, so its effective luminance is between the two, and choosing
against the grey is the conservative end of that range.

One trap worth recording. `card.print` reads the print theme from an
async-local scope and bakes the series colours into the SVG it returns, so
rendering the cards once and handing the same SVG strings to both variants
produces a "greyscale" PDF whose chrome is grey and whose bars are still full
Carbon. The charts must be drawn once per variant; only the card *data* is
computed once, because it does not depend on colour. This was caught by
inspecting the PDF's own colour operators rather than by looking at the file,
and `greyscale-print.test.ts` now holds the theme half of it.

A second trap, same shape: any colour written as a literal in the document CSS
rather than read from the theme cannot be greyscaled, because
`greyscalePrintTheme` only transforms the theme. The caution-note box shipped
amber (`#FFF8E1` on `#8A5A00`) hardcoded in `analytics-report.ts`, so it stayed
amber in a PDF that was supposed to have no colour in it. It is now
`theme.note`, and the check that catches this class of bug is to decompress the
PDF's content streams and assert that **no** `rg` operator has unequal
components — not to read the CSS.
