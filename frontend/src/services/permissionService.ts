import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera as CapCamera } from '@capacitor/camera';
import { App } from '@capacitor/app';
import { notificationService } from './notificationService';

export interface PermissionStatusReport {
  notifications: boolean;
  camera: boolean;
  microphone: boolean;
  exactAlarms: boolean;
  allGranted: boolean;
}

export interface PermissionDetail {
  id: 'notifications' | 'microphone' | 'camera' | 'alarms';
  title: string;
  category: string;
  description: string;
  granted: boolean;
  critical: boolean;
}

const MIC_GRANTED_KEY = 'ailem_mic_granted';

class PermissionManagerService {
  private microphoneGrantedThisSession = false;

  public markMicrophoneGranted(): void {
    this.microphoneGrantedThisSession = true;
    try {
      localStorage.setItem(MIC_GRANTED_KEY, '1');
    } catch {
      // ignore
    }
  }

  public markMicrophoneDenied(): void {
    this.microphoneGrantedThisSession = false;
    try {
      localStorage.removeItem(MIC_GRANTED_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Android WebView'de navigator.permissions.query('microphone') native
   * RECORD_AUDIO verilmiş olsa bile çoğu zaman prompt/denied döner.
   * Sohbet kaydı getUserMedia ile çalışır; UI o yüzden yalan kırmızı gösteriyordu.
   */
  private async checkMicrophonePermission(): Promise<boolean> {
    if (this.microphoneGrantedThisSession) return true;

    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      if (devices?.some((d) => d.kind === 'audioinput' && d.label)) {
        this.markMicrophoneGranted();
        return true;
      }
    } catch {
      // continue
    }

    try {
      if (navigator.permissions?.query) {
        const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (micPerm.state === 'granted') {
          this.markMicrophoneGranted();
          return true;
        }
      }
    } catch {
      // WebView bu adı desteklemez; yok say
    }

    try {
      if (localStorage.getItem(MIC_GRANTED_KEY) === '1') return true;
    } catch {
      // ignore
    }

    return false;
  }

  /**
   * Scans all Android / Web permissions dynamically
   */
  public async checkAllPermissions(): Promise<PermissionStatusReport> {
    let notifications = false;
    let camera = false;
    let microphone = false;
    let exactAlarms = true;

    // 1. Check Notifications
    if (Capacitor.isNativePlatform()) {
      try {
        const pushStatus = await PushNotifications.checkPermissions();
        const localStatus = await LocalNotifications.checkPermissions();
        notifications =
          pushStatus.receive === 'granted' || localStatus.display === 'granted';
      } catch {
        notifications = false;
      }

      // 2. Check Camera & Photos
      try {
        const camStatus = await CapCamera.checkPermissions();
        camera = camStatus.camera === 'granted' && camStatus.photos === 'granted';
      } catch {
        camera = false;
      }

      microphone = await this.checkMicrophonePermission();
    } else {
      // Web platform check
      if (typeof window !== 'undefined' && 'Notification' in window) {
        notifications = Notification.permission === 'granted';
      } else {
        notifications = true;
      }
      camera = true;
      microphone = true;
    }

    const allGranted = notifications && camera;

    return {
      notifications,
      camera,
      microphone,
      exactAlarms,
      allGranted,
    };
  }

  /**
   * Requests missing permissions with native prompts
   */
  public async requestPermission(type: 'notifications' | 'camera' | 'microphone'): Promise<boolean> {
    if (type === 'notifications') {
      if (Capacitor.isNativePlatform()) {
        try {
          const res = await PushNotifications.requestPermissions();
          const localRes = await LocalNotifications.requestPermissions();
          const granted = res.receive === 'granted' || localRes.display === 'granted';
          if (granted) {
            await notificationService.ensurePushRegistered();
          }
          return granted;
        } catch {
          return false;
        }
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
      return true;
    }

    if (type === 'camera') {
      if (Capacitor.isNativePlatform()) {
        try {
          const res = await CapCamera.requestPermissions({
            permissions: ['camera', 'photos'],
          });
          return res.camera === 'granted' && res.photos === 'granted';
        } catch {
          return false;
        }
      }
      return true;
    }

    if (type === 'microphone') {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          this.markMicrophoneGranted();
          return true;
        }
      } catch {
        this.markMicrophoneDenied();
        return false;
      }
    }

    return true;
  }

  /**
   * Requests all missing permissions in batch
   */
  public async requestAllMissing(): Promise<PermissionStatusReport> {
    await this.requestPermission('notifications');
    await this.requestPermission('camera');
    await this.requestPermission('microphone');
    return this.checkAllPermissions();
  }

  /**
   * Guides user directly to Android System Settings for this app
   */
  public async openNativeAppSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // In Capacitor, we can prompt or open settings
        // Fallback: Show instructions or open intent if available
        window.open('app-settings:', '_system');
      } catch (err) {
        console.warn('Could not open app settings directly:', err);
      }
    }
  }

  /**
   * Returns list of permissions for UI presentation
   */
  public async getDetailedList(): Promise<PermissionDetail[]> {
    const report = await this.checkAllPermissions();
    return [
      {
        id: 'notifications',
        title: 'Bildirimler & Mesaj Uyarıları',
        category: 'Kritik İzin',
        description: 'Uygulama kapalıyken bile sohbet mesajları, kalp, korna ve yemek bildirimlerini anında almanızı sağlar.',
        granted: report.notifications,
        critical: true,
      },
      {
        id: 'alarms',
        title: 'Tam Zamanlı Alarmlar',
        category: 'Kritik İzin',
        description: 'Önemli aile randevuları ve hatırlatıcıların vaktinde sesli çalmasını sağlar.',
        granted: report.exactAlarms,
        critical: true,
      },
      {
        id: 'microphone',
        title: 'Mikrofon & Ses Kaydı',
        category: 'Medya İzni',
        description: 'Sohbet üzerinden aile üyelerine tek dokunuşla sesli mesaj göndermenizi sağlar.',
        granted: report.microphone,
        critical: false,
      },
      {
        id: 'camera',
        title: 'Kamera & Fotoğraf Galerisi',
        category: 'Medya İzni',
        description: 'Aile albümüne ve sohbete anlık fotoğraf çekip yüklemenizi sağlar.',
        granted: report.camera,
        critical: false,
      },
    ];
  }
}

export const permissionService = new PermissionManagerService();
