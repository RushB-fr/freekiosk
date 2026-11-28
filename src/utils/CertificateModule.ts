import { NativeModules } from 'react-native';

export interface CertificateInfo {
  fingerprint: string;
  url: string;
  expiryTime: number;
  expiryDate: string;
  isExpired: boolean;
}

/** A certificate trusted in advance (Settings > Advanced): its SHA-256 fingerprint, 64 lowercase hex characters, and a free label. */
export interface TrustedFingerprint {
  fingerprint: string;
  label: string;
}

interface ICertificateModule {
  clearAcceptedCertificates(): Promise<boolean>;
  getAcceptedCertificates(): Promise<CertificateInfo[]>;
  removeCertificate(fingerprint: string): Promise<boolean>;
  getTrustedFingerprints(): Promise<TrustedFingerprint[]>;
  /** Rejects with INVALID_FINGERPRINT when the value is not a SHA-256 fingerprint. Resolves with the stored form. */
  addTrustedFingerprint(fingerprint: string, label: string): Promise<string>;
  removeTrustedFingerprint(fingerprint: string): Promise<boolean>;
}

const { CertificateModule } = NativeModules;

export default CertificateModule as ICertificateModule;
