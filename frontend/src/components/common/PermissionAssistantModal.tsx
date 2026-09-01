import React, { useState, useEffect } from 'react';
import {
  Bell,
  Camera,
  Mic,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  X,
  Sparkles,
  Clock,
} from 'lucide-react';
import { permissionService, PermissionDetail } from '../../services/permissionService';
import { App } from '@capacitor/app';

interface PermissionAssistantModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export const PermissionAssistantModal: React.FC<PermissionAssistantModalProps> = ({
  forceOpen = false,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(forceOpen);
  const [details, setDetails] = useState<PermissionDetail[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadPermissions = async () => {
    const list = await permissionService.getDetailedList();
    setDetails(list);

    const hasMissingCritical = list.some((item) => item.critical && !item.granted);
    if (forceOpen || hasMissingCritical) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    loadPermissions();

    // Re-check permissions when returning to app from settings
    const listenerPromise = App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        loadPermissions();
      }
    });

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [forceOpen]);

  const handleGrantAll = async () => {
    setIsProcessing(true);
    try {
      await permissionService.requestAllMissing();
      const updated = await permissionService.getDetailedList();
      setDetails(updated);

      const allOk = updated.every((item) => item.granted);
      if (allOk) {
        setTimeout(() => {
          setIsOpen(false);
          onClose?.();
        }, 800);
      }
    } catch (err) {
      console.warn('Grant all error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSingleGrant = async (id: PermissionDetail['id']) => {
    if (id === 'notifications' || id === 'camera' || id === 'microphone') {
      await permissionService.requestPermission(id);
      const updated = await permissionService.getDetailedList();
      setDetails(updated);
    }
  };

  const handleOpenSettings = () => {
    permissionService.openNativeAppSettings();
  };

  const getIcon = (id: PermissionDetail['id']) => {
    switch (id) {
      case 'notifications':
        return <Bell className="w-5 h-5" />;
      case 'microphone':
        return <Mic className="w-5 h-5" />;
      case 'camera':
        return <Camera className="w-5 h-5" />;
      case 'alarms':
        return <Clock className="w-5 h-5" />;
    }
  };

  if (!isOpen) return null;

  const missingCount = details.filter((d) => !d.granted).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto relative animate-slide-up">
        {/* Close Button */}
        <button
          onClick={() => {
            setIsOpen(false);
            onClose?.();
          }}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-family-600 to-rose-600 text-white flex items-center justify-center mx-auto shadow-md shadow-family-600/25">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="inline-flex items-center gap-1 text-[10px] font-black text-family-600 uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            <span>İzin & Bildirim Kontrolü</span>
          </div>
          <h2 className="text-base font-black text-gray-900 leading-tight">
            {missingCount > 0
              ? `${missingCount} İzin Etkinleştirilmeli`
              : 'Tüm İzinler Tam ve Kusursuz!'}
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            Uygulama kapalıyken mesaj, korna, çay ve kalp seslerini eksiksiz alabilmeniz için izinleri kontrol edin.
          </p>
        </div>

        {/* Permission List Cards */}
        <div className="space-y-2.5">
          {details.map((item) => (
            <div
              key={item.id}
              className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                item.granted
                  ? 'bg-emerald-50/70 border-emerald-100 text-emerald-950'
                  : 'bg-rose-50/70 border-rose-100 text-rose-950 shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.granted ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {getIcon(item.id)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-900 truncate">
                      {item.title}
                    </span>
                    {item.critical && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-200 text-rose-800">
                        Zorunlu
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 leading-normal mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Status / Action Button */}
              <div className="flex-shrink-0 pt-0.5">
                {item.granted ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSingleGrant(item.id)}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    Aç
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Main Action Buttons */}
        <div className="pt-2 space-y-2">
          {missingCount > 0 ? (
            <button
              onClick={handleGrantAll}
              disabled={isProcessing}
              className="w-full py-3 bg-gradient-to-r from-family-600 to-rose-600 hover:from-family-700 hover:to-rose-700 text-white font-bold rounded-2xl shadow-md shadow-family-600/25 flex items-center justify-center gap-2 text-xs transition active:scale-98 cursor-pointer disabled:opacity-50"
            >
              <span>{isProcessing ? 'İzinler İsteniyor...' : 'Tüm Eksik İzinleri Aç'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                setIsOpen(false);
                onClose?.();
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 text-xs transition active:scale-98 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Harika, Tamamlandı</span>
            </button>
          )}

          {/* Direct Android Settings Link */}
          <button
            onClick={handleOpenSettings}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl flex items-center justify-center gap-1.5 text-xs transition active:scale-98 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            <span>Telefon Uygulama Ayarlarını Aç</span>
          </button>
        </div>
      </div>
    </div>
  );
};
