import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

/** Android 3-button / status bar often reports 0 for env(safe-area-*). */
export function applySafeAreaInsets() {
  const native = Capacitor.isNativePlatform();
  const android = Capacitor.getPlatform() === 'android';
  const ios = Capacitor.getPlatform() === 'ios';
  const root = document.documentElement;
  root.style.setProperty('--sat-fallback', native ? (android ? '36px' : ios ? '47px' : '0px') : '0px');
  root.style.setProperty('--sab-fallback', native ? (android ? '48px' : ios ? '34px' : '0px') : '0px');

  if (!native) return;
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
}
