import React, { useState, useEffect } from 'react';
import { Bell, Camera, ShieldCheck, CheckCircle2, ArrowRight, Sparkles, X } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { Camera as CapCamera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { storage } from '../../services/api';

export const PermissionAssistantModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNotificationPerm, setHasNotificationPerm] = useState(false);
  const [hasCameraPerm, setHasCameraPerm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const checkAllPermissions = async () => {
    // Check if dismissed before
    const isDismissed = await storage.get('ailem_perms_dismissed');
    if (isDismissed === 'true') return;

    let notifOk = false;
    let cameraOk = false;

    if (Capacitor.isNativePlatform()) {
      try {
        const notifStatus = await notificationService.checkPermissions();
        notifOk = notifStatus.notifications;

        const camStatus = await CapCamera.checkPermissions();
        cameraOk = camStatus.camera === 'granted' && camStatus.photos === 'granted';
      } catch {
        notifOk = false;
        cameraOk = false;
      }
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      notifOk = Notification.permission === 'granted';
      cameraOk = true; // Web camera is requested on-demand
    } else {
      notifOk = true;
      cameraOk = true;
    }

    setHasNotificationPerm(notifOk);
    setHasCameraPerm(cameraOk);

    // If any permission is missing, show assistant modal
    if (!notifOk || !cameraOk) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    // Check permissions after small delay to let UI mount smoothly
    const timer = setTimeout(() => {
      checkAllPermissions();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleGrantAll = async () => {
    setIsProcessing(true);
    try {
      // 1. Request Notification Permission
      const notifGranted = await notificationService.requestAllPermissions();
      setHasNotificationPerm(notifGranted);

      // 2. Request Camera & Photos Permission
      if (Capacitor.isNativePlatform()) {
        const camRes = await CapCamera.requestPermissions({ permissions: ['camera', 'photos'] });
        const camGranted = camRes.camera === 'granted' && camRes.photos === 'granted';
        setHasCameraPerm(camGranted);
      } else {
        setHasCameraPerm(true);
      }

      await storage.set('ailem_perms_dismissed', 'true');

      // Auto close after 1.2s
      setTimeout(() => {
        setIsOpen(false);
      }, 1200);
    } catch (err) {
      console.warn('[PermissionAssistant] Error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = async () => {
    await storage.set('ailem_perms_dismissed', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200 relative">
        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Badge */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-family-500 to-rose-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-family-500/25 animate-bounce-short">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-family-600 uppercase tracking-wider mt-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kolay İzin Asistanı</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-lg font-black text-gray-900 leading-tight">
            Uygulamanın Kusursuz Çalışması İçin
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            Aile içi anlık kalp bildirimleri ve anı fotoğrafları için aşağıdaki izinleri açalım:
          </p>
        </div>

        {/* Permission Item Cards */}
        <div className="space-y-2.5">
          {/* 1. Notifications & Vibration */}
          <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-900 leading-tight">
                  Kalp & Anlık Bildirimler
                </div>
                <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                  Kalp gönderildiğinde 3-4s titreşim ve sesli uyarı
                </div>
              </div>
            </div>
            {hasNotificationPerm ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex-shrink-0">
                Gerekli
              </span>
            )}
          </div>

          {/* 2. Camera & Gallery */}
          <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <Camera className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-900 leading-tight">
                  Kamera & Galeri Erişimi
                </div>
                <div className="text-[10px] text-gray-500 leading-tight mt-0.5">
                  Sohbete ve aile albümüne fotoğraf ekleme
                </div>
              </div>
            </div>
            {hasCameraPerm ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full flex-shrink-0">
                Gerekli
              </span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-1 space-y-2">
          <button
            onClick={handleGrantAll}
            disabled={isProcessing}
            className="w-full py-3.5 bg-gradient-to-r from-family-600 to-rose-600 hover:from-family-700 hover:to-rose-700 active:scale-98 text-white font-bold rounded-2xl shadow-lg shadow-family-600/25 flex items-center justify-center gap-2 text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
          >
            <span>{isProcessing ? 'İzinler İsteniyor...' : 'Tüm İzinleri Etkinleştir'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleDismiss}
            className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition text-center cursor-pointer"
          >
            Daha Sonra Hatırlat
          </button>
        </div>
      </div>
    </div>
  );
};
