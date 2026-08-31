import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
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

    // Safe background initialization (Never blocks UI thread)
    setTimeout(async () => {
      try {
        // 1. Create Android High Priority Notification Channel for Local Notifications
        await LocalNotifications.createChannel({
          id: HEART_CHANNEL_ID,
          name: 'Aile Kalp Bildirimleri',
          description: 'Aile bireylerinden gelen anlık sevgi ve kalp bildirimleri',
          importance: 5,
          visibility: 1,
          sound: 'beep.wav',
          vibration: true,
          lights: true,
          lightColor: '#E11D48',
        }).catch(() => {});

        // 2. Check and Request Local & Push Notification Permissions
        const localPerm = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' as const }));
        console.log('[Push] Local notification permission:', localPerm);

        // 3. Register Push Notifications gracefully
        const permStatus = await PushNotifications.checkPermissions().catch(() => ({ receive: 'prompt' as const }));
        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          await PushNotifications.requestPermissions().catch(() => {});
        }

        // Setup Push Listeners
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
        }).catch(() => {});

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
        }).catch(() => {});

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
        }).catch(() => {});

        // Safely call register without blocking
        await PushNotifications.register().catch((e) => {
          console.warn('[Push] Register skipped or not supported:', e);
        });
      } catch (err) {
        console.warn('[Push] Push init error (safely handled):', err);
      }
    }, 500);
  }

  public notifyHeartReceived(data: { sender_name: string; event_id: string }) {
    // 1. Trigger local in-app subscribers (Celebration Overlay & vibration)
    this.onHeartReceivedCallbacks.forEach((cb) => cb(data));

    // 2. Schedule native notification banner via LocalNotifications
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 1000000),
            title: '❤️ Aileden bir kalp',
            body: `${data.sender_name} size bir kalp gönderdi ❤️`,
            channelId: HEART_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
            extra: {
              type: 'heart',
              eventId: data.event_id,
            },
          },
        ],
      }).catch(() => {});
    }
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
