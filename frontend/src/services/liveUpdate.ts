import { Capacitor } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { Preferences } from '@capacitor/preferences';

const LAST_BUNDLE_KEY = 'ailem_active_bundle_id';
const UPDATE_CHECK_URL = 'https://family.rfqcollector.com/live-updates/version.json';

export interface UpdateManifest {
  version: string;
  buildTimestamp: number;
  bundleId: string;
  url: string;
}

export const liveUpdateService = {
  /**
   * Initializes LiveUpdate and informs plugin that the app is ready.
   */
  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LiveUpdate.ready();
    } catch (err) {
      console.warn('[LiveUpdate] ready() call failed:', err);
    }
  },

  /**
   * Checks for a new OTA bundle and downloads it in the background.
   */
  async checkForUpdate(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      // 1. Informs plugin app is ready
      await this.init();

      // 2. Fetch remote manifest with cache buster
      const res = await fetch(`${UPDATE_CHECK_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) {
        return false;
      }

      const manifest: UpdateManifest = await res.json();
      if (!manifest || !manifest.bundleId || !manifest.url) {
        return false;
      }

      // 3. Check current active bundle
      const { value: currentBundleId } = await Preferences.get({ key: LAST_BUNDLE_KEY });
      const currentNativeBundle = await LiveUpdate.getCurrentBundle().catch(() => null);

      if (
        currentBundleId === manifest.bundleId ||
        currentNativeBundle?.bundleId === manifest.bundleId
      ) {
        console.log('[LiveUpdate] Already on latest bundle:', manifest.bundleId);
        return false;
      }

      console.log('[LiveUpdate] New bundle available:', manifest.bundleId, 'Downloading...');

      // 4. Download the new bundle .zip
      await LiveUpdate.downloadBundle({
        url: manifest.url,
        bundleId: manifest.bundleId,
      });

      // 5. Set as the next bundle for next session / reload
      await LiveUpdate.setNextBundle({
        bundleId: manifest.bundleId,
      });

      await Preferences.set({
        key: LAST_BUNDLE_KEY,
        value: manifest.bundleId,
      });

      console.log('[LiveUpdate] Successfully downloaded and set next bundle:', manifest.bundleId);
      return true;
    } catch (err) {
      console.warn('[LiveUpdate] Check/Download failed gracefully:', err);
      return false;
    }
  },

  /**
   * Force reloads the app to apply the downloaded bundle immediately.
   */
  async reload(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      window.location.reload();
      return;
    }
    try {
      await LiveUpdate.reload();
    } catch {
      window.location.reload();
    }
  },
};
