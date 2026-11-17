export type NetworkBlockRuleType = 'domain' | 'ip';

export interface NetworkBlockRule {
  id: string;
  type: NetworkBlockRuleType;
  value: string;
  preset?: 'youtube';
}

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
const IPV6_PATTERN = /^[0-9a-f:]+(?:\/\d{1,3})?$/i;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const normalizeIpv4 = (input: string): string | null => {
  if (!IPV4_PATTERN.test(input)) return null;
  const [address, prefixText] = input.split('/');
  const octets = address.split('.').map(Number);
  if (octets.some(value => value < 0 || value > 255)) return null;
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 8 || prefix > 32) return null;
  const addressValue = octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  const networkValue = (addressValue & mask) >>> 0;
  const networkOctets = [24, 16, 8, 0].map(shift => (networkValue >>> shift) & 0xff);
  return `${networkOctets.join('.')}/${prefix}`;
};

const normalizeIpv6 = (input: string): string | null => {
  if (!input.includes(':') || !IPV6_PATTERN.test(input)) return null;
  const [address, prefixText] = input.toLowerCase().split('/');
  if ((address.match(/::/g) || []).length > 1) return null;
  const groups = address.split(':').filter(Boolean);
  if (groups.length > 8 || groups.some(group => group.length > 4)) return null;
  const prefix = prefixText === undefined ? 128 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 16 || prefix > 128) return null;
  return `${address}/${prefix}`;
};

const extractHost = (rawInput: string): string => {
  let input = rawInput.trim().toLowerCase();
  input = input.replace(/^https?:\/\//, '');
  input = input.split(/[?#]/, 1)[0];
  const isCidr = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]+)\/\d{1,3}$/i.test(input);
  if (!isCidr) input = input.split('/', 1)[0];
  if (input.startsWith('[') && input.includes(']')) {
    const closingBracket = input.indexOf(']');
    return input.slice(1, closingBracket) + input.slice(closingBracket + 1);
  }
  return (input.match(/:/g) || []).length === 1 ? input.replace(/:\d+$/, '') : input;
};

export const normalizeNetworkBlockInput = (
  rawInput: string,
  preset?: NetworkBlockRule['preset'],
): NetworkBlockRule | null => {
  const host = extractHost(rawInput).replace(/^\*\./, '').replace(/\.$/, '');
  const ipv4 = normalizeIpv4(host);
  if (ipv4) return { id: `ip:${ipv4}`, type: 'ip', value: ipv4, preset };
  const ipv6 = normalizeIpv6(host);
  if (ipv6) return { id: `ip:${ipv6}`, type: 'ip', value: ipv6, preset };
  if (!DOMAIN_PATTERN.test(host)) return null;
  return { id: `domain:${host}`, type: 'domain', value: host, preset };
};

export const normalizeNetworkBlockRules = (input: unknown): NetworkBlockRule[] => {
  if (!Array.isArray(input)) return [];
  const rules = new Map<string, NetworkBlockRule>();
  input.forEach(entry => {
    const value = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object' && typeof (entry as any).value === 'string'
        ? (entry as any).value
        : '';
    const preset = entry && typeof entry === 'object' && (entry as any).preset === 'youtube'
      ? 'youtube'
      : undefined;
    const normalized = normalizeNetworkBlockInput(value, preset);
    if (normalized) rules.set(normalized.id, normalized);
  });
  return Array.from(rules.values());
};

const YOUTUBE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'youtubei.googleapis.com',
  'youtube.googleapis.com',
  'googlevideo.com',
  'ytimg.com',
  'ggpht.com',
];

export const YOUTUBE_NETWORK_BLOCK_RULES: NetworkBlockRule[] = YOUTUBE_DOMAINS.map(value =>
  normalizeNetworkBlockInput(value, 'youtube')!,
);
