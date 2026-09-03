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
}

export const WatchPartyReactions: React.FC<WatchPartyReactionsProps> = ({ onPick, counts }) => (
  <div>
    <div className="text-[10px] font-black uppercase tracking-wider text-violet-300/80 mb-1.5">Tepkiler</div>
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {REACTION_EMOJIS.map((emoji) => {
        const count = counts[emoji] || 0;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="flex flex-col items-center justify-center min-w-[2.75rem] h-[3.15rem] rounded-2xl bg-white/5 hover:bg-violet-500/25 border border-white/10 text-xl active:scale-95 cursor-pointer"
            aria-label={`${emoji} gönder`}
          >
            <span>{emoji}</span>
            <span className="text-[10px] font-bold text-violet-200/80 tabular-nums">{count}</span>
          </button>
        );
      })}
    </div>
  </div>
);
