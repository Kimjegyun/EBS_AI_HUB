import { isPortalPagePath } from '../src/lib/portalRoutes.mjs';

// Recover only known old SPA links; private endpoints and unknown paths stay unpublished.
export function legacyPortalLocation(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return null;
  const raw = req.url || '/';
  const pathname = raw.split(/[?#]/)[0];
  if (!isPortalPagePath(pathname) || /[%\\]/.test(pathname) || pathname.split('/').some(part => part === '.' || part === '..')) return null;
  let portal = 'user';
  try {
    const source = new URL(req.headers?.referer);
    const match = source.pathname.match(/^\/(admin|user)(?:\/|$)/);
    if (/^https?:$/.test(source.protocol) && source.host === String(req.headers?.host || '').toLowerCase() && match) portal = match[1];
  } catch { /* Direct old links use the public user portal. */ }
  return '/' + portal + raw;
}
