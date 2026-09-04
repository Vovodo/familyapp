import React from 'react';

export const REACTION_EMOJIS = ['😂', '❤️', '🔥', '😮', '👏', '😭'] as const;

export interface WatchReactionBurst {
  id: string;
  emoji: string;
  name: string;
  x: number;
}

interface WatchPartyReactionsProps {
  onPick: (emoji: string) => void;
  counts: Record<string, number>;
  overlay?: boolean;
}

export const WatchPartyReactions: React.FC<WatchPartyReactionsProps> = ({ onPick, counts, overlay = false }) => (
  <div className={overlay ? '' : 'px-3 pt-2 shrink-0'}>
    {!overlay && (
      <div className="text-[10px] font-black uppercase tracking-wider text-violet-300/80 mb-1">Tepkiler</div>
    )}
    <div className={`flex gap-1.5 ${overlay ? 'justify-center' : 'overflow-x-auto'} pb-0.5`}>
      {REACTION_EMOJIS.map((emoji) => {
        const count = counts[emoji] || 0;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className={`flex flex-col items-center justify-center min-w-[2.5rem] h-[2.75rem] rounded-2xl border text-lg active:scale-95 cursor-pointer ${
              overlay
                ? 'bg-black/55 backdrop-blur-sm border-white/20 text-white'
                : 'bg-white/5 hover:bg-violet-500/25 border-white/10'
            }`}
            aria-label={`${emoji} gönder`}
          >
            <span>{emoji}</span>
            <span className={`text-[10px] font-bold tabular-nums ${overlay ? 'text-white/80' : 'text-violet-200/80'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
