# Sign-in Email Branding

## Status

Adopted 2026-08-05. Covers the three messages FEED sends: verification code,
magic link, and roster invitation. Enforced by
`packages/backend/src/services/email/__tests__/email-branding.test.ts`.

## The problem

Sign-in mail is the one message staff receive that looks exactly like what
security training tells them to distrust: an unexpected email containing a code
or a button. The original templates made that worse by carrying no identity at
all — a black button, grey body text, no logo, no mention of William Temple
House, and a sender line reading "FEED Login". Nothing in them was recognisable,
so a cautious recipient had no way to tell them from a phishing attempt except
by trusting the timing.

## What actually reduces hesitation

Worth being precise, because it is easy to over-credit the artwork:

- **A logo is not a security control.** Anyone can copy one. Phishing kits ship
  with better branding than most real transactional mail.
- What helps is **recognition** — mail that looks like the application the
  person just used — combined with copy that says why the message arrived and
  never asks for anything back.
- The single highest-value line is the one in the footer: *FEED will never ask
  you for a password, and will never ask you to reply to this message with a
  code.* It gives staff a rule they can apply to the **next** message, including
  one FEED did not send.
- The **sender display name** is read before the message is opened, and was the
  cheapest thing to fix: `FEED Login` → `FEED at William Temple House`.

Authentication of the sending domain (SPF/DKIM/DMARC, handled by Resend for
`williamtemple.app`) is what actually proves origin. The design work here is
about recognisability, not proof.

## Rules

1. **One shell.** `email-layout.ts` owns the header, palette, accent rule,
   footer, and button. Messages supply content only. Three templates previously
   repeated the same table scaffold, which is how they drifted apart.
2. **Assume images are blocked.** Outlook and privacy-filtered clients suppress
   remote images by default. The wordmark is live text, the palette is
   background colours rather than image slices, and the logo carries alt text.
   Read with images off, the mail must still look like William Temple House.
3. **Every message has a plain-text part.** HTML-only mail scores worse with
   spam filters — the opposite of the goal here.
4. **Every message has its own preheader.** Without one, clients scrape the
   first visible text, which is the wordmark, so every FEED email would preview
   identically in the inbox list.
5. **Interpolated values are escaped.** `escapeHtml` on anything that came from
   outside — the invitation embeds a user-supplied address.

## Palette

Taken from the frontend so mail and app agree.

| Token | Value | Source |
| --- | --- | --- |
| `blue` | `#2964A3` | frontend `--primary`, light theme (`211 60% 40%`) |
| `gold` | `#FFDE4D` | frontend `--primary`, dark theme (`49 100% 65%`) |
| `blueTint` | `#EDF3F9` | panel behind the verification code |
| `ink` | `#231F20` | headings |

The logo artwork uses a deeper blue (`#186090`) with gold `#F0D848` and teal
`#78C0C0`. The UI values are used for type and rules because the goal is
continuity with the screen staff just left, not a match to the artwork.

## The logo asset

`packages/frontend/public/brand/wth-logo-email.png` — 600×157, served at
`https://feed.williamtemple.app/brand/wth-logo-email.png`.

It lives in `public/` rather than `src/assets/` **on purpose**. Vite
fingerprints `src/assets`, so an email sent today would point at a filename the
next deploy deletes — and unlike a web page, a sent email cannot be updated.
`public/` is copied verbatim to the site root and nginx serves it directly
(`docker/nginx.conf` has an explicit static-file location for `png`).

If the logo ever needs to change, **replace the file at the same path**. Do not
rename it; old mail in people's inboxes still points there.

## Email HTML constraints

Tables for layout, inline styles only. No CSS variables (clients cannot read
them), no flexbox or grid, no external stylesheets, no `<style>` reliance. The
call-to-action is a table with a `bgcolor` cell because Outlook ignores padding
on an `<a>`.

## Previewing

There is no committed preview route. To look at the output, render the private
template methods into files from a scratch test:

```ts
const t = ResendService as any;
writeFileSync('/tmp/otp.html', t.getOTPTemplate('482913'));
```

Set `APP_URL=http://localhost:5173` first so the logo resolves against the dev
server. Note that Vite's SPA fallback serves `index.html` for any `.html` path,
so open the rendered file directly rather than through the dev server.

## Not done

- **No dark-mode variant.** The card declares `color-scheme: light` and pins an
  explicit white background behind the logo, which is the standard defence
  against a client inverting the palette and dropping the logo's dark-blue
  wordmark to near-zero contrast. A true dark variant was not attempted.
- **Not tested against real clients.** The markup follows the usual
  constraints and the structure is validated, but it has not been run through
  Litmus, Email on Acid, or a real Outlook install.
