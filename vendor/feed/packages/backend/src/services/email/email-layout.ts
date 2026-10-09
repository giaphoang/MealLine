// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The shell every FEED email is rendered into.
 *
 * Sign-in mail is the one message staff receive that *looks* exactly like the
 * thing they are trained to distrust: an unexpected message with a code or a
 * button in it. The previous templates were unbranded — black button, grey
 * text, no mention of William Temple House — so nothing distinguished them from
 * a generic phishing kit.
 *
 * Two honest caveats about what this can and cannot do:
 *
 * 1. **A logo is not a security control.** Anyone can copy one. What reduces
 *    hesitation is *recognition* — mail that matches the application staff just
 *    used — plus copy that states why the message arrived and never asks for
 *    anything back. The footer's "we will never ask you to reply with this
 *    code" is doing more real work than the artwork above it.
 * 2. **Assume the images are blocked.** Outlook and many privacy-filtered
 *    clients suppress remote images by default. So the wordmark is live text,
 *    the palette is background colours rather than image slices, and the logo
 *    is an enhancement that degrades to alt text. Read any of these with images
 *    off and they still look like William Temple House.
 *
 * Email HTML rules that constrain everything here: tables for layout, inline
 * styles only, no CSS variables, no flexbox or grid, no external stylesheets.
 */

/**
 * Pulled from the frontend's light theme so the mail and the app agree.
 * `--primary: 211 60% 40%` and the dark theme's `49 100% 65%`, resolved to hex
 * because email clients do not support `hsl()` reliably and cannot read CSS
 * variables at all.
 */
export const BRAND = {
  /**
   * WTH blue — the frontend's `--primary` in the light theme, so mail and app
   * agree. The logo art itself uses a deeper `#186090`; the UI value is used
   * here because the goal is continuity with the screen staff just left.
   */
  blue: '#2964A3',
  /** A tint of the same blue, for panels. */
  blueTint: '#EDF3F9',
  /** WTH gold — frontend `--primary`, dark theme. Used as an accent rule. */
  gold: '#FFDE4D',
  /** The logo's own ink colour. */
  ink: '#231F20',
  body: '#3F4A56',
  muted: '#6B7684',
  hairline: '#E3E8EE',
  page: '#F4F6F9',
  card: '#FFFFFF',
} as const;

export type EmailLayoutBrand = {
  organizationName: string;
  appName: string;
  tagline: string;
  organizationWebsite: string;
  logoUrl: string;
  colors: typeof BRAND | Record<keyof typeof BRAND, string>;
};

