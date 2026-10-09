// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Adversarial coverage for the brand SVG sanitizer.
 *
 * Uploads keep their vector form rather than being rasterized, which buys logo
 * fidelity at the cost of a much larger attack surface: an SVG is a document
 * that can carry script, load remote content, and pull local files through
 * entity expansion. The sanitizer is a denylist, and a denylist is only as good
 * as the list, so these payloads are the standing evidence that the list still
 * holds.
 *
 * Delivery adds `sandbox` CSP as a second line, but this suite deliberately
 * exercises the sanitizer alone — the two defences must not be allowed to
 * quietly depend on each other.
 *
 * Rejecting a payload outright counts as a defence; the assertion is only that
 * active content never survives *into the stored asset*.
 */

import { describe, expect, it } from 'vitest';

import { sanitizeBrandSvg } from '../brand-assets';

const attacks: Array<[string, string]> = [
  ['inline script', `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`],
  ['CDATA script', `<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[alert(1)]]></script></svg>`],
  ['onload on root', `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>`],
  ['mixed-case OnLoad', `<svg xmlns="http://www.w3.org/2000/svg" OnLoad="alert(1)"><rect/></svg>`],
  ['onclick on child', `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>`],
  ['external image', `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x.png"/></svg>`],
  ['external use', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil.test/x.svg#a"/></svg>`],
  ['javascript anchor', `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`],
  ['css import', `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://evil.test/x.css");</style><rect/></svg>`],
  ['style attr data uri', `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(data:image/svg+xml;base64,AAAA)"/></svg>`],
  ['foreignObject script', `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script></foreignObject></svg>`],
  ['animate onbegin', `<svg xmlns="http://www.w3.org/2000/svg"><animate onbegin="alert(1)" attributeName="x"/></svg>`],
  ['set to onload', `<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onload" to="alert(1)"/></svg>`],
  ['namespaced script', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>`],
  ['handler element', `<svg xmlns="http://www.w3.org/2000/svg"><handler type="text/javascript">alert(1)</handler></svg>`],
  ['xml:base pivot', `<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://evil.test/"><rect/></svg>`],
  ['font-face-uri', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><font-face-uri xlink:href="https://evil.test/f.svg"/></svg>`],
  ['xlink:href on animate', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect><animate xlink:href="https://evil.test/x"/></rect></svg>`],
];

const FORBIDDEN = /<script|onload|onclick|onbegin|javascript:|evil\.test|@import|foreignobject|<handler|<animate|<set\b|data:/i;

describe('SVG sanitizer under attack', () => {
  for (const [name, payload] of attacks) {
    it(`neutralises: ${name}`, () => {
      let out = '';
      try {
        out = sanitizeBrandSvg(Buffer.from(payload, 'utf8')).toString('utf8');
      } catch {
        return;
      }
      expect(out, `survived:\n${out}`).not.toMatch(FORBIDDEN);
    });
  }

  it('rejects a DOCTYPE entity expansion', () => {
    const bomb = `<!DOCTYPE svg [<!ENTITY a "AAAA"><!ENTITY b "&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><text>&b;</text></svg>`;
    expect(() => sanitizeBrandSvg(Buffer.from(bomb, 'utf8'))).toThrow();
  });

  it('rejects an XXE file read', () => {
    const xxe = `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>`;
    expect(() => sanitizeBrandSvg(Buffer.from(xxe, 'utf8'))).toThrow();
  });

  it('keeps legitimate vector geometry and local references intact', () => {
    const good = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><defs><linearGradient id="g"><stop offset="0" stop-color="#33A478"/></linearGradient></defs><rect width="100" height="40" fill="url(#g)"/><path d="M0 0h10v10H0z"/></svg>`;
    const out = sanitizeBrandSvg(Buffer.from(good, 'utf8')).toString('utf8');
    expect(out).toContain('linearGradient');
    expect(out).toContain('url(#g)');
    expect(out).toContain('<path');
    expect(out).toContain('viewBox');
  });
});
