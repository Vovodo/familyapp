import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { useVoiceChannel } from '../../contexts/VoiceChannelContext';

export const VoiceChannelDock: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isJoined, isMuted, participantCount, speakingCount, toggleMute, leave } = useVoiceChannel();

  if (!isJoined || location.pathname === '/chat') return null;

  const label =
    speakingCount > 0 ? `${speakingCount} kişi konuşuyor` : `${Math.max(participantCount, 1)} kişi kanalda`;

  return (
    <div className="fixed left-3 right-3 z-40" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}>
      <div
        className="max-w-lg mx-auto flex items-center gap-2 rounded-2xl px-3 py-2 shadow-xl border theme-border"
        style={{ backgroundColor: 'var(--theme-surface)' }}
      >
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
        >
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#7C3AED' }}>
            <Volume2 className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-black theme-text-primary leading-tight">Ses Kanalı</span>
            <span className="block text-[10px] theme-text-secondary truncate">{label}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void toggleMute()}
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white cursor-pointer ${
            isMuted ? 'bg-rose-600' : 'bg-violet-600'
          }`}
          title={isMuted ? 'Mikrofonu aç' : 'Sessize al'}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => void leave()}
          className="w-9 h-9 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer"
          title="Ayrıl"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
