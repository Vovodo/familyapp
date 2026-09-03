import React, { useState } from 'react';
import { Volume2, Plus, Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import { useVoiceChannel } from '../../contexts/VoiceChannelContext';
import { VoiceParticipant } from '../../types';

const Avatar: React.FC<{ participant: VoiceParticipant; size?: 'sm' | 'md' }> = ({
  participant,
  size = 'md',
}) => {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-[11px]';
  const speaking = participant.speaking && !participant.muted;
  return (
    <div
      className={`relative rounded-full flex-shrink-0 ${speaking ? 'ring-2 ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]' : 'ring-1 ring-white/10'}`}
      title={participant.name}
    >
      {participant.avatar_url ? (
        <img
          src={participant.avatar_url}
          alt={participant.name}
          className={`${dim} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${dim} rounded-full bg-violet-600 text-white font-black flex items-center justify-center`}
        >
          {(participant.name || '?')[0].toUpperCase()}
        </div>
      )}
      {participant.muted && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-600 text-white flex items-center justify-center">
          <MicOff className="w-2 h-2" />
        </span>
      )}
    </div>
  );
};

export const VoiceChannelBar: React.FC = () => {
  const {
    participants,
    participantCount,
    speakingCount,
    isJoined,
    isMuted,
    isConnecting,
    join,
    leave,
    toggleMute,
  } = useVoiceChannel();
  const [error, setError] = useState<string | null>(null);

  const visible = participants.filter((p) => !p.is_self || isJoined);
  const extras = Math.max(0, visible.length - 4);

  const subtitle = isConnecting
    ? 'Bağlanıyor...'
    : isJoined
      ? speakingCount > 0
        ? `${speakingCount} kişi aktif konuşuyor`
        : participantCount <= 1
          ? 'Kanalda yalnızsınız'
          : `${participantCount} kişi kanalda`
      : participantCount > 0
        ? `${participantCount} kişi içeride — katılmak için dokunun`
        : 'Katılmak için dokunun';

  const handleJoin = async () => {
    setError(null);
    try {
      await join();
    } catch {
      setError('Mikrofona erişilemedi. Lütfen izinleri kontrol edin.');
      window.setTimeout(() => setError(null), 3500);
    }
  };

  return (
    <div className="px-3 pt-2">
      <div
        className="flex items-center gap-2.5 rounded-2xl px-3 py-2 border theme-border"
        style={{ backgroundColor: 'var(--theme-surface)' }}
      >
        <button
          type="button"
          onClick={() => {
            if (!isJoined && !isConnecting) void handleJoin();
          }}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
            style={{ background: '#7C3AED' }}
          >
            <Volume2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-black theme-text-primary leading-tight">Ses Kanalı</div>
            <div className="text-[10px] theme-text-secondary truncate">{subtitle}</div>
          </div>
        </button>

        {visible.length > 0 && (
          <div className="flex items-center -space-x-2 flex-shrink-0">
            {visible.slice(0, 4).map((p) => (
              <Avatar key={p.user_id} participant={p} />
            ))}
            {extras > 0 && (
              <div className="w-8 h-8 rounded-full bg-black/40 text-white text-[10px] font-black flex items-center justify-center ring-1 ring-white/10">
                +{extras}
              </div>
            )}
          </div>
        )}

        {isJoined ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
        ) : (
          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={isConnecting}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 cursor-pointer disabled:opacity-60"
            style={{ background: '#7C3AED' }}
            title="Ses kanalına katıl"
          >
            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-rose-400 font-bold px-1 pt-1">{error}</p>
      )}
    </div>
  );
};
