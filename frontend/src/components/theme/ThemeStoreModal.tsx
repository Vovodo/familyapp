import React from 'react';
import { X, Check, Sparkles, Heart, Info } from 'lucide-react';
import { useTheme, THEMES, DEFAULT_THEME_ID } from '../../contexts/ThemeContext';
import { Logo } from '../branding/Logo';

interface ThemeStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeStoreModal: React.FC<ThemeStoreModalProps> = ({ isOpen, onClose }) => {
  const { currentTheme, setTheme } = useTheme();

  if (!isOpen) return null;

  const handleApplyTheme = (themeId: string) => {
    setTheme(themeId);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-pink-500 text-white flex items-center justify-center shadow-md overflow-hidden">
              <Logo size="sm" className="!w-8 !h-8" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Tema Mağazası</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Uygulamanın renk ve görsel tasarım dilini dilediğiniz gibi seçin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 12 Themes Grid Container */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {THEMES.map((theme) => {
              const isActive = currentTheme.id === theme.id;

              return (
                <div
                  key={theme.id}
                  className={`rounded-3xl p-3 border-2 transition-all duration-200 relative flex flex-col justify-between ${
                    isActive
                      ? 'border-family-600 bg-family-50/20 dark:bg-family-950/20 shadow-md ring-2 ring-family-400/30'
                      : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-850/50 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  {/* Realistic Mobile Preview Micro-Screen */}
                  <div
                    className="w-full rounded-2xl p-2.5 space-y-1.5 border relative overflow-hidden shadow-inner select-none mb-3"
                    style={{
                      backgroundColor: theme.colors.bg,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {/* Mini Header */}
                    <div
                      className="w-full rounded-lg p-1 px-1.5 flex items-center justify-between border"
                      style={{
                        backgroundColor: theme.colors.headerBg,
                        borderColor: theme.colors.headerBorder,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {theme.id === DEFAULT_THEME_ID ? (
                          <Logo size="xs" className="!w-3 !h-3 rounded-[3px]" />
                        ) : (
                          <div
                            className="w-2.5 h-2.5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: theme.colors.accent }}
                          >
                            <Heart className="w-1.5 h-1.5 fill-white text-white" />
                          </div>
                        )}
                        <div
                          className="text-[7px] font-black truncate max-w-[60px]"
                          style={{ color: theme.colors.textPrimary }}
                        >
                          Bizim Aile ❤️
                        </div>
                      </div>
                      <div
                        className="w-2.5 h-2.5 rounded-full border"
                        style={{
                          backgroundColor: theme.colors.surfaceSecondary,
                          borderColor: theme.colors.border,
                        }}
                      />
                    </div>

                    {/* Mini Aile Alanı Hero Card */}
                    <div
                      className="w-full rounded-xl p-1.5 text-white shadow-xs"
                      style={{ background: theme.colors.heroGradient }}
                    >
                      <div className="flex items-center gap-1 text-[6px] font-semibold opacity-90">
                        <Sparkles className="w-1.5 h-1.5" />
                        <span>AİLE ALANI</span>
                      </div>
                      <div className="text-[8px] font-black leading-tight mt-0.5">
                        İyi geceler, Ege ❤️
                      </div>
                    </div>

                    {/* Mini Weather Card */}
                    <div
                      className="w-full rounded-lg p-1 flex items-center justify-between border text-[6px] font-bold"
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        color: theme.colors.textPrimary,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>☀️</span>
                        <span>27°C İzmir</span>
                      </div>
                      <span style={{ color: theme.colors.textSecondary }}>Parçalı Bulutlu</span>
                    </div>

                    {/* 🚀 Mini 4 Fixed Quick Action Buttons (ALWAYS FIXED RED/ORANGE/BLUE/GREEN) */}
                    <div className="grid grid-cols-2 gap-1">
                      <div className="p-1 rounded-md quick-action-heart text-[6px] font-bold flex items-center gap-0.5">
                        <span>❤️</span>
                        <span className="truncate">Kalp Gönder</span>
                      </div>
                      <div className="p-1 rounded-md quick-action-tea text-[6px] font-bold flex items-center gap-0.5">
                        <span>🫖</span>
                        <span className="truncate">Çay Koydum</span>
                      </div>
                      <div className="p-1 rounded-md quick-action-coming-home text-[6px] font-bold flex items-center gap-0.5">
                        <span>🚗</span>
                        <span className="truncate">Eve Geliyorum</span>
                      </div>
                      <div className="p-1 rounded-md quick-action-meal text-[6px] font-bold flex items-center gap-0.5">
                        <span>🍴</span>
                        <span className="truncate">Yemek Hazır</span>
                      </div>
                    </div>

                    {/* Mini Content Cards */}
                    <div className="grid grid-cols-2 gap-1">
                      <div
                        className="p-1 rounded-md border text-[6px] font-bold"
                        style={{
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          color: theme.colors.textPrimary,
                        }}
                      >
                        <div className="truncate">Aile Sohbeti</div>
                      </div>
                      <div
                        className="p-1 rounded-md border text-[6px] font-bold"
                        style={{
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          color: theme.colors.textPrimary,
                        }}
                      >
                        <div className="truncate">Yapılacaklar</div>
                      </div>
                    </div>

                    {/* Mini Bottom Nav */}
                    <div
                      className="w-full rounded-lg p-1 flex items-center justify-around border"
                      style={{
                        backgroundColor: theme.colors.navBg,
                        borderColor: theme.colors.navBorder,
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: theme.colors.navActive }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: theme.colors.navInactive }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: theme.colors.navInactive }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: theme.colors.navInactive }}
                      />
                    </div>
                  </div>

                  {/* Theme Info & Action */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                          {theme.name}
                          {theme.id === DEFAULT_THEME_ID && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-white px-1.5 py-0.5 rounded-full bg-violet-600">
                              Varsayılan
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {theme.description}
                        </p>
                      </div>

                      {/* Color Swatch Palette Pills */}
                      <div className="flex items-center -space-x-1">
                        {theme.palette.map((color, cIdx) => (
                          <div
                            key={cIdx}
                            className="w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-900 shadow-xs"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Apply Button / Active Badge */}
                    {isActive ? (
                      <div className="w-full py-2 px-3 rounded-2xl bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Aktif Tema</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApplyTheme(theme.id)}
                        className="w-full py-2 px-3 rounded-2xl bg-gray-900 hover:bg-black dark:bg-gray-800 dark:hover:bg-gray-700 active:scale-[0.98] text-white font-bold text-xs transition cursor-pointer"
                      >
                        Uygula
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Info Callout */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Sabit Durum Butonları:</strong> Kalp Gönder, Çay Koydum, Eve Geliyorum ve Yemek Hazır butonlarının ikonik renkleri tüm temalarda sabit tutulur.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
