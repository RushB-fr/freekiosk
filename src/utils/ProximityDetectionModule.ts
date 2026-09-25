import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

interface IProximityDetectionModule {
  /** Whether this device has a hardware proximity sensor. */
  isAvailable(): Promise<boolean>;
  /** Start listening; resolves false if no sensor. */
  start(): Promise<boolean>;
  /** Stop listening. */
  stop(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const { ProximityDetectionModule } = NativeModules;

if (!ProximityDetectionModule) {
  console.error('[ProximityDetectionModule] Native module not found. Did you rebuild the app?');
}

const emitter = ProximityDetectionModule
  ? new NativeEventEmitter(ProximityDetectionModule)
  : null;

/**
 * Subscribe to far -> near transitions (a hand/body moving close to the screen).
 * Returns an unsubscribe function.
 */
export function onProximityNear(handler: () => void): () => void {
  const sub: EmitterSubscription | undefined = emitter?.addListener('proximityNear', handler);
  return () => sub?.remove();
}

export default ProximityDetectionModule as IProximityDetectionModule;
