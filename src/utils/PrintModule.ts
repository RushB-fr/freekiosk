import { NativeModules } from 'react-native';

interface PrintModuleType {
  printWebView(title: string | null, paperSize: string | null): Promise<boolean>;
  isPrintAvailable(): Promise<boolean>;
  getPrintSpoolerPackages(): Promise<string[]>;
}

const PrintModule: PrintModuleType = NativeModules.PrintModule;

export default PrintModule;
