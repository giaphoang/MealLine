import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { developmentLoginEnabled, isLocalDevelopmentRequest } from '../../../services/auth/development-login';

function request(headers: Record<string, string> = {}, socket: Record<string, unknown> = {}): Request {
  const values = { host: 'localhost:4321', origin: 'http://localhost:4321', ...headers };
  return {
    protocol: 'http',
    socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1', localPort: 4321, ...socket },
    get: (header: string) => values[header as keyof typeof values],
  } as unknown as Request;
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NOURISH_DEV_LOGIN', 'true');
  vi.stubEnv('HOST', '127.0.0.1');
});
afterEach(() => vi.unstubAllEnvs());

describe('explicit local development login boundary', () => {
  it('accepts a direct same-origin localhost request', () => {
    expect(isLocalDevelopmentRequest(request(), true)).toBe(true);
  });
  it.each(['production', 'test', ''])('refuses runtime %s', mode => {
    vi.stubEnv('NODE_ENV', mode);
    expect(developmentLoginEnabled()).toBe(false);
    expect(isLocalDevelopmentRequest(request(), true)).toBe(false);
  });
  it.each(['false', '1', 'yes', ''])('does not treat flag %s as opt-in', flag => {
    vi.stubEnv('NOURISH_DEV_LOGIN', flag);
    expect(developmentLoginEnabled()).toBe(false);
  });
  it.each(['0.0.0.0', '::', '192.0.2.1', ''])('refuses non-loopback listener %s', host => {
    vi.stubEnv('HOST', host);
    expect(developmentLoginEnabled()).toBe(false);
  });
  it('accepts IPv6 loopback and mapped IPv4 loopback sockets', () => {
    expect(isLocalDevelopmentRequest(request({ host: '[::1]:4321', origin: 'http://[::1]:4321' }, { remoteAddress: '::1', localAddress: '::1' }), true)).toBe(true);
    expect(isLocalDevelopmentRequest(request({}, { remoteAddress: '::ffff:127.0.0.1' }), true)).toBe(true);
  });
  it('refuses a remote peer even when Host and Origin claim localhost', () => {
    expect(isLocalDevelopmentRequest(request({}, { remoteAddress: '192.0.2.1' }), true)).toBe(false);
  });
  it('refuses a non-loopback local interface', () => {
    expect(isLocalDevelopmentRequest(request({}, { localAddress: '192.0.2.2' }), true)).toBe(false);
  });
  it.each(['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'])('refuses proxy header %s', header => {
    expect(isLocalDevelopmentRequest(request({ [header]: '127.0.0.1' }), true)).toBe(false);
  });
  it.each(['attacker.invalid:4321', 'localhost.attacker.invalid:4321', 'localhost:4322', 'user@localhost:4321', '127.1:4321'])('refuses unsafe Host %s', host => {
    expect(isLocalDevelopmentRequest(request({ host }), true)).toBe(false);
  });
  it.each(['https://attacker.invalid', 'null', 'http://localhost:4322', 'http://127.0.0.1:4321', 'http://localhost:4321/path'])('refuses mismatched Origin %s', origin => {
    expect(isLocalDevelopmentRequest(request({ origin }), true)).toBe(false);
  });
  it('allows origin-less reads but requires Origin to create a session', () => {
    const req = request();
    const original = req.get.bind(req);
    req.get = ((header: string) => header === 'origin' ? undefined : original(header)) as Request['get'];
    expect(isLocalDevelopmentRequest(req)).toBe(true);
    expect(isLocalDevelopmentRequest(req, true)).toBe(false);
  });
  it.each(['cross-site', 'same-site'])('refuses Fetch Metadata %s', site => {
    expect(isLocalDevelopmentRequest(request({ 'sec-fetch-site': site }), true)).toBe(false);
  });
});
