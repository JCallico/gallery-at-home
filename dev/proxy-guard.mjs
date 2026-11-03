// Decides who may use the dev server's proxy. The proxy forwards requests to
// any address by design, so it must only serve the app itself. Otherwise a
// website open in the same browser could use it to reach devices on the
// home network, directly or by pointing its own domain at this server (DNS
// rebinding).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const hostName = (hostHeader) => hostHeader.replace(/:\d+$/, '').toLowerCase();

/**
 * @param {{ host?: string, origin?: string, 'sec-fetch-site'?: string }} headers request headers
 * @param {string} [boundHost] the address the server was started on (HOST), also allowed
 */
export function isAllowedProxyRequest(headers, boundHost) {
  const allowed = new Set(LOCAL_HOSTS);
  if (boundHost) allowed.add(boundHost.toLowerCase());

  const host = headers.host;
  if (!host || !allowed.has(hostName(host))) return false;

  // Browsers say where a request came from; only the app's own pages may ask.
  const site = headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = headers.origin;
  if (origin && origin !== 'null') {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
