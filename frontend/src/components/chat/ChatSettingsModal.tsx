import React from 'react';
import { X, Type, Bell, BellOff, Palette, Check, Sparkles } from 'lucide-react';

export type FontSizeOption = 'sm' | 'md' | 'lg' | 'xl';
export type WallpaperOption = 'classic' | 'warm' | 'mint' | 'dark';

interface ChatSettingsModalProps {
  fontSize: FontSizeOption;
  onChangeFontSize: (size: FontSizeOption) => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  wallpaper: WallpaperOption;
  onChangeWallpaper: (wp: WallpaperOption) => void;
  onClose: () => void;
}

export const FONT_SIZES: { id: FontSizeOption; label: string; desc: string; previewClass: string }[] = [
  { id: 'sm', label: 'Küçük', desc: 'Daha çok mesaj', previewClass: 'text-xs' },
  { id: 'md', label: 'Normal', desc: 'Varsayılan boyut', previewClass: 'text-sm' },
  { id: 'lg', label: 'Büyük', desc: 'Rahat okuma', previewClass: 'text-base' },
  { id: 'xl', label: 'Çok Büyük', desc: 'Ebeveyn & Kolay Görünüm', previewClass: 'text-lg font-medium' },
];

export const WALLPAPERS: { id: WallpaperOption; label: string; bgClass: string; borderClass: string }[] = [
  { id: 'classic', label: 'Klasik', bgClass: 'bg-warm-50', borderClass: 'border-amber-200' },
  { id: 'warm', label: 'Sıcak Aile', bgClass: 'bg-rose-50/70', borderClass: 'border-rose-200' },
  { id: 'mint', label: 'Huzurlu Nane', bgClass: 'bg-emerald-50/70', borderClass: 'border-emerald-200' },
  { id: 'dark', label: 'Gece Modu', bgClass: 'bg-gray-900', borderClass: 'border-gray-700' },
];

export const ChatSettingsModal: React.FC<ChatSettingsModalProps> = ({
  fontSize,
  onChangeFontSize,
  notificationsEnabled,
  onToggleNotifications,
  wallpaper,
  onChangeWallpaper,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-family-100 text-family-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-sm text-gray-900">Sohbet Ayarları</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 overflow-y-auto">
          {/* 1. Font Size Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <Type className="w-4 h-4 text-family-600" />
              <span>Yazı Boyutu (Font Size)</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FONT_SIZES.map((f) => {
                const isSelected = fontSize === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChangeFontSize(f.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-family-600 bg-family-50/60 ring-2 ring-family-600/20 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-gray-900 ${f.previewClass}`}>{f.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-family-600" />}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{f.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Notification Toggle */}
          <div className="space-y-2.5 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200/80">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    notificationsEnabled
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {notificationsEnabled ? (
                    <Bell className="w-4 h-4" />
                  ) : (
                    <BellOff className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Sohbet Bildirimleri</h4>
                  <p className="text-[10px] text-gray-500">
                    {notificationsEnabled ? 'Yeni mesajlarda anlık bildirim al' : 'Bildirimler sessize alındı'}
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={onToggleNotifications}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  notificationsEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Wallpaper Selection */}
          <div className="space-y-2.5 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <Palette className="w-4 h-4 text-family-600" />
              <span>Sohbet Teması & Arka Plan</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {WALLPAPERS.map((wp) => {
                const isSelected = wallpaper === wp.id;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => onChangeWallpaper(wp.id)}
                    className={`p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'border-family-600 ring-2 ring-family-600/20 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg ${wp.bgClass} ${wp.borderClass} border shadow-inner`} />
                    <span className="text-xs font-bold text-gray-800 flex-1">{wp.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-family-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/80">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-family-600 hover:bg-family-700 active:scale-95 text-white font-bold rounded-2xl text-xs transition cursor-pointer"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
