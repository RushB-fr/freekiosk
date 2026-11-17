/**
 * #385: an address typed without a dot, such as `myserver:1124`, was refused as "Invalid URL".
 */
export {};

const { hasUsableHost } = require('../src/utils/urlInput');

describe('hasUsableHost', () => {
  it.each([
    'myserver:1124',
    'myserver:1124/dashboard',
    'localhost',
    'localhost:3000/#/home',
    'homeassistant',
    'ha-server:8123?x=1',
    'user:pass@myserver:8080/path',
    '[::1]:8123',
    'http://myserver:1124',
    'https://nas/index.html',
    'MyServer:80',
  ])('accepts %s, a host without a dot', (input) => {
    expect(hasUsableHost(input)).toBe(true);
  });

  it.each([
    'example.com',
    '192.168.1.20:8123',
    'sub.example.com/path?x=1',
    'my page.html', // accepted before, a dot is enough: nothing that worked stops working
    'http://example.com',
    'https://my.host:8443/a b',
  ])('keeps accepting %s, which the dot rule accepted', (input) => {
    expect(hasUsableHost(input)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'hello world',
    ':1124',
    'myserver:',
    'myserver:abc',
    'my_server:80',
    '-bad:80',
    '/just/a/path',
    'http://',
    'https:///x',
    'my server:8080',
  ])('refuses %j', (input) => {
    expect(hasUsableHost(input)).toBe(false);
  });

  it('ignores the spaces around what was typed', () => {
    expect(hasUsableHost('  myserver:1124  ')).toBe(true);
  });
});
