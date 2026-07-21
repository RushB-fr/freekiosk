/**
 * Ambient declarations for the Web Crypto globals used by secureStorage.ts.
 *
 * React Native's TS config doesn't ship the DOM lib, so `crypto` / `TextEncoder`
 * are unknown to the type-checker even though they exist at runtime (provided by
 * the JS engine / a polyfill). We declare a minimal, well-typed subset rather
 * than pulling in the whole DOM lib (which would also surface `window`,
 * `document`, … that genuinely don't exist in RN).
 *
 * All call sites guard with `typeof crypto !== 'undefined'` and fall back when
 * absent, so these types describe the happy path only.
 */

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare const crypto: {
  readonly subtle: {
    importKey(
      format: 'raw',
      keyData: ArrayBuffer | ArrayBufferView,
      algorithm: { name: string },
      extractable: boolean,
      keyUsages: string[],
    ): Promise<unknown>;
    deriveBits(
      algorithm: { name: string; salt: ArrayBufferView; iterations: number; hash: string },
      baseKey: unknown,
      length: number,
    ): Promise<ArrayBuffer>;
  };
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