export const DEFAULT_EMAIL_BRAND: EmailLayoutBrand = {
  organizationName: 'MealLine',
  appName: 'MealLine',
  tagline: 'Food access infrastructure',
  organizationWebsite: 'http://localhost:3003',
  logoUrl: '',
  colors: BRAND,
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Absolute, unhashed, and stable across releases.
 *
 * It lives in the frontend's `public/` directory rather than `src/assets`
 * precisely because Vite fingerprints the latter — an email sent today would
 * point at a filename that the next deploy deletes. Nginx serves `public/`
 * verbatim at the site root.
 */
export const logoUrl = (): string => {
  const base = process.env.APP_URL || 'http://localhost:3003/feed';
  return `${base.replace(/\/$/, '')}/brand/mealline-mark.png`;
};

/** Escapes text that came from outside before it goes into markup. */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** A branded call-to-action. Table-based, because Outlook ignores padding on `a`. */
export const button = (href: string, label: string, brand: EmailLayoutBrand = DEFAULT_EMAIL_BRAND): string => `
  <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
    <tr>
      <td align="center" bgcolor="${brand.colors.blue}" style="border-radius: 6px;">
        <a href="${href}" style="display: inline-block; padding: 14px 32px; font-family: ${FONT_STACK}; font-size: 16px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 6px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;

type LayoutOptions = {
  /** Used for the `<title>` and the preheader. */
  title: string;
  /**
   * The one-line summary inbox clients show beside the subject. Without it they
   * scrape the first visible text, which here would be the organisation name —
   * so every FEED email would preview identically.
   */
  preheader: string;
  /** The message body, already marked up. */
  content: string;
  /** Message-specific reassurance, appended above the standing footer. */
  security: string;
};

/**
 * Wraps content in the branded shell: logo, wordmark, accent rule, card, and
 * the standing footer.
 */
export const renderEmail = ({ title, preheader, content, security }: LayoutOptions, brand: EmailLayoutBrand = DEFAULT_EMAIL_BRAND): string => {
  const palette = brand.colors;
  const resolvedLogoUrl = brand.logoUrl || logoUrl();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${palette.page}; font-family: ${FONT_STACK};">
    <!-- Preheader: shown in the inbox list, never on the page. -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; height: 0; width: 0;">
      ${escapeHtml(preheader)}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${palette.page}; padding: 32px 12px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: ${palette.card}; border-radius: 10px; overflow: hidden; border: 1px solid ${palette.hairline};">

            <!--
              Header sits on an explicit white background. The logo is full
              colour on transparency and its wordmark is dark blue, so a client
              that inverts the card for dark mode would drop that text to near
              zero contrast. An explicit bgcolor is the usual defence.
            -->
            <tr>
              <td align="center" bgcolor="#FFFFFF" style="padding: 32px 40px 20px 40px; background-color: #FFFFFF;">
                <img src="${resolvedLogoUrl}" width="64" alt="${escapeHtml(brand.organizationName)}"
                     style="width: 64px; max-width: 100%; height: auto; display: block; border: 0;">
                <p style="margin: 16px 0 0 0; font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${palette.blue};">
                  ${escapeHtml(brand.appName)} &middot; ${escapeHtml(brand.tagline)}
                </p>
              </td>
            </tr>

            <!-- Accent rule: the two brand colours, as live table cells. -->
            <tr>
              <td style="padding: 0 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="${palette.blue}" height="3" style="background-color: ${palette.blue}; font-size: 0; line-height: 0;">&nbsp;</td>
                    <td bgcolor="${palette.gold}" height="3" width="72" style="background-color: ${palette.gold}; font-size: 0; line-height: 0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding: 32px 40px 8px 40px; font-family: ${FONT_STACK}; color: ${palette.body};">
                ${content}
              </td>
            </tr>

            <tr>
              <td style="padding: 24px 40px 32px 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid ${palette.hairline};">
                  <tr>
                    <td style="padding-top: 20px; font-family: ${FONT_STACK}; font-size: 13px; line-height: 20px; color: ${palette.muted};">
                      <p style="margin: 0 0 10px 0;">${security}</p>
                      <p style="margin: 0 0 10px 0;">
                        ${escapeHtml(brand.appName)} will never ask you for a password, and will never ask you to
                        reply to this message with a code.
                      </p>
                      <p style="margin: 0;">
                        Sent by <strong style="color: ${palette.body};">${escapeHtml(brand.organizationName)}</strong> &middot;
                        <a href="${escapeHtml(brand.organizationWebsite)}" style="color: ${palette.blue}; text-decoration: none;">${escapeHtml(brand.organizationWebsite)}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

/** Heading style shared by every message body. */
export const heading = (text: string, brand: EmailLayoutBrand = DEFAULT_EMAIL_BRAND): string =>
  `<h1 style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 22px; line-height: 30px; font-weight: 600; color: ${brand.colors.ink};">${text}</h1>`;

/** Body paragraph. */
export const paragraph = (html: string, extra = '', brand: EmailLayoutBrand = DEFAULT_EMAIL_BRAND): string =>
  `<p style="margin: 0 0 16px 0; font-family: ${FONT_STACK}; font-size: 16px; line-height: 25px; color: ${brand.colors.body};${extra}">${html}</p>`;
