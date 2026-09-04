import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { WatchChatMessage } from '../../types';
import { formatWatchTime } from '../../utils/youtubeUrl';
import { WatchPartyAvatar } from './WatchPartyAvatar';

interface WatchPartyChatProps {
  messages: WatchChatMessage[];
  currentUserId?: string;
  sending: boolean;
  canSeek?: boolean;
  avatarByUserId?: Map<string, string>;
  onSend: (body: string) => void;
  onSeekToTimestamp?: (positionMs: number) => void;
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const WatchPartyChat: React.FC<WatchPartyChatProps> = ({
  messages,
  currentUserId,
  sending,
  canSeek = false,
  avatarByUserId,
  onSend,
  onSeekToTimestamp,
}) => {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    onSend(body);
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {messages.length === 0 && (
          <p className="text-[11px] text-violet-200/60 text-center py-3 leading-relaxed">
            Video hakkında konuşun. Yorumlar odadakilere anında gider.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.user_id === currentUserId;
          const hasStamp = message.video_position_ms != null && message.video_position_ms >= 0;
          const avatarUrl = avatarByUserId?.get(message.user_id);
          return (
            <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine && <WatchPartyAvatar name={message.name} avatarUrl={avatarUrl} size="xs" />}
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-violet-600 text-white rounded-br-md' : 'bg-white/10 text-violet-50 border border-white/10 rounded-bl-md'
                }`}
              >
                <div className="text-[10px] font-black opacity-70 flex flex-wrap items-center gap-1">
                  <span>{mine ? 'Siz' : message.name}</span>
                  <span>· {formatMessageTime(message.created_at)}</span>
                  {hasStamp && (
                    <button
                      type="button"
                      disabled={!canSeek || !onSeekToTimestamp}
                      onClick={() => onSeekToTimestamp?.(message.video_position_ms!)}
                      className={`underline-offset-2 ${canSeek ? 'underline hover:opacity-100 cursor-pointer' : ''}`}
                      title={canSeek ? 'Bu ana git' : undefined}
                    >
                      {formatWatchTime(message.video_position_ms!)}
                    </button>
                  )}
                </div>
                <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap break-words mt-0.5">{message.body}</p>
              </div>
              {mine && <WatchPartyAvatar name={message.name} avatarUrl={avatarUrl} size="xs" />}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="pt-2 flex gap-2 shrink-0">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Sohbete yazın..."
          className="flex-1 px-3 py-2.5 rounded-2xl bg-white/10 border border-white/10 text-sm text-white placeholder:text-violet-300/40 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="px-3 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 cursor-pointer shadow-lg shadow-violet-600/30"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
