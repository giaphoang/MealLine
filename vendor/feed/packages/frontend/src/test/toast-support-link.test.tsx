// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { linkifyMessage } from '@/services/message/linkify';
import { SUPPORT_CONTACT_SENTENCE, SUPPORT_ISSUES_URL } from '@/lib/support';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

const renderMessage = (message: string) =>
  render(<div data-testid="msg">{linkifyMessage(message)}</div>);

describe('a message that names a URL becomes clickable', () => {
  test('the support sentence renders one link to the issue tracker', () => {
    renderMessage(`FEED could not complete that request. ${SUPPORT_CONTACT_SENTENCE}`);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', SUPPORT_ISSUES_URL);
    expect(link).toHaveAttribute('target', '_blank');
    // Opening in a new tab without this hands the opener to the destination.
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('the sentence tells the reader an account is needed before they leave', () => {
    renderMessage(SUPPORT_CONTACT_SENTENCE);
    expect(screen.getByTestId('msg')).toHaveTextContent(
      'a free GitHub account is needed to post'
    );
  });

  test('the full message survives, punctuation and all', () => {
    renderMessage(`Something broke. ${SUPPORT_CONTACT_SENTENCE}`);
    expect(screen.getByTestId('msg')).toHaveTextContent(
      `Something broke. ${SUPPORT_CONTACT_SENTENCE}`
    );
  });

  test('a sentence-ending period stays text and never enters the href', () => {
    renderMessage('Report it at https://example.org/issues.');
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/issues');
    expect(screen.getByTestId('msg')).toHaveTextContent('https://example.org/issues.');
  });

  test('a balanced bracket inside a URL is kept', () => {
    renderMessage('See https://example.org/wiki/Foo_(bar) for more.');
    expect(screen.getByRole('link'))
      .toHaveAttribute('href', 'https://example.org/wiki/Foo_(bar)');
  });

  test('two URLs make two links', () => {
    renderMessage('Try https://a.example/one then https://b.example/two now.');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('messages without a URL are untouched', () => {
  test('a plain message is returned as the original string, not a node', () => {
    const plain = 'Template names must be 48 characters or fewer.';
    expect(linkifyMessage(plain)).toBe(plain);
  });

  test('a bare host is not guessed into a link', () => {
    // The old copy said "contact support at github.com/MattGeiger". Inventing
    // a scheme for arbitrary text is how a linkifier starts eating sentences.
    renderMessage('Contact support at github.com/MattGeiger');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('the support sentence reaches the user at all', () => {
  // The toast screen rejects anything that looks like a developer artifact,
  // and its path heuristic is close enough to a URL to be worth proving
  // against — a message silently swallowed here would never be seen.
  const presentable = (message: string): boolean =>
    (ErrorHandlerService as unknown as {
      isUserPresentableMessage: (value: string, hasServerCode?: boolean) => boolean;
    }).isUserPresentableMessage(message, false);

  test('the longest message carrying the sentence still passes, uncoded', () => {
    const longest =
      `We couldn't recover your pending translations. Please try again later. ${SUPPORT_CONTACT_SENTENCE}`;
    expect(longest.length).toBeLessThan(240);
    expect(presentable(longest)).toBe(true);
  });

  test('the URL is not mistaken for a filesystem path', () => {
    expect(presentable(SUPPORT_CONTACT_SENTENCE)).toBe(true);
  });
});
