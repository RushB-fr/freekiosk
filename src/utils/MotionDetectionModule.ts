import { NativeModules } from 'react-native';

interface IMotionDetectionModule {
  /** Resolves true when the frame should trigger: motion, and with requireFace a face too. */
  compareImages(imagePath: string, threshold: number, requireFace: boolean): Promise<boolean>;
  reset(): Promise<boolean>;
}

const { MotionDetectionModule } = NativeModules;

if (!MotionDetectionModule) {
  console.error('[MotionDetectionModule] Native module not found. Did you rebuild the app?');
}

export default MotionDetectionModule as IMotionDetectionModule;
