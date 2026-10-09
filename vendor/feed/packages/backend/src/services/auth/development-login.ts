import type { Request } from 'express';

export const DEVELOPER_USER_ID = 'nourish-local-developer';
export const DEVELOPER_EMAIL = 'local-developer@nourish.localhost.invalid';
export const DEVELOPER_SESSION_MS = 60 * 60 * 1000;

const isLoopback = (address: string | undefined): boolean =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

export const developmentLoginEnabled = (): boolean =>
  process.env.NODE_ENV === 'development'
  && process.env.NOURISH_DEV_LOGIN === 'true'
  && isLoopback(process.env.HOST);

/** Use the socket, not proxy-controlled req.ip/hostname. Host and Origin also
 * prevent a foreign website or DNS-rebinding host from acquiring a session. */
export function isLocalDevelopmentRequest(req: Request, requireOrigin = false): boolean {
  if (!developmentLoginEnabled()
    || !isLoopback(req.socket.remoteAddress)
    || !isLoopback(req.socket.localAddress)) return false;

  if (['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']
    .some(header => req.get(header) !== undefined)) return false;

  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;

  try {
    const host = req.get('host');
    if (!host) return false;
    const url = new URL(`${req.protocol}://${host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.host !== host.toLowerCase()
      || Number(url.port || (req.protocol === 'https' ? 443 : 80)) !== req.socket.localPort) return false;

    const origin = req.get('origin');
    return origin === undefined ? !requireOrigin : origin === url.origin;
  } catch {
    return false;
  }
}
