import React from 'react';
import { Outlet } from 'react-router-dom';
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
