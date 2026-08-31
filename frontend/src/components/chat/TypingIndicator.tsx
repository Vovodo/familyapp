import React from 'react';

export interface TypingUser {
  userId: string;
  userName: string;
  nickname?: string;
  avatarUrl?: string;
  timestamp: number;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = React.memo(
  ({ typingUsers }) => {
    if (!typingUsers.length) return null;

    const first = typingUsers[0];
    const displayName =
      typingUsers.map((u) => u.nickname || u.userName.split(' ')[0]).join(', ');

    return (
      <div className="flex items-end gap-1.5 mb-2 animate-fade-in select-none">
        {/* Avatar */}
        <div className="w-7 h-7 flex-shrink-0">
          {first.avatarUrl ? (
            <img
              src={first.avatarUrl}
              alt={displayName}
              className="w-7 h-7 rounded-full object-cover shadow-2xs"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-family-100 text-family-700 flex items-center justify-center font-bold text-xs shadow-2xs">
              {displayName[0] || 'A'}
            </div>
          )}
        </div>

        {/* Typing bubble */}
        <div className="bg-white px-3.5 py-2 rounded-2xl rounded-tl-xs shadow-xs border border-gray-100 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">
            {displayName} yazıyor
          </span>
          <div className="flex items-center gap-1 pt-0.5">
            <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    );
  }
);

TypingIndicator.displayName = 'TypingIndicator';
