/**
 * SHA-256 fingerprints of the certificates a user chose to trust in advance (Settings > Advanced).
 *
 * The WebView client compares the fingerprint of the certificate a server presents with this
 * list and only proceeds on an exact match: there is no "accept everything" path, so the same
 * code can ship in the Play Store build. The native side stores them as 64 lowercase hex
 * characters, the format `getCertificateFingerprint` in the patched react-native-webview produces.
 */

/**
 * Turns what a person pastes into the stored form, or null when it is not a SHA-256 fingerprint.
 * Accepts the output of `openssl x509 -fingerprint -sha256` ("SHA256 Fingerprint=AB:CD:..."),
 * Chrome's "SHA-256" line, the dialog of FreeKiosk, and a bare 64-character hex string.
 */
export function normalizeFingerprint(input: string): string | null {
  if (typeof input !== 'string') return null;
  const afterLabel = input.includes('=') ? input.slice(input.lastIndexOf('=') + 1) : input;
  const hex = afterLabel
    .trim()
    .replace(/^sha-?256\s*[:-]?/i, '')
    .replace(/[\s:-]/g, '')
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/** The same, for a list separated by commas, semicolons or line breaks. Invalid entries are reported apart. */
export function parseFingerprintList(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[,;\n\r]+/)) {
    if (part.trim() === '') continue;
    const fingerprint = normalizeFingerprint(part);
    if (fingerprint === null) invalid.push(part.trim());
    else if (!valid.includes(fingerprint)) valid.push(fingerprint);
  }
  return { valid, invalid };
}

/** "ab12..." -> "AB:12:...", the way certificate tools print it. */
export function formatFingerprint(fingerprint: string): string {
  return (fingerprint.toUpperCase().match(/.{1,2}/g) ?? []).join(':');
}
