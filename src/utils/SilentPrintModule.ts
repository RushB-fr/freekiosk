import { NativeModules } from 'react-native';

export const DEFAULT_ESC_POS_WIDTH_DOTS = 384;

export type PrinterState =
  | 'ready'
  | 'no_printer'
  | 'no_permission'
  | 'paper_out'
  | 'error';

/**
 * 'unknown' means the paper state could not be read. A printer with no paper sensor usually
 * reports 'ok', so 'ok' does not guarantee paper.
 */
export type PaperState = 'ok' | 'out' | 'unknown';

export interface PrinterInfo {
  transport: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  commandSet: string | null;
  hardwareId: string | null;
}

export interface PrinterStatus {
  state: PrinterState;
  paper: PaperState;
  printer: PrinterInfo | null;
}

export interface EscPosPrintOptions {
  widthDots?: number;
  feedLines?: number;
  cut?: boolean;
  threshold?: number;
}

interface SilentPrintModuleType {
  status(): Promise<PrinterStatus>;
  /** Grants only until the printer is unplugged; see UsbPrinterAttachActivity for the durable route. */
  requestPermission(): Promise<boolean>;
  printPage(jobName: string | null, options: EscPosPrintOptions | null): Promise<boolean>;
  printImage(base64: string, options: EscPosPrintOptions | null): Promise<boolean>;
  printTestPage(options: EscPosPrintOptions | null): Promise<boolean>;
}

const SilentPrintModule: SilentPrintModuleType = NativeModules.SilentPrintModule;

export default SilentPrintModule;
