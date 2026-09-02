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
import { Loader2, Heart } from 'lucide-react';

interface MobileLayoutProps {
  showHeader?: boolean;
  showBottomNav?: boolean;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  showHeader = true,
  showBottomNav = true,
}) => {
  const { currentFamily, isLoading } = useFamily();
  const navigate = useNavigate();
  const location = useLocation();

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
    return (
      <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-family-100 flex items-center justify-center text-family-600 shadow-md animate-bounce">
          <Heart className="w-8 h-8 fill-family-500 text-family-500" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-family-600" />
          <span>Aile Verileri Yükleniyor...</span>
        </div>
      </div>
    );
  }

  const isChat = location.pathname === '/chat';
  const hasFamily = !!currentFamily;

  return (
    <div className="flex flex-col h-screen w-full theme-bg theme-text-primary relative shadow-2xl overflow-hidden transition-colors duration-200">
      <InAppNotificationBanner />
      {hasFamily && <PermissionAssistantModal />}
      <HeartCelebrationOverlay />
      <OfflineBanner />
      {showHeader && <Header />}
      
      <main className={`flex-1 flex flex-col ${isChat ? 'overflow-hidden pb-16' : hasFamily ? 'overflow-y-auto pb-20' : 'overflow-y-auto pb-6'}`}>
        {!hasFamily && location.pathname !== '/' ? (
          <Navigate to="/" replace />
        ) : (
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        )}
      </main>

      {showBottomNav && hasFamily && <BottomNav />}
    </div>
  );
};


