import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';

interface DownloadApkProps {
  variant?: 'banner' | 'button' | 'compact';
  className?: string;
}

export const DownloadApkButton: React.FC<DownloadApkProps> = ({
  variant = 'banner',
  className = '',
}) => {
  // If running inside Capacitor Native Android APK, NEVER show download prompts
  if (Capacitor.isNativePlatform()) {
    return null;
  }

  // Direct backend streaming download endpoint with application/vnd.android.package-archive
  const apkDownloadUrl = 'https://familyapi.rfqcollector.com/api/v1/downloads/apk';

  if (variant === 'button') {
    return (
      <a
        href={apkDownloadUrl}
        target="_self"
        rel="noopener noreferrer"
        download="ailem.apk"
        className={`inline-flex items-center justify-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-95 text-white font-bold rounded-2xl shadow-lg shadow-emerald-700/20 transition duration-150 ${className}`}
      >
        <Smartphone className="w-5 h-5 text-emerald-200" />
        <span>Android Uygulamasını İndir (APK)</span>
        <Download className="w-4 h-4 text-emerald-200 ml-auto" />
      </a>
    );
  }

  if (variant === 'compact') {
    return (
      <a
        href={apkDownloadUrl}
        target="_self"
        rel="noopener noreferrer"
        download="ailem.apk"
        className={`flex items-center justify-between p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-2xl text-emerald-900 transition ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-emerald-950">Android APK İndir</p>
            <p className="text-[10px] text-emerald-700">Doğrudan telefona kurun • 13.6 MB</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
          <Download className="w-4 h-4" />
        </div>
      </a>
    );
  }

  // Default: Prominent Banner
  return (
    <div
      className={`bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-5 text-white shadow-xl shadow-emerald-900/15 relative overflow-hidden border border-emerald-500/30 ${className}`}
    >
      <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-10 pointer-events-none">
        <Smartphone className="w-36 h-36 text-white" />
      </div>

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-emerald-100">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>Mobil Deneyim</span>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-200 border border-emerald-500/30">
            Android APK
          </span>
        </div>

        <div>
          <h3 className="text-lg font-black tracking-tight leading-snug">
            Ailem'i Telefonunuza Kurun! 📱
          </h3>
          <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed">
            Tarayıcı yerine hızlı bildirimler, kamera ve WhatsApp benzeri kesintisiz sohbet için Android uygulamasını indirin.
          </p>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-emerald-200">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            Hızlı Açılış
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            Canlı Bildirim
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            Tam Ekran
          </span>
        </div>

        <a
          href={apkDownloadUrl}
          target="_self"
          rel="noopener noreferrer"
          download="ailem.apk"
          className="flex items-center justify-center gap-2.5 w-full py-3 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-900 font-extrabold rounded-2xl shadow-md transition duration-150 text-sm cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-700" />
          <span>Android Uygulamasını İndir (APK)</span>
        </a>
      </div>
    </div>
  );
};
