import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { api, storage } from './api';

export const HEART_CHANNEL_ID = 'family_heart_channel_v2';
export const GENERAL_CHANNEL_ID = 'family_general_channel';
export const TEA_CHANNEL_ID = 'family_tea_channel_v2';
export const CAR_CHANNEL_ID = 'family_car_channel_v2';
export const MEAL_CHANNEL_ID = 'family_meal_channel_v2';
export const POKE_CHANNEL_ID = 'family_poke_channel_v2';
export const REMINDERS_CHANNEL_ID = 'family_reminders_channel';

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
  private pushListenersAttached = false;
  private pendingFcmToken: string | null = null;
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
      // 1. Create Android High Priority Notification Channels (For both Local & FCM Push)
      await LocalNotifications.createChannel({
        id: HEART_CHANNEL_ID,
        name: 'Aile Kalp Bildirimleri ❤️',
        description: 'Aile bireylerinden gelen anlık sevgi, titreşim ve kalp bildirimleri',
        importance: 5,
        visibility: 1,
        sound: 'heart.wav',
        vibration: true,
        lights: true,
        lightColor: '#E11D48',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: TEA_CHANNEL_ID,
        name: '☕ Çay Koydum Bildirimleri',
        description: 'Çay karıştırma sesi ile çay hazır bildirimleri',
        importance: 5,
        visibility: 1,
        sound: 'tea.wav',
        vibration: true,
        lights: true,
        lightColor: '#D97706',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: CAR_CHANNEL_ID,
        name: '🚗 Eve Geliyorum Bildirimleri',
        description: 'Korna sesi ile eve geliyorum bildirimleri',
        importance: 5,
        visibility: 1,
        sound: 'car_horn.wav',
        vibration: true,
        lights: true,
        lightColor: '#2563EB',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: MEAL_CHANNEL_ID,
        name: '🍲 Yemek Hazır Bildirimleri',
        description: 'Çan sesi ile sofra hazır bildirimleri',
        importance: 5,
        visibility: 1,
        sound: 'meal.wav',
        vibration: true,
        lights: true,
        lightColor: '#059669',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: POKE_CHANNEL_ID,
        name: '👉 Dürtme Bildirimleri',
        description: 'Aile bireylerinden gelen anlık dürtme uyarıları',
        importance: 5,
        visibility: 1,
        sound: 'poke.wav',
        vibration: true,
        lights: true,
        lightColor: '#F97316',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: REMINDERS_CHANNEL_ID,
        name: '⏰ Hatırlatıcılar',
        description: 'Önemli aile ve kişisel hatırlatma alarmları',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#F59E0B',
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: GENERAL_CHANNEL_ID,
        name: 'Aile Mesaj ve Bildirimleri 🔔',
        description: 'Sohbet mesajları, alışveriş listesi ve görev bildirimleri',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#3B82F6',
      }).catch(() => {});

      // 2. Setup Firebase Cloud Messaging (FCM) Push Listeners
      await this.setupPushNotifications();

      // 3. Local Notification Click Handler
      LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        console.log('[NotificationService] Local notification tapped:', notification);
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

  private async setupPushNotifications() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      if (!this.pushListenersAttached) {
        this.pushListenersAttached = true;

        await PushNotifications.addListener('registration', async (token: Token) => {
          console.log('[FCM] Push token received:', token.value);
          this.pendingFcmToken = token.value;
          await storage.set('pending_fcm_token', token.value);
          await this.registerTokenWithBackend(token.value);
        });

        await PushNotifications.addListener('registrationError', (error: unknown) => {
          console.warn('[FCM] Registration error:', error);
        });

        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[FCM] Push received in foreground:', notification);
          const data = notification.data || {};
          if (data.type === 'heart') {
            this.notifyHeartReceived({
              sender_name: data.sender_name || 'Aile Bireyi',
              event_id: data.heart_id || `heart-${Date.now()}`,
            });
          }
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
          console.log('[FCM] Push action performed:', action);
          const data = action.notification.data || {};
          if (data.type === 'heart') {
            this.notifyHeartReceived({
              sender_name: data.sender_name || 'Aile Bireyi',
              event_id: data.heart_id || `heart-${Date.now()}`,
            });
          }
        });
      }

      await this.ensurePushRegistered();
    } catch (e) {
      console.warn('[FCM] Setup error:', e);
    }
  }

  /** Call after login or when notification permission is newly granted. */
  public async ensurePushRegistered(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive !== 'granted') return;

      await PushNotifications.register();

      const cached = this.pendingFcmToken || (await storage.get('pending_fcm_token'));
      if (cached) {
        await this.registerTokenWithBackend(cached);
      }
    } catch (e) {
      console.warn('[FCM] ensurePushRegistered error:', e);
    }
  }

  /** Re-sync FCM token with backend when auth session becomes available. */
  public async syncPushRegistration(): Promise<void> {
    await this.ensurePushRegistered();
    const cached = this.pendingFcmToken || (await storage.get('pending_fcm_token'));
    if (cached) {
      await this.registerTokenWithBackend(cached);
    }
  }

  public async registerTokenWithBackend(token: string) {
    try {
      const authToken = await storage.get('auth_token');
      if (!authToken) {
        this.pendingFcmToken = token;
        await storage.set('pending_fcm_token', token);
        console.log('[FCM] Token cached; will register after login.');
        return;
      }

      let deviceId = await storage.get('device_uuid');
      if (!deviceId) {
        deviceId = `dev-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
        await storage.set('device_uuid', deviceId);
      }

      await api.post('/notifications/device-token', {
        token,
        device_id: deviceId,
        platform: 'android',
      });
      this.pendingFcmToken = token;
      await storage.set('pending_fcm_token', token);
      console.log('[FCM] Device token registered with backend successfully.');
    } catch (err) {
      console.warn('[FCM] Failed to register device token with backend:', err);
    }
  }

  public async unregisterToken() {
    try {
      const deviceId = await storage.get('device_uuid');
      if (deviceId) {
        await api.delete(`/notifications/device-token?device_id=${deviceId}`);
        console.log('[FCM] Device token unregistered from backend.');
      }
    } catch (err) {
      console.warn('[FCM] Failed to unregister device token:', err);
    }
  }

  public async notifyHeartReceived(data: { sender_name: string; event_id: string }) {
    // A. Trigger in-app floating animation & vibration
    this.onHeartReceivedCallbacks.forEach((cb) => cb(data));
    playHeartVibration();

    // B. Schedule local notification if needed (when app is in foreground)
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
        const notifStatus = await PushNotifications.checkPermissions();
        hasNotification = notifStatus.receive === 'granted';
      } catch {
        try {
          const localStatus = await LocalNotifications.checkPermissions();
          hasNotification = localStatus.display === 'granted';
        } catch {
          hasNotification = false;
        }
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
        const pushRes = await PushNotifications.requestPermissions();
        if (pushRes.receive === 'granted') {
          await this.ensurePushRegistered();
        }
        await LocalNotifications.requestPermissions();
        return pushRes.receive === 'granted';
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
