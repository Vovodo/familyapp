import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { WatchChatMessage } from '../../types';
import { formatWatchTime } from '../../utils/youtubeUrl';

interface WatchPartyChatProps {
  messages: WatchChatMessage[];
  currentUserId?: string;
  sending: boolean;
  onSend: (body: string) => void;
}

export const WatchPartyChat: React.FC<WatchPartyChatProps> = ({ messages, currentUserId, sending, onSend }) => {
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
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && (
          <p className="text-[11px] theme-text-secondary text-center py-6">
            Video hakkında konuşmaya başlayın. Yorumlar odadakilere anında gider.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.user_id === currentUserId;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  mine ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-950 border border-violet-100'
                }`}
              >
                <div className="text-[10px] font-black opacity-80">
                  {mine ? 'Siz' : message.name}
                  {message.video_position_ms != null ? ` · ${formatWatchTime(message.video_position_ms)}` : ''}
                </div>
                <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="pt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Yorum yazın..."
          className="flex-1 px-3 py-2.5 rounded-2xl bg-white border border-violet-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="px-3 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 cursor-pointer"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
