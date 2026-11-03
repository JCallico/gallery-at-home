import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module, no types
import { isAllowedProxyRequest } from '../dev/proxy-guard.mjs';
// @ts-expect-error plain JavaScript module, no types
import { stripTags } from '../scripts/samples/strip-tags.mjs';

describe('dev server proxy guard', () => {
  const local = 'localhost:5173';

  it('allows the app itself', () => {
    expect(isAllowedProxyRequest({ host: local })).toBe(true);
    expect(isAllowedProxyRequest({ host: local, origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(isAllowedProxyRequest({ host: '127.0.0.1:5173' })).toBe(true);
  });

  it('allows opening a proxy link directly', () => {
    expect(isAllowedProxyRequest({ host: local, 'sec-fetch-site': 'none' })).toBe(true);
  });

  it('refuses other websites in the same browser', () => {
    expect(isAllowedProxyRequest({ host: local, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(isAllowedProxyRequest({ host: local, origin: 'https://evil.example' })).toBe(false);
    expect(isAllowedProxyRequest({ host: local, 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(isAllowedProxyRequest({ host: local, 'sec-fetch-site': 'same-site' })).toBe(false);
  });

  it('refuses DNS rebinding (another domain pointed at this server)', () => {
    expect(isAllowedProxyRequest({ host: 'evil.example:5173' })).toBe(false);
    expect(isAllowedProxyRequest({ host: 'evil.example:5173', origin: 'http://evil.example:5173' })).toBe(false);
    expect(isAllowedProxyRequest({})).toBe(false);
  });

  it('allows the address the server was deliberately started on', () => {
    expect(isAllowedProxyRequest({ host: '192.168.2.122:5173' })).toBe(false);
    expect(isAllowedProxyRequest({ host: '192.168.2.122:5173' }, '192.168.2.122')).toBe(true);
  });

  it('refuses a malformed origin', () => {
    expect(isAllowedProxyRequest({ host: local, origin: 'not a url' })).toBe(false);
  });
});

describe('stripTags', () => {
  it('leaves plain text from Commons metadata', () => {
    expect(stripTags('<a href="x">Dietmar   Rabich</a>')).toBe('Dietmar Rabich');
    expect(stripTags(undefined)).toBe('');
  });

  it('removes tags hidden inside tags', () => {
    expect(stripTags('<scr<b>ipt>alert(1)</scr</b>ipt>')).not.toMatch(/[<>]/);
    expect(stripTags('<<b>script>x')).not.toContain('<script');
  });

  it('removes stray brackets', () => {
    expect(stripTags('a < b > c')).toBe('a c');
    expect(stripTags('<img src=x')).toBe('img src=x');
  });
});
