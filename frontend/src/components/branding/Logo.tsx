import React from 'react';
import { BRAND_LOGO_SRC, BRAND_NAME } from '../../assets/branding';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<LogoSize, string> = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
};

interface LogoProps {
  size?: LogoSize;
  className?: string;
  pulse?: boolean;
  alt?: string;
}

/**
 * Tek marka logosu. Renk filtresi / stretch yok; oran object-contain ile korunur.
 */
export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  className = '',
  pulse = false,
  alt = BRAND_NAME,
}) => (
  <img
    src={BRAND_LOGO_SRC}
    alt={alt}
    draggable={false}
    className={`${SIZE_CLASS[size]} object-contain select-none ${pulse ? 'brand-logo-pulse' : ''} ${className}`}
  />
);

export default Logo;
