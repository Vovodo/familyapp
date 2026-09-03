import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { Network } from '@capacitor/network';
import { Logo } from '../branding/Logo';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    // Web event listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Capacitor Network listener
    let listener: any = null;
    const setupCapacitorNetwork = async () => {
      try {
        const status = await Network.getStatus();
        setIsOnline(status.connected);

        listener = await Network.addListener('networkStatusChange', (status) => {
          setIsOnline(status.connected);
        });
      } catch {
        // Fallback to browser events
      }
    };

    setupCapacitorNetwork();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (listener && listener.remove) {
        listener.remove();
      }
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-amber-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-md animate-pulse sticky top-0 z-50">
      <Logo size="xs" />
      <WifiOff className="w-4 h-4" />
      <span>İnternet bağlantısı yok. Bazı özellikler kullanılamayabilir.</span>
    </div>
  );
};
