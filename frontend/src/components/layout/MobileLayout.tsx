import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';
import { HeartCelebrationOverlay } from '../common/HeartCelebrationOverlay';
import { InAppNotificationBanner } from '../common/InAppNotificationBanner';
import { PermissionAssistantModal } from '../common/PermissionAssistantModal';
import { RouteErrorBoundary } from '../common/RouteErrorBoundary';
import { notificationService } from '../../services/notificationService';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, RefreshCw } from 'lucide-react';
import { Logo } from '../branding/Logo';
import { BrandLoading } from '../branding/BrandLoading';
import { VoiceChannelDock } from '../chat/VoiceChannelDock';

interface MobileLayoutProps {
  showHeader?: boolean;
  showBottomNav?: boolean;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  showHeader = true,
  showBottomNav = true,
}) => {
  const { currentFamily, isLoading, familiesLoaded, loadError, retryLoadFamilies } = useFamily();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRetrying, setIsRetrying] = React.useState(false);

  // Initialize Standalone Notification Service & Channels
  useEffect(() => {
    notificationService.init();
  }, []);

  // Android Back Button Handler
  useEffect(() => {
    let isSubscribed = true;
    let removeListener: (() => void) | undefined;

    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (location.pathname === '/' || location.pathname === '/login') {
        CapApp.exitApp();
      } else {
        navigate(-1);
      }
    }).then((listener) => {
      if (isSubscribed) {
        removeListener = () => listener.remove();
      } else {
        listener.remove();
      }
    }).catch(() => {
      // Ignored on web
    });

    return () => {
      isSubscribed = false;
      removeListener?.();
    };
  }, [location.pathname, navigate]);

  if (isLoading) {
    return <BrandLoading message="Aile Verileri Yükleniyor..." />;
  }

  // The membership list never arrived, so we cannot tell an empty account apart
  // from a failed request. Offering create/join here would let an existing
  // member start a second family, so ask for a retry instead.
  if (!currentFamily && !familiesLoaded) {
    const handleRetry = async () => {
      setIsRetrying(true);
      try {
        await retryLoadFamilies();
      } finally {
        setIsRetrying(false);
      }
    };

    return (
      <div className="min-h-screen theme-bg flex flex-col items-center justify-center px-6 space-y-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center shadow-md overflow-hidden">
          <Logo size="md" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-black text-gray-900">Aile bilgileriniz alınamadı</h1>
          <p className="text-xs font-medium text-gray-500 max-w-xs leading-relaxed">
            {loadError || 'Bağlantı kurulamadı. Ailenize ait veriler korunuyor, lütfen tekrar deneyin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full max-w-xs py-3.5 bg-family-600 hover:bg-family-700 active:scale-98 text-white font-bold rounded-2xl shadow-lg shadow-family-600/25 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 cursor-pointer"
        >
          {isRetrying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Tekrar Dene</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => logout()}
          className="text-xs text-gray-400 hover:text-gray-600 font-semibold underline transition cursor-pointer"
        >
          Çıkış yap ve yeniden giriş yap
        </button>
      </div>
    );
  }

  const isChat = location.pathname === '/chat';
  const isWatchRoom = /^\/watch-party\/[^/]+/.test(location.pathname);
  const isDrawGame = location.pathname === '/games/draw';
  const hasFamily = !!currentFamily;
  const lockMain = isChat || isWatchRoom || isDrawGame;

  return (
    <div className="flex flex-col h-screen w-full theme-bg theme-text-primary relative shadow-2xl overflow-hidden transition-colors duration-200">
      <InAppNotificationBanner />
      {hasFamily && <PermissionAssistantModal />}
      <HeartCelebrationOverlay />
      <OfflineBanner />
      {showHeader && !isWatchRoom && !isDrawGame && !isChat && <Header />}
      
      <main className={`flex-1 flex flex-col ${lockMain ? (isDrawGame ? 'overflow-hidden pb-0' : 'overflow-hidden pb-16') : hasFamily ? 'overflow-y-auto pb-20' : 'overflow-y-auto pb-6'}`}>
        {!hasFamily && location.pathname !== '/' ? (
          <Navigate to="/" replace />
        ) : (
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        )}
      </main>

      {showBottomNav && hasFamily && !isDrawGame && <BottomNav />}
      {hasFamily && <VoiceChannelDock />}
    </div>
  );
};


