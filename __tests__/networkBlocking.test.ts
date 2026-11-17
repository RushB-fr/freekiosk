import {
  normalizeNetworkBlockInput,
  normalizeNetworkBlockRules,
  YOUTUBE_NETWORK_BLOCK_RULES,
} from '../src/types/networkBlocking';

describe('network blocking rules', () => {
  it('normalizes URLs, domains, IP addresses, and CIDRs', () => {
    expect(normalizeNetworkBlockInput('https://WWW.YouTube.com/watch?v=1')).toEqual({
      id: 'domain:www.youtube.com',
      type: 'domain',
      value: 'www.youtube.com',
      preset: undefined,
    });
    expect(normalizeNetworkBlockInput('203.0.113.9')).toMatchObject({ value: '203.0.113.9/32' });
    expect(normalizeNetworkBlockInput('203.0.113.0/24')).toMatchObject({ value: '203.0.113.0/24' });
    expect(normalizeNetworkBlockInput('192.168.1.42/24')).toMatchObject({ value: '192.168.1.0/24' });
    expect(normalizeNetworkBlockInput('2001:db8::1')).toMatchObject({ value: '2001:db8::1/128' });
  });

  it('rejects invalid and dangerously broad routes', () => {
    expect(normalizeNetworkBlockInput('not a host')).toBeNull();
    expect(normalizeNetworkBlockInput('999.1.1.1')).toBeNull();
    expect(normalizeNetworkBlockInput('0.0.0.0/0')).toBeNull();
    expect(normalizeNetworkBlockInput('::/0')).toBeNull();
  });

  it('deduplicates rules and supplies the YouTube domain family', () => {
    expect(normalizeNetworkBlockRules(['youtube.com', { value: 'YOUTUBE.COM' }])).toHaveLength(1);
    expect(YOUTUBE_NETWORK_BLOCK_RULES.map(rule => rule.value)).toEqual(expect.arrayContaining([
      'youtube.com',
      'youtubei.googleapis.com',
      'googlevideo.com',
      'ytimg.com',
    ]));
  });
});
