import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const mediaStorage = {
  /**
   * Saves a photo to the user's phone in the "Ailem" folder.
   */
  async savePhotoLocally(base64Data: string, filename?: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return null;
    }

    try {
      const name = filename || `ailem_${Date.now()}.jpg`;
      const folder = 'Ailem';

      // Clean base64 prefix if present
      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

      const result = await Filesystem.writeFile({
        path: `${folder}/${name}`,
        data: cleanBase64,
        directory: Directory.Documents,
        recursive: true,
      });

      console.log('[MediaStorage] Photo saved to device:', result.uri);
      return result.uri;
    } catch (err) {
      console.warn('[MediaStorage] Could not save photo to device folder:', err);
      return null;
    }
  },
};
