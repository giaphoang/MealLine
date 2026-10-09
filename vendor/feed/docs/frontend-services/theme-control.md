# Theme Control

**Changed:** 2026-08-15, in the 1.5.0 beta line.
**Components:** `src/components/theme-switcher.tsx` (header),
`src/components/settings/appearance-setting.tsx` (Settings → Appearance).
**Covered by:** `src/test/theme-switcher.test.tsx`.

## What changed

The header theme control was a dropdown containing a radio group of **Light /
Dark / System**. It is now a **two-state toggle button**, and the deliberate
three-way choice moved to Settings → Appearance.

## Why

Prompted by [Lea Verou, "Dark mode toggles"](https://lea.verou.me/blog/2026/dark-mode-toggles/).
Her argument, which applies to FEED almost exactly as written: a tri-state
control is the data model leaking into the UI. There are three states
underneath, so the control offered three options — but that is not the shape of
what anyone wants from it.

People reach for a theme control when something looks wrong, not to configure a
future scenario. FEED's version cost two clicks and a three-way decision to
express one intent: *make it stop being this*. It also violated the feedback
principle, since two of the three options frequently produced an identical
screen.

Two things make this land harder in FEED than on a typical site:

- **It is used mid-shift.** This is a pantry floor tool. Someone squinting at a
  bright screen during service wants one click, not a popover.
- **There is a recurring reason to flip briefly.** Printed output renders
  independently of app theme, and the Shopping List Builder previews represent
  paper. Checking that a preview looks right is exactly the momentary flip the
  toggle is for.

## How the toggle reaches three states with two buttons

The control switches to the opposite of whatever is currently **on screen**.
When that opposite is what the device would have produced anyway, the stored
override is **removed** rather than written:

```ts
const visible = resolvedTheme === 'dark' ? 'dark' : 'light'
const target  = visible === 'dark' ? 'light' : 'dark'
setTheme(target === systemTheme ? 'system' : target)
```

So "follow this device" is what you *arrive at* by toggling back, not a third
thing to pick. An override is only ever cleared by a deliberate toggle — never
dropped just because it happens to match the device for a while.

This also makes the most common complaint self-healing. Someone who chose Dark
in winter, and finds FEED still dark on a bright morning after their device has
switched to light, simply presses the button: the target is light, light is what
the device wants, so the override clears and FEED resumes following the device.
One click, no explanation needed.

## Why Settings still has three options

Verou names settings panels as the legitimate place for the explicit choice, and
FEED has one. The toggle *reaches* "follow this device" but never *offers* it,
so someone who wants to set it deliberately — or to confirm that is what they
are on — has nowhere to look. Settings → Appearance is that place.

Appearance is stored in the browser via `next-themes` and never sent to the
server, so two staff members signed in to the same shared environment can read
FEED in different themes. That is correct — a display preference is not
organization data, so it does not engage the shared-environment principle in
`AGENTS.md`. The section copy says "on this device" and leaves it there; the
Settings page description was simplified to match rather than drawing a
distinction the reader did not ask for.

The Settings control also marks the **stored** selection, not the resolved one:
with `system` stored on a dark device it highlights *Follow this device*, not
*Dark*. Highlighting the resolved theme would misreport what the user actually
chose.

## What did NOT change, and must not

**The three-state CSS model stays.** This is the thing most likely to be
over-applied from the article, which is about the *control*, not the stylesheet.
The app still renders three states and all three need styling:

- no stamp on the root element — the default, where only
  `prefers-color-scheme` separates light from dark;
- `class="light"` — an explicit light override;
- `class="dark"` — an explicit dark override.

A colour whose only definition sits inside a `prefers-color-scheme` block or
behind an explicit stamp will fail in the unstamped state. Nothing about the
toggle removes that requirement.

## Accessibility notes

- The button's accessible name states the **action** ("Switch to dark theme"),
  not the widget ("Theme options", which is what it used to say). The icon shows
  the same thing the label says — the theme you will get — so the control reads
  identically whether it is seen or heard.
- The button renders disabled until `next-themes` has resolved against the
  device, because before that there is no honest answer about which way it
  should flip.
- The Settings control is a labelled `radiogroup` of `radio` buttons carrying
  `aria-checked`.

## If this is revisited

The remaining known rough edge: a staff member who flips to light to check a
print preview stays in light until they flip back. That was equally true of the
old dropdown, so it is not a regression — but making the flip easier makes the
outcome more common. If it becomes a real complaint, the fix is a temporary
preview-scoped theme rather than a change to this control.
