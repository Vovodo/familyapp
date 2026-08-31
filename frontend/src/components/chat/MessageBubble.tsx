import React, { useState, useRef, useMemo } from 'react';
import { Clock, CheckCheck, AlertCircle, Trash2, RotateCw, Check, Heart, Laugh, ThumbsUp, PartyPopper, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Message } from '../../types';
import { LinkPreviewCard } from './LinkPreviewCard';
import { FontSizeOption } from './ChatSettingsModal';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  fontSize?: FontSizeOption;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (message: Message) => void;
  onImageClick?: (url: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

const QUICK_REACTIONS = ['❤️', '😂', '👍', '🙏', '🥳', '👏'];

// Extracts first http/https link from content
const extractFirstUrl = (text?: string | null): string | null => {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+)/i);
  return match ? match[0] : null;
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isMe,
    isFirstInGroup,
    isLastInGroup,
    fontSize = 'md',
    isSelectionMode = false,
    isSelected = false,
    onToggleSelect,
    onLongPress,
    onDelete,
    onRetry,
    onImageClick,
    onReact,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const longPressTimerRef = useRef<any>(null);
    const isLongPressTriggeredRef = useRef(false);

    const isDeleted = message.content === '🚫 Bu mesaj silindi' || (message as any).is_deleted;
    const firstUrl = useMemo(() => (!isDeleted ? extractFirstUrl(message.content) : null), [message.content, isDeleted]);

    const timeStr = message.created_at
      ? format(new Date(message.created_at), 'HH:mm', { locale: tr })
      : '';

    const senderDisplayName =
      message.sender_nickname || message.sender_name?.split(' ')[0] || 'Aile Üyesi';

    // Font size styling
    const fontClass =
      fontSize === 'sm'
        ? 'text-xs'
        : fontSize === 'lg'
        ? 'text-base leading-relaxed'
        : fontSize === 'xl'
        ? 'text-lg leading-relaxed font-medium'
        : 'text-sm';

    // Touch handlers for Long-Press
    const handleTouchStart = () => {
      isLongPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        isLongPressTriggeredRef.current = true;
        if (navigator.vibrate) navigator.vibrate(40);
        onLongPress?.(message.id);
      }, 450);
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };

    const handleBubbleClick = (e: React.MouseEvent) => {
      if (isSelectionMode) {
        e.stopPropagation();
        onToggleSelect?.(message.id);
      }
    };

    // Bubble grouping corners
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
        className={`flex items-center gap-2 ${
          isMe ? 'justify-end' : 'justify-start'
        } ${isLastInGroup ? 'mb-2' : 'mb-0.5'} group select-none transition-all duration-150 ${
          isSelected ? 'bg-family-100/40 -mx-3 px-3 py-1 rounded-2xl' : ''
        }`}
        onClick={handleBubbleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress?.(message.id);
        }}
      >
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
              isSelected
                ? 'bg-family-600 border-family-600 text-white shadow-xs'
                : 'border-gray-300 bg-white'
            }`}
          >
            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
        )}

        {/* Sender Avatar for incoming messages */}
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

        {/* Message Bubble Body */}
        <div
          className={`relative max-w-[84%] sm:max-w-[72%] p-2.5 sm:p-3 shadow-xs transition-all ${getBubbleCorners()} ${
            isDeleted
              ? isMe
                ? 'bg-family-700/60 text-white/70 italic border border-white/10'
                : 'bg-gray-100 text-gray-400 italic border border-gray-200/80'
              : isMe
              ? 'bg-gradient-to-br from-family-600 to-family-700 text-white shadow-family-600/10'
              : 'bg-white text-gray-900 border border-gray-200/90 shadow-gray-200/30'
          }`}
        >
          {/* Sender Header (Only first in group for incoming) */}
          {!isMe && isFirstInGroup && !isDeleted && (
            <div className="text-[11px] font-black mb-1 text-family-600 leading-none">
              {senderDisplayName}
            </div>
          )}

          {/* Media Attachment (Photo / GIF) */}
          {message.media_url && !isDeleted && (
            <div className="mb-2 -mx-1.5 -mt-1.5 rounded-2xl overflow-hidden bg-black/5 relative">
              {!imageLoaded && (
                <div className="w-full h-44 sm:h-52 bg-black/10 animate-pulse flex items-center justify-center text-xs text-gray-400">
                  Fotoğraf yükleniyor...
                </div>
              )}
              <img
                src={message.media_url}
                alt="Medya"
                onLoad={() => setImageLoaded(true)}
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick?.(message.media_url!);
                }}
                className={`w-full max-h-80 object-cover cursor-pointer transition-transform duration-200 hover:scale-[1.01] ${
                  imageLoaded ? 'block' : 'hidden'
                }`}
                loading="lazy"
              />
            </div>
          )}

          {/* Text Message Content */}
          {message.content && (
            <p className={`whitespace-pre-wrap break-words ${fontClass}`}>
              {message.content}
            </p>
          )}

          {/* Rich OpenGraph Link Preview Card */}
          {firstUrl && <LinkPreviewCard url={firstUrl} isMe={isMe} />}

          {/* Footer Metadata: Time + Delivery Ticks */}
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${
              isMe ? 'text-white/70' : 'text-gray-400'
            }`}
          >
            {message.is_edited && !isDeleted && <span>(düzenlendi)</span>}
            <span>{timeStr}</span>

            {isMe && (
              <span>
                {message.status === 'sending' ? (
                  <Clock className="w-3 h-3 text-white/50 animate-pulse" />
                ) : message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry?.(message);
                    }}
                    className="flex items-center gap-0.5 text-rose-200 hover:text-white"
                  >
                    <AlertCircle className="w-3 h-3 text-rose-300" />
                    <RotateCw className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);
