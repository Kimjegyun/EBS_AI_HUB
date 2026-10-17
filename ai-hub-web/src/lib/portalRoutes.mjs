// Reserved portal pages must use the router basename, never an external-app redirect.
export const PORTAL_PAGE_ROOTS = Object.freeze([
  'dashboard', 'installed-apps', 'marketplace', 'modules', 'settings',
  'app-registry', 'users', 'notifications', 'io-log',
  'login', 'signup', 'reset-password', 'pair', 'asset', 'inventory',
]);
const roots = new Set(PORTAL_PAGE_ROOTS);
export function isPortalPagePath(pathname) {
  return typeof pathname === 'string' && pathname.startsWith('/') && roots.has(pathname.split('/')[1].toLowerCase());
}
