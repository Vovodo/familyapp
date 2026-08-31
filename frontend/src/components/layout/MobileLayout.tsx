import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';
import { HeartCelebrationOverlay } from '../common/HeartCelebrationOverlay';
import { PermissionAssistantModal } from '../common/PermissionAssistantModal';
import { notificationService } from '../../services/notificationService';

interface MobileLayoutProps {
  showHeader?: boolean;
  showBottomNav?: boolean;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  showHeader = true,
  showBottomNav = true,
}) => {
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

  const isChat = location.pathname === '/chat';

  return (
    <div className="flex flex-col h-screen w-full bg-warm-50 text-gray-900 relative shadow-2xl overflow-hidden">
      <PermissionAssistantModal />
      <HeartCelebrationOverlay />
      <OfflineBanner />
      {showHeader && <Header />}
      
      <main className={`flex-1 flex flex-col ${isChat ? 'overflow-hidden pb-16' : 'overflow-y-auto pb-20'}`}>
        <Outlet />
      </main>

      {showBottomNav && <BottomNav />}
    </div>
  );
};


