// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, it, vi } from 'vitest';

// Rendering templates is a pure check; it does not need a running database.
vi.mock('../../../db', () => ({ default: {} }));

import { ResendService } from '../resend-service';
import { BRAND, type EmailLayoutBrand } from '../email-layout';

/**
 * Sign-in mail is the one message staff get that looks like what they are
 * trained to distrust. These assertions cover the parts that make it
 * recognisable — and the parts that must survive an email client refusing to
 * load remote images.
 */

// `private` is a compile-time notion; the templates are reachable at runtime.
const templates = ResendService as unknown as {
  getMagicLinkTemplate(link: string): string;
  getMagicLinkText(link: string): string;
  getOTPTemplate(code: string): string;
  getOTPText(code: string): string;
  getInvitationTemplate(url: string, email: string): string;
  getInvitationText(url: string, email: string): string;
};

const allHtml = () => [
  ['magic link', templates.getMagicLinkTemplate('https://feed.williamtemple.app/x')],
  ['verification code', templates.getOTPTemplate('123456')],
  ['invitation', templates.getInvitationTemplate('https://feed.williamtemple.app/login', 'a@b.org')],
];

describe('email branding', () => {
  it.each(allHtml())('%s carries the organisation and the palette', (_name, html) => {
    expect(html).toContain('MealLine');
    expect(html).toContain('Food access infrastructure');
    expect(html).toContain(BRAND.blue);
    expect(html).toContain('/brand/mealline-mark.png');
  });

  it.each(allHtml())('%s still identifies MealLine with images blocked', (_name, html) => {
    // Outlook and privacy-filtered clients suppress remote images by default.
    // The wordmark must therefore be live text, and the logo must have alt
    // text — if the brand only existed inside the <img>, the message would
    // arrive anonymous.
    const withoutImages = html.replace(/<img[^>]*>/g, '');

    expect(withoutImages).toContain('MealLine');
    expect(withoutImages).toContain('Food access infrastructure');
    expect(html).toMatch(/<img[^>]+alt="MealLine"/);
  });

  it.each(allHtml())('%s never asks for anything back', (_name, html) => {
    expect(html).toContain('never ask you for a password');
    expect(html).toContain('never ask you to');
  });

  it('shows the code, and escapes anything interpolated', () => {
    expect(templates.getOTPTemplate('482913')).toContain('482913');

    const html = templates.getInvitationTemplate(
      'https://feed.williamtemple.app/login',
      '<script>x</script>@b.org'
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sends a plain-text alternative alongside the HTML', () => {
    // HTML with no text part scores worse with spam filters — the opposite of
    // what this change is for.
    const texts = [
      templates.getMagicLinkText('https://feed.williamtemple.app/x'),
      templates.getOTPText('123456'),
      templates.getInvitationText('https://feed.williamtemple.app/login', 'a@b.org'),
    ];

    for (const text of texts) {
      expect(text).not.toContain('<');
      expect(text).toContain('MealLine');
    }
    expect(texts[1]).toContain('123456');
  });

  it('gives each message its own inbox preview line', () => {
    // Without a preheader, clients scrape the first visible text — which is the
    // same wordmark in every message, so every FEED email would preview alike.
    const previews = allHtml().map(([, html]) => {
      const match = /opacity: 0; color: transparent; height: 0; width: 0;">\s*([^<]+)/.exec(
        html as string
      );
      return match?.[1].trim();
    });

    expect(previews.every(Boolean)).toBe(true);
    expect(new Set(previews).size).toBe(previews.length);
  });

  it('renders a non-default identity and palette from the shared brand contract', () => {
    const stJohns: EmailLayoutBrand = {
      organizationName: 'St. Johns Food Share',
      appName: 'FEED',
      tagline: 'Food access with dignity and choice',
      organizationWebsite: 'https://www.stjohnsfoodshare.org/',
      logoUrl: 'https://example.org/api/brand/assets/logo-id',
      colors: {
        ...BRAND,
        blue: '#047857',
        gold: '#2d2d2d',
      },
    };
    const customTemplates = ResendService as unknown as {
      getOTPTemplate(code: string, brand: EmailLayoutBrand): string;
      getOTPText(code: string, brand: EmailLayoutBrand): string;
    };
    const html = customTemplates.getOTPTemplate('482913', stJohns);
    const text = customTemplates.getOTPText('482913', stJohns);
    expect(html).toContain('St. Johns Food Share');
    expect(html).toContain('Food access with dignity and choice');
    expect(html).toContain('#047857');
    expect(html).toContain(stJohns.logoUrl);
    expect(html).not.toContain('feed.williamtemple.app');
    expect(text).toContain('St. Johns Food Share');
  });
});
