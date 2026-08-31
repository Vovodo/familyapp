import React, { useState } from 'react';
import { Clock, CheckCheck, AlertCircle, Trash2, RotateCw } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onDelete?: (id: string) => void;
  onRetry?: (message: Message) => void;
  onImageClick?: (url: string) => void;
}

// Consistent colors for family member names
const NICKNAME_COLORS = [
  'text-rose-600',
  'text-indigo-600',
  'text-emerald-600',
  'text-amber-600',
  'text-sky-600',
  'text-purple-600',
];

const getSenderColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NICKNAME_COLORS[Math.abs(hash) % NICKNAME_COLORS.length];
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isMe,
    isFirstInGroup,
    isLastInGroup,
    onDelete,
    onRetry,
    onImageClick,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const timeStr = message.created_at
      ? format(new Date(message.created_at), 'HH:mm', { locale: tr })
      : '';

    const senderDisplayName =
      message.sender_nickname || message.sender_name?.split(' ')[0] || 'Aile Üyesi';

    // Corner styling for grouping (WhatsApp-like)
    const getBubbleCorners = () => {
      if (isMe) {
        if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-tr-xs';
        if (isFirstInGroup) return 'rounded-2xl rounded-tr-xs rounded-br-md';
        if (isLastInGroup) return 'rounded-2xl rounded-tr-md rounded-br-xs';
        return 'rounded-2xl rounded-r-md';
      } else {
        if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-tl-xs';
        if (isFirstInGroup) return 'rounded-2xl rounded-tl-xs rounded-bl-md';
        if (isLastInGroup) return 'rounded-2xl rounded-tl-md rounded-bl-xs';
        return 'rounded-2xl rounded-l-md';
      }
    };

    return (
      <div
        className={`flex items-end gap-1.5 ${
          isMe ? 'justify-end' : 'justify-start'
        } ${isLastInGroup ? 'mb-2' : 'mb-0.5'} group`}
      >
        {/* Avatar on Left for Received Messages (only on last in group for bottom alignment or first) */}
        {!isMe && (
          <div className="w-7 flex-shrink-0">
            {isLastInGroup ? (
              message.sender_avatar ? (
                <img
                  src={message.sender_avatar}
                  alt={senderDisplayName}
                  className="w-7 h-7 rounded-full object-cover shadow-2xs"
                  loading="lazy"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-family-100 text-family-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                  {senderDisplayName[0] || 'A'}
                </div>
              )
            ) : (
              <div className="w-7" />
            )}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`relative max-w-[82%] sm:max-w-[70%] p-2.5 sm:p-3 text-sm shadow-xs transition-all ${getBubbleCorners()} ${
            isMe
              ? 'bg-family-600 text-white shadow-family-600/10'
              : 'bg-white text-gray-900 border border-gray-100 shadow-gray-200/40'
          } ${message.status === 'failed' ? 'ring-2 ring-red-400 bg-red-50 text-red-900' : ''}`}
        >
          {/* Sender Name in Received Message (First in Group) */}
          {!isMe && isFirstInGroup && (
            <div
              className={`text-[11px] font-bold mb-1 select-none ${getSenderColor(
                senderDisplayName
              )}`}
            >
              {senderDisplayName}
            </div>
          )}

          {/* Photo Content */}
          {message.media_url && (
            <div
              onClick={() => onImageClick?.(message.media_url!)}
              className="relative mb-1.5 rounded-xl overflow-hidden bg-black/10 cursor-pointer group/img"
            >
              <img
                src={message.media_thumbnail_url || message.media_url}
                alt="Fotoğraf"
                onLoad={() => setImageLoaded(true)}
                className={`w-full max-h-72 object-cover rounded-xl transition-all duration-300 ${
                  imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                loading="lazy"
              />
              {!imageLoaded && (
                <div className="w-full h-44 bg-gray-200 animate-pulse rounded-xl" />
              )}
            </div>
          )}

          {/* Text Content */}
          {message.content && (
            <p className="leading-relaxed whitespace-pre-wrap break-words text-[13.5px] sm:text-[14px]">
              {message.content}
            </p>
          )}

          {/* Time, Status and Actions */}
          <div
            className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] select-none ${
              isMe
                ? message.status === 'failed'
                  ? 'text-red-600'
                  : 'text-family-100'
                : 'text-gray-400'
            }`}
          >
            <span>{timeStr}</span>

            {/* Status Icons for Sent Messages */}
            {isMe && (
              <span className="inline-flex items-center ml-0.5">
                {message.status === 'sending' ? (
                  <Clock className="w-3 h-3 text-family-200 animate-pulse" />
                ) : message.status === 'failed' ? (
                  <AlertCircle className="w-3 h-3 text-red-500" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-white" />
                )}
              </span>
            )}

            {/* Failed Retry Button */}
            {message.status === 'failed' && onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="ml-1 px-1.5 py-0.5 bg-red-600 text-white rounded-md text-[9px] font-bold flex items-center gap-0.5 hover:bg-red-700 active:scale-95 transition"
              >
                <RotateCw className="w-2.5 h-2.5" />
                <span>Tekrar Dene</span>
              </button>
            )}

            {/* Delete button on hover / tap for own messages */}
            {isMe && message.status !== 'sending' && message.status !== 'failed' && onDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 transition ml-1"
                title="Mesajı Sil"
                aria-label="Mesajı Sil"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

MessageBubble.displayName = 'MessageBubble';
