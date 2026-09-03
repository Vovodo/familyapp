import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

interface VoiceChannelNativePlugin {
  start(options: { title: string; text: string; muted: boolean }): Promise<void>;
  update(options: { title: string; text: string; muted: boolean }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'muteToggle' | 'leave' | 'returnToApp',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<VoiceChannelNativePlugin>('VoiceChannel');

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const voiceChannelNative = {
  async start(title: string, text: string, muted: boolean): Promise<void> {
    if (!isNative()) return;
    try {
      await Native.start({ title, text, muted });
    } catch {
      // WebView / yetki yoksa sohbet sesi yine çalışır
    }
  },

  async update(title: string, text: string, muted: boolean): Promise<void> {
    if (!isNative()) return;
    try {
      await Native.update({ title, text, muted });
    } catch {
      // ignore
    }
  },

  async stop(): Promise<void> {
    if (!isNative()) return;
    try {
      await Native.stop();
    } catch {
      // ignore
    }
  },

  async addListener(
    eventName: 'muteToggle' | 'leave' | 'returnToApp',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle | null> {
    if (!isNative()) return null;
    try {
      return await Native.addListener(eventName, listenerFunc);
    } catch {
      return null;
    }
  },
};
