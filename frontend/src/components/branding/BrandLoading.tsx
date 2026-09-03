import React from 'react';
import { Loader2 } from 'lucide-react';
import { Logo, LogoSize } from './Logo';

interface BrandLoadingProps {
  message?: string;
  size?: LogoSize;
  fullScreen?: boolean;
}

export const BrandLoading: React.FC<BrandLoadingProps> = ({
  message = 'Yükleniyor...',
  size = 'lg',
  fullScreen = true,
}) => (
  <div
    className={`flex flex-col items-center justify-center gap-3 ${
      fullScreen ? 'min-h-screen theme-bg' : 'min-h-[70vh]'
    }`}
  >
    <Logo size={size} pulse />
    <div className="flex items-center gap-2 text-xs font-bold theme-text-secondary">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--theme-accent)' }} />
      <span>{message}</span>
    </div>
  </div>
);

export default BrandLoading;
