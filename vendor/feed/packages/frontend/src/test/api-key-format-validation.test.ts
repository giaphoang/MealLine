// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The shape check FEED applies to a pasted API key.
 *
 * It is advisory: it never blocks a save, and the provider's real verdict
 * arrives when the configuration is saved and its entitlement verified against
 * an actual request. Its only job is to catch a paste that plainly is not a
 * key for the chosen provider — a truncated value, the wrong provider's key, a
 * password.
 *
 * It was doing the opposite. Two of the three patterns warned on valid keys:
 *
 *   Anthropic  `[A-Za-z0-9\-]` omitted `_`, but the body after the prefix is
 *              base64url — the `A–Z a–z 0–9 - _` alphabet, around 95
 *              characters — so nearly every real key contained a character the
 *              pattern refused.
 *   Google     required an `AIza` prefix while Google migrates to `AQ.Ab…`
 *              auth keys, which is what AI Studio now issues. It warned on the
 *              format that works and accepted the one being switched off.
 *
 * Nothing tested any of this, which is how both sat in the interface flagging
 * every key an administrator pasted.
 *
 * The sample keys below are structurally realistic and entirely invented — no
 * real credential appears in this repository.
 */

import { describe, expect, test } from 'vitest'

import { validateApiKeyForService } from '@/components/ai-configuration/shared/validation'

/** ~95 base64url characters, as a real Anthropic body is — underscores included. */
const ANTHROPIC_BODY =
  'A1b2C3d4E5f6G7h8I9j0_KLMnoPQRstUVwxYZ-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS'

const accepts = (key: string, service: 'OpenAI' | 'Anthropic' | 'Google') =>
  validateApiKeyForService(key, service).warning === undefined

describe('Anthropic keys', () => {
  test('accepts a standard api03 key whose body contains underscores', () => {
    // The defect in one case: this is the ordinary shape of a Console key.
    expect(accepts(`sk-ant-api03-${ANTHROPIC_BODY}`, 'Anthropic')).toBe(true)
  })

  test('accepts an OAuth token from a first-party tool', () => {
    // `sk-ant-oat01-` is billed against a subscription rather than API credit,
    // but it is still a credential someone may legitimately paste.
    expect(accepts(`sk-ant-oat01-${ANTHROPIC_BODY}`, 'Anthropic')).toBe(true)
  })

  test('accepts an unfamiliar sub-prefix rather than guessing at versions', () => {
    // api03 and oat01 are both versioned. Pinning them would reproduce this
    // defect the next time Anthropic increments one.
    expect(accepts(`sk-ant-api04-${ANTHROPIC_BODY}`, 'Anthropic')).toBe(true)
  })

  test('still warns on something that is plainly not an Anthropic key', () => {
    expect(accepts('hunter2', 'Anthropic')).toBe(false)
    expect(accepts('sk-ant-', 'Anthropic')).toBe(false)
  })

  test('still warns when the wrong provider’s key is pasted', () => {
    expect(accepts(`AIza${'b'.repeat(35)}`, 'Anthropic')).toBe(false)
  })
})

describe('Google keys', () => {
  test('accepts the new AQ. auth key AI Studio now issues', () => {
    // The other half of the defect. Note the dot, which no character class in
    // the old pattern admitted.
    expect(accepts(`AQ.Ab${'C3d4E5f6G7h8I9j0_KLMno-PQRstUVwxYZ'}`, 'Google')).toBe(true)
  })

  test('still accepts a legacy AIza key', () => {
    // Google stops accepting these during September 2026, but a configuration
    // holding one is not a typo — warning about it here would be a different
    // message than "this does not look like a key".
    expect(accepts(`AIza${'b'.repeat(35)}`, 'Google')).toBe(true)
  })

  test('still warns on something that is plainly not a Google key', () => {
    expect(accepts('hunter2', 'Google')).toBe(false)
    expect(accepts('AQ.', 'Google')).toBe(false)
  })

  test('still warns when the wrong provider’s key is pasted', () => {
    expect(accepts(`sk-ant-api03-${ANTHROPIC_BODY}`, 'Google')).toBe(false)
  })
})

describe('OpenAI keys, which were already correct', () => {
  test('accepts standard and project keys', () => {
    expect(accepts(`sk-${'a'.repeat(40)}`, 'OpenAI')).toBe(true)
    expect(accepts(`sk-proj-${'a'.repeat(40)}`, 'OpenAI')).toBe(true)
  })

  test('still warns on a truncated key', () => {
    expect(accepts('sk-short', 'OpenAI')).toBe(false)
  })
})

describe('what the check will and will not do', () => {
  test('an empty key is an error, not a warning', () => {
    // The one case that blocks: everything else is advisory.
    expect(validateApiKeyForService('', 'Google').error).toBeTruthy()
  })

  test('a warning is never an error, however odd the key looks', () => {
    // The provider decides. This check exists to catch a slip before a request
    // is made, not to refuse a credential it does not recognise.
    const result = validateApiKeyForService('plainly-not-a-key', 'Anthropic')

    expect(result.warning).toBeTruthy()
    expect(result.error).toBeUndefined()
  })

  test('surrounding whitespace does not cause a false warning', () => {
    // Pasting from a console or a password manager often brings a newline.
    expect(accepts(`  sk-ant-api03-${ANTHROPIC_BODY}\n`, 'Anthropic')).toBe(true)
  })
})
