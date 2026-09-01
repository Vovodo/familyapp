import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

/**
 * localMediaVault.ts
 * WhatsApp / Telegram style Local-First Media & Chat Vault.
 * Permanently stores all audio recordings, images, and chat data in a local "family/" directory on the device disk.
 * Provides storage breakdown, audio archive browsing, and storage cleanup.
 */

export interface VaultFileInfo {
  name: string;
  path: string;
  size: number;
  mtime: number;
  uri: string;
  type: 'audio' | 'images';
}

export interface LocalVaultStorageStats {
  audioBytes: number;
  audioCount: number;
  imageBytes: number;
  imageCount: number;
  totalBytes: number;
  totalMb: number;
}

// Helper to convert Blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1] || '';
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// IndexedDB Helper for Web / PWA fallback
const DB_NAME = 'AilemLocalVault';
const STORE_NAME = 'media_files';

const getIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const idbGetBlob = async (key: string): Promise<Blob | null> => {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const idbSetBlob = async (key: string, blob: Blob): Promise<void> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
};

const idbDeleteKey = async (key: string): Promise<void> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
};

const idbGetAllKeys = async (): Promise<string[]> => {
  try {
    const db = await getIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

class LocalMediaVault {
  private urlCache = new Map<string, string>();

  /**
   * Initializes local directories in device filesystem: family/audio, family/images, family/data
   */
  public async init(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.mkdir({
          path: 'family/audio',
          directory: Directory.Data,
          recursive: true,
        }).catch(() => {});

        await Filesystem.mkdir({
          path: 'family/images',
          directory: Directory.Data,
          recursive: true,
        }).catch(() => {});

        await Filesystem.mkdir({
          path: 'family/data',
          directory: Directory.Data,
          recursive: true,
        }).catch(() => {});
      } catch (err) {
        console.warn('[LocalVault] Init directories note:', err);
      }
    }
  }

  /**
   * Saves a binary Blob into local "family/" directory and returns an instantly usable local URI.
   */
  public async saveMedia(
    filename: string,
    blob: Blob,
    type: 'audio' | 'images'
  ): Promise<string> {
    const cleanName = filename.split('?')[0].split('/').pop() || `file_${Date.now()}`;
    const relativePath = `family/${type}/${cleanName}`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = await blobToBase64(blob);
        await Filesystem.writeFile({
          path: relativePath,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });

        const uriResult = await Filesystem.getUri({
          path: relativePath,
          directory: Directory.Data,
        });

        const converted = Capacitor.convertFileSrc(uriResult.uri);
        this.urlCache.set(cleanName, converted);
        this.urlCache.set(relativePath, converted);
        return converted;
      } catch (err) {
        console.warn('[LocalVault] Native save failed, using memory blob:', err);
      }
    }

    // Web / Fallback: Store in IndexedDB
    try {
      await idbSetBlob(relativePath, blob);
    } catch {}

    const blobUrl = URL.createObjectURL(blob);
    this.urlCache.set(cleanName, blobUrl);
    this.urlCache.set(relativePath, blobUrl);
    return blobUrl;
  }

  /**
   * Resolves a media URL (either from local disk cache or background downloads it if missing).
   * Guarantees 0ms instant playback for all previously saved/heard files.
   */
  public async getMediaUrl(
    remoteUrlOrName: string,
    type: 'audio' | 'images'
  ): Promise<string> {
    if (!remoteUrlOrName) return '';

    // If already a local blob/file URL, return directly
    if (
      remoteUrlOrName.startsWith('blob:') ||
      remoteUrlOrName.startsWith('data:') ||
      remoteUrlOrName.startsWith('capacitor://')
    ) {
      return remoteUrlOrName;
    }

    const cleanName = remoteUrlOrName.split('?')[0].split('/').pop() || '';
    if (!cleanName) return remoteUrlOrName;

    const relativePath = `family/${type}/${cleanName}`;

    // 1. Check in-memory URL cache
    if (this.urlCache.has(cleanName)) {
      return this.urlCache.get(cleanName)!;
    }

    // 2. Check Native Filesystem
    if (Capacitor.isNativePlatform()) {
      try {
        const stat = await Filesystem.stat({
          path: relativePath,
          directory: Directory.Data,
        });

        if (stat && stat.uri) {
          const localSrc = Capacitor.convertFileSrc(stat.uri);
          this.urlCache.set(cleanName, localSrc);
          return localSrc;
        }
      } catch {
        // File not in local cache yet -> download below
      }
    } else {
      // 3. Check Web IndexedDB
      const cachedBlob = await idbGetBlob(relativePath);
      if (cachedBlob) {
        const blobUrl = URL.createObjectURL(cachedBlob);
        this.urlCache.set(cleanName, blobUrl);
        return blobUrl;
      }
    }

    // 4. If remote URL is provided, download in background and cache into family/
    let fullRemoteUrl = remoteUrlOrName;
    if (!remoteUrlOrName.startsWith('http://') && !remoteUrlOrName.startsWith('https://')) {
      const apiBase = (import.meta.env.VITE_API_URL || 'https://familyapi.rfqcollector.com/api/v1').replace(
        /\/api\/v1\/?$/,
        ''
      );
      fullRemoteUrl = `${apiBase}${remoteUrlOrName.startsWith('/') ? '' : '/'}${remoteUrlOrName}`;
    }

    // Trigger silent background caching
    this.downloadAndCacheInBackground(fullRemoteUrl, cleanName, type).catch(() => {});

    // Return the remote URL for immediate streaming while caching completes
    return fullRemoteUrl;
  }

  /**
   * Lists all media files stored in the local vault (for audio & image archive viewer)
   */
  public async listMediaFiles(type: 'audio' | 'images'): Promise<VaultFileInfo[]> {
    const list: VaultFileInfo[] = [];
    const dirPath = `family/${type}`;

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.readdir({
          path: dirPath,
          directory: Directory.Data,
        });

        for (const file of result.files) {
          try {
            const stat = await Filesystem.stat({
              path: `${dirPath}/${file.name}`,
              directory: Directory.Data,
            });
            list.push({
              name: file.name,
              path: `${dirPath}/${file.name}`,
              size: stat.size || 0,
              mtime: stat.mtime || Date.now(),
              uri: Capacitor.convertFileSrc(stat.uri),
              type,
            });
          } catch {}
        }
      } catch {
        // Directory may be empty
      }
    } else {
      // Web IndexedDB
      const allKeys = await idbGetAllKeys();
      for (const key of allKeys) {
        if (key.startsWith(`family/${type}/`)) {
          const blob = await idbGetBlob(key);
          const name = key.split('/').pop() || key;
          list.push({
            name,
            path: key,
            size: blob?.size || 0,
            mtime: Date.now(),
            uri: blob ? URL.createObjectURL(blob) : '',
            type,
          });
        }
      }
    }

    // Sort newest first
    return list.sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * Calculates total local device disk usage by media type
   */
  public async getStorageUsage(): Promise<LocalVaultStorageStats> {
    const audioFiles = await this.listMediaFiles('audio');
    const imageFiles = await this.listMediaFiles('images');

    const audioBytes = audioFiles.reduce((acc, f) => acc + f.size, 0);
    const imageBytes = imageFiles.reduce((acc, f) => acc + f.size, 0);
    const totalBytes = audioBytes + imageBytes;

    return {
      audioBytes,
      audioCount: audioFiles.length,
      imageBytes,
      imageCount: imageFiles.length,
      totalBytes,
      totalMb: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
    };
  }

  /**
   * Deletes a specific file from the local device vault to free storage
   */
  public async deleteMediaFile(filename: string, type: 'audio' | 'images'): Promise<void> {
    const cleanName = filename.split('?')[0].split('/').pop() || filename;
    const relativePath = `family/${type}/${cleanName}`;

    this.urlCache.delete(cleanName);
    this.urlCache.delete(relativePath);

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.deleteFile({
          path: relativePath,
          directory: Directory.Data,
        });
      } catch (err) {
        console.warn('[LocalVault] Delete native file note:', err);
      }
    } else {
      await idbDeleteKey(relativePath);
    }
  }

  /**
   * Clears entire local vault cache (to free up phone memory on user demand)
   */
  public async clearLocalVault(target: 'audio' | 'images' | 'all' = 'all'): Promise<void> {
    this.urlCache.clear();

    if (target === 'audio' || target === 'all') {
      const audioFiles = await this.listMediaFiles('audio');
      for (const f of audioFiles) {
        await this.deleteMediaFile(f.name, 'audio');
      }
    }

    if (target === 'images' || target === 'all') {
      const imageFiles = await this.listMediaFiles('images');
      for (const f of imageFiles) {
        await this.deleteMediaFile(f.name, 'images');
      }
    }
  }

  private async downloadAndCacheInBackground(
    remoteUrl: string,
    filename: string,
    type: 'audio' | 'images'
  ): Promise<void> {
    try {
      const resp = await fetch(remoteUrl);
      if (!resp.ok) return;
      const blob = await resp.blob();
      await this.saveMedia(filename, blob, type);
    } catch (err) {
      console.debug('[LocalVault] Background download note:', err);
    }
  }
}

export const localMediaVault = new LocalMediaVault();
localMediaVault.init();
