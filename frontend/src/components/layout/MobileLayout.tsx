import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';

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

  return (
    <div className="flex flex-col min-h-screen bg-warm-50 text-gray-900 max-w-md mx-auto relative shadow-2xl overflow-x-hidden border-x border-gray-100">
      <OfflineBanner />
      {showHeader && <Header />}
      
      <main className="flex-1 flex flex-col pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {showBottomNav && <BottomNav />}
    </div>
  );
};
