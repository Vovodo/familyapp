import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const HEART_CHANNEL_ID = 'family_heart_channel';
export const GENERAL_CHANNEL_ID = 'family_general_channel';

// 3-4 Second Gentle Love Vibration Pattern
export const playHeartVibration = async () => {
  try {
    // 1. Web Vibration API (Android Chrome, PWA, WebView)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }

    // 2. Capacitor Native Haptics pulses
    if (Capacitor.isNativePlatform()) {
      for (let i = 0; i < 4; i++) {
        await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  } catch (err) {
    console.warn('[HeartVibration] Error:', err);
  }
};

class NotificationService {
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
      // Request browser notification permission if available
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }
      return;
    }

    try {
      // 1. Create Android High Priority Notification Channels
      await LocalNotifications.createChannel({
        id: HEART_CHANNEL_ID,
        name: 'Aile Kalp Bildirimleri ❤️',
        description: 'Aile bireylerinden gelen anlık sevgi, titreşim ve kalp bildirimleri',
        importance: 5, // High / Max
        visibility: 1, // Public on lockscreen
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#E11D48',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: GENERAL_CHANNEL_ID,
        name: 'Aile Genel Bildirimleri 🔔',
        description: 'Mesajlar, alışveriş listesi ve hatırlatıcı bildirimleri',
        importance: 4,
        visibility: 1,
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#3B82F6',
      }).catch(() => {});

      // 2. Notification Click Handler
      LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        console.log('[NotificationService] Notification tapped:', notification);
        const extra = notification.notification.extra || {};
        if (extra.type === 'heart') {
          playHeartVibration();
          this.notifyHeartReceived({
            sender_name: extra.senderName || 'Aile Bireyi',
            event_id: extra.eventId || `heart-${Date.now()}`,
          });
        }
      });
    } catch (err) {
      console.warn('[NotificationService] Init error:', err);
    }
  }

  public async notifyHeartReceived(data: { sender_name: string; event_id: string }) {
    // A. Trigger in-app floating animation & vibration
    this.onHeartReceivedCallbacks.forEach((cb) => cb(data));
    playHeartVibration();

    // B. Native Android Notification
    if (Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 1000000),
              title: '❤️ Aileden bir kalp',
              body: `${data.sender_name} size sıcacık bir kalp gönderdi! ❤️`,
              channelId: HEART_CHANNEL_ID,
              smallIcon: 'ic_stat_icon_config_sample',
              extra: {
                type: 'heart',
                senderName: data.sender_name,
                eventId: data.event_id,
              },
            },
          ],
        });
      } catch (err) {
        console.warn('[NotificationService] Local schedule error:', err);
      }
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      // Browser Native Notification
      try {
        new Notification('❤️ Aileden bir kalp', {
          body: `${data.sender_name} size sıcacık bir kalp gönderdi! ❤️`,
          icon: '/icons/icon-192.png',
        });
      } catch {}
    }
  }

  public async checkPermissions(): Promise<{ notifications: boolean; camera: boolean }> {
    let hasNotification = true;
    let hasCamera = true;

    if (Capacitor.isNativePlatform()) {
      try {
        const notifStatus = await LocalNotifications.checkPermissions();
        hasNotification = notifStatus.display === 'granted';
      } catch {
        hasNotification = false;
      }
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      hasNotification = Notification.permission === 'granted';
    }

    return {
      notifications: hasNotification,
      camera: hasCamera,
    };
  }

  public async requestAllPermissions(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const notifRes = await LocalNotifications.requestPermissions();
        return notifRes.display === 'granted';
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
      return true;
    } catch (err) {
      console.warn('[NotificationService] requestAllPermissions error:', err);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
