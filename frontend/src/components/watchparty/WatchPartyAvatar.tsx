import React from 'react';

interface WatchPartyAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md';
  online?: boolean;
  host?: boolean;
  className?: string;
}

const SIZES = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-10 h-10 text-xs',
  md: 'w-12 h-12 text-sm',
};

export const WatchPartyAvatar: React.FC<WatchPartyAvatarProps> = ({
  name,
  avatarUrl,
  size = 'sm',
  online = false,
  host = false,
  className = '',
}) => {
  const dim = SIZES[size];
  const initial = (name.trim()[0] || '?').toUpperCase();

  return (
    <div className={`relative shrink-0 ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${dim} rounded-full object-cover ring-2 ring-[#1a1730] bg-[#2a2550]`}
        />
      ) : (
        <div
          className={`${dim} rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white font-black flex items-center justify-center ring-2 ring-[#1a1730]`}
        >
          {initial}
        </div>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0c0b18]" />
      )}
      {host && (
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-black leading-none px-1 py-px rounded bg-amber-400 text-amber-950 whitespace-nowrap">
          Host
        </span>
      )}
    </div>
  );
};
