import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { familyJoinUrl } from '../../utils/inviteCode';
import { inviteQrDataUrl } from '../../utils/inviteQr';

interface FamilyInviteQrProps {
  inviteCode: string;
}

export const FamilyInviteQr: React.FC<FamilyInviteQrProps> = ({ inviteCode }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    inviteQrDataUrl(familyJoinUrl(inviteCode))
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div className="w-44 h-44 rounded-2xl bg-white border border-family-100 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt={`${inviteCode} QR kodu`} className="w-full h-full object-contain" />
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-family-500" />
        )}
      </div>
      <p className="text-[10px] text-center text-family-700 font-medium leading-relaxed px-2">
        Kamerayı bu kareye tutarak veya kodu yazarak katılabilirler
      </p>
    </div>
  );
};
