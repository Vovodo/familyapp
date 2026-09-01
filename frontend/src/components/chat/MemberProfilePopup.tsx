import React, { useEffect, useRef, useState } from 'react';
import { X, HandMetal } from 'lucide-react';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { playPokeSound } from '../../services/soundService';

interface MemberProfilePopupProps {
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  onClose: () => void;
  /** Callback when poke was successfully sent */
  onPokeSent?: (name: string) => void;
}

export const MemberProfilePopup: React.FC<MemberProfilePopupProps> = ({
  senderId,
  senderName,
  senderAvatar,
  onClose,
  onPokeSent,
}) => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const [isSending, setIsSending] = useState(false);
  const [pokeSent, setPokeSent] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Auto-close after poke confirmation
  useEffect(() => {
    if (pokeSent) {
      const t = setTimeout(() => onClose(), 1800);
      return () => clearTimeout(t);
    }
  }, [pokeSent, onClose]);

  const handlePoke = async () => {
    if (isSending || pokeSent) return;
    setIsSending(true);
    try {
      const res = await api.post('/families/poke');
      setPokeSent(true);
      playPokeSound();
      if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 60]);

      // Broadcast via Supabase Realtime
      if (supabase && currentFamily && user) {
        const myName = activeMember?.nickname || user.full_name?.split(' ')[0] || 'Aile Üyesi';
        const channel = supabase.channel(`family-inapp-alerts-${currentFamily.id}`);
        channel.send({
          type: 'broadcast',
          event: 'poke_received',
          payload: {
            id: res.data?.poke_id || `poke-${Date.now()}`,
            sender_id: user.id,
            sender_name: myName,
            sender_avatar: user.avatar_url,
            target_user_id: senderId,
          },
        });
      }

      onPokeSent?.(senderName);
    } catch (err) {
      console.warn('Poke failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  const initials = senderName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end justify-center pb-8 px-4"
    >
      <div
        className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Profil</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 cursor-pointer transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3 py-2">
          {senderAvatar ? (
            <img
              src={senderAvatar}
              alt={senderName}
              className="w-20 h-20 rounded-full object-cover shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-family-400 to-family-600 text-white flex items-center justify-center font-black text-2xl shadow-md">
              {initials}
            </div>
          )}
          <div className="text-center">
            <p className="font-black text-gray-900 text-base">{senderName}</p>
            <p className="text-xs text-gray-400 mt-0.5">Aile üyesi</p>
          </div>
        </div>

        {/* Poke Button */}
        {pokeSent ? (
          <div className="flex flex-col items-center gap-1.5 py-2 animate-in fade-in duration-300">
            <span className="text-3xl">👉</span>
            <p className="text-sm font-bold text-orange-600">{senderName} dürtüldü!</p>
          </div>
        ) : (
          <button
            onClick={handlePoke}
            disabled={isSending}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-400 to-orange-600 text-white font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-60 shadow-orange-300/50 shadow-md"
          >
            {isSending ? (
              <span className="animate-pulse">Gönderiliyor...</span>
            ) : (
              <>
                <HandMetal className="w-5 h-5" />
                <span>Dürt 👉</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
