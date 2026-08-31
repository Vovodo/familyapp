import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { api, storage } from './api';

export const HEART_CHANNEL_ID = 'family_heart_channel';

// 3-4 Second Gentle Love Vibration Pattern
export const playHeartVibration = async () => {
  try {
    // 1. Web Vibration API (Works on Android Web / Chrome / PWA / WebView)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }

    // 2. Capacitor Haptics pulses
    if (Capacitor.isNativePlatform()) {
      for (let i = 0; i < 4; i++) {
        await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  } catch (err) {
    console.warn('[HeartVibration] Vibration error:', err);
  }
};

class PushNotificationService {
  private isInitialized = false;
  private onHeartReceivedCallbacks: Set<(data: { sender_name: string; event_id: string }) => void> = new Set();

  public subscribeHeartReceived(cb: (data: { sender_name: string; event_id: string }) => void) {
    this.onHeartReceivedCallbacks.add(cb);
    return () => {
      this.onHeartReceivedCallbacks.delete(cb);
    };
  }

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (!Capacitor.isNativePlatform()) {
      console.log('[Push] Running in Web mode.');
      return;
    }

    try {
      // 1. Create Android High Priority Notification Channel with 3-4s Vibration Pattern
      await PushNotifications.createChannel({
        id: HEART_CHANNEL_ID,
        name: 'Aile Kalp Bildirimleri',
        description: 'Aile bireylerinden gelen anlık sevgi ve kalp bildirimleri',
        importance: 5, // High / Max Importance
        visibility: 1, // Public on lockscreen
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#E11D48',
      }).catch((e) => console.warn('[Push] Channel creation note:', e));

      // 2. Request Notification Permissions
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive === 'granted') {
        // Register with Google FCM
        await PushNotifications.register();
      }

      // 3. Listen for FCM Device Token Registration
      PushNotifications.addListener('registration', async (token: Token) => {
        console.log('[Push] FCM Token received:', token.value);
        let deviceId = await storage.get('ailem_device_id');
        if (!deviceId) {
          deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await storage.set('ailem_device_id', deviceId);
        }

        try {
          await api.post('/notifications/device-token', {
            device_id: deviceId,
            token: token.value,
            platform: Capacitor.getPlatform(),
          });
        } catch (err) {
          console.warn('[Push] Failed to register token with backend:', err);
        }
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.warn('[Push] FCM Registration Error:', error);
      });

      // 4. Listen for Foreground Push Notifications
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('[Push] Foreground notification received:', notification);
        const data = notification.data || {};
        if (data.type === 'heart') {
          playHeartVibration();
          this.notifyHeartReceived({
            sender_name: data.sender_name || 'Aile Bireyi',
            event_id: data.heart_id || `heart-${Date.now()}`,
          });
        }
      });

      // 5. Listen for Notification Tapped / Action Performed
      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        console.log('[Push] Notification tapped:', action);
        const data = action.notification.data || {};
        if (data.type === 'heart') {
          playHeartVibration();
          this.notifyHeartReceived({
            sender_name: data.sender_name || 'Aile Bireyi',
            event_id: data.heart_id || `heart-${Date.now()}`,
          });
        }
      });
    } catch (err) {
      console.warn('[Push] Push init error:', err);
    }
  }

  public notifyHeartReceived(data: { sender_name: string; event_id: string }) {
    this.onHeartReceivedCallbacks.forEach((cb) => cb(data));
  }

  public async unregisterDeviceToken() {
    try {
      const deviceId = await storage.get('ailem_device_id');
      if (deviceId) {
        await api.delete(`/notifications/device-token?device_id=${deviceId}`).catch(() => {});
      }
    } catch (err) {
      console.warn('[Push] Token unregister error:', err);
    }
  }
}

export const pushNotificationService = new PushNotificationService();
