import { NativeModules } from 'react-native';

interface PrintModuleType {
  printWebView(title?: string): Promise<boolean>;
  isPrintAvailable(): Promise<boolean>;
}

const PrintModule: PrintModuleType = NativeModules.PrintModule;

export default PrintModule;
