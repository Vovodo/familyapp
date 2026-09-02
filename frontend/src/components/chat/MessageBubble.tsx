import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Clock, Check, CheckCheck, AlertCircle, RotateCw } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Message, PollData } from '../../types';
import { LinkPreviewCard } from './LinkPreviewCard';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { PollMessageCard } from './PollMessageCard';
import { FontSizeOption } from './ChatSettingsModal';
import { localMediaVault } from '../../services/localMediaVault';

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  fontSize?: FontSizeOption;
  onLongPress?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (message: Message) => void;
  onImageClick?: (url: string) => void;
  onAvatarClick?: (senderId: string, senderName: string, senderAvatar?: string | null) => void;
  onPollChange?: (messageId: string, poll: PollData) => void;
}

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
    onLongPress,
    onDelete,
    onRetry,
    onImageClick,
    onAvatarClick,
    onPollChange,
  }) => {
    const longPressTimerRef = useRef<any>(null);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

    const isDeleted = message.content === '🚫 Bu mesaj silindi' || (message as any).is_deleted;
    const isPoll = message.media_type === 'poll';
    const firstUrl = useMemo(
      () => (!isDeleted && !isPoll ? extractFirstUrl(message.content) : null),
      [message.content, isDeleted, isPoll]
    );

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
        : 'text-sm leading-normal';

    // Touch handlers for long-press delete
    const handleTouchStart = (e: React.TouchEvent) => {
      if (!isMe || isDeleted) return;
      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

      longPressTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(40);
        onLongPress?.(message.id);
      }, 500);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (!touchStartPosRef.current) return;
      const touch = e.touches[0];
      const dist = Math.hypot(
        touch.clientX - touchStartPosRef.current.x,
        touch.clientY - touchStartPosRef.current.y
      );
      if (dist > 10 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    // Bubble Corner Radii (WhatsApp Style Grouping)
    const getBubbleCorners = () => {
      if (isMe) {
        if (isFirstInGroup && isLastInGroup) return 'rounded-3xl rounded-br-sm';
        if (isFirstInGroup) return 'rounded-3xl rounded-br-md';
        if (isLastInGroup) return 'rounded-2xl rounded-r-md rounded-br-sm';
        return 'rounded-2xl rounded-r-md';
      } else {
        if (isFirstInGroup && isLastInGroup) return 'rounded-3xl rounded-bl-sm';
        if (isFirstInGroup) return 'rounded-3xl rounded-bl-md';
        if (isLastInGroup) return 'rounded-2xl rounded-l-md rounded-bl-sm';
        return 'rounded-2xl rounded-l-md';
      }
    };

    return (
      <div
        className={`flex items-center gap-2 ${
          isMe ? 'justify-end' : 'justify-start'
        } ${isLastInGroup ? 'mb-2' : 'mb-0.5'} group select-none transition-all duration-150`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => {
          if (isMe && !isDeleted) {
            e.preventDefault();
            onLongPress?.(message.id);
          }
        }}
      >
        {/* Sender Avatar for incoming messages */}
        {!isMe && (
          <div className="w-7 flex-shrink-0">
            {isLastInGroup ? (
              message.sender_avatar ? (
                <img
                  src={message.sender_avatar}
                  alt={senderDisplayName}
                  className="w-7 h-7 rounded-full object-cover shadow-2xs cursor-pointer active:scale-90 transition"
                  loading="lazy"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAvatarClick?.(message.sender_id, senderDisplayName, message.sender_avatar);
                  }}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full bg-family-100 text-family-700 flex items-center justify-center font-bold text-xs shadow-2xs cursor-pointer active:scale-90 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAvatarClick?.(message.sender_id, senderDisplayName, null);
                  }}
                >
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
          {/* Sender Header */}
          {!isMe && isFirstInGroup && !isDeleted && (
            <div className="text-[11px] font-black mb-1 text-family-600 leading-none">
              {senderDisplayName}
            </div>
          )}

          {/* Interactive Poll Card */}
          {isPoll && !isDeleted ? (
            <PollMessageCard
              message={message}
              isMe={isMe}
              onPollChange={(poll) => onPollChange?.(message.id, poll)}
            />
          ) : (
            <>
              {/* Audio Voice Note Attachment */}
              {message.media_url && !isDeleted && (message.media_type === 'audio' || message.media_type?.startsWith('audio/') || /\.(webm|m4a|mp3|ogg|wav|aac)(\?.*)?$/i.test(message.media_url)) ? (
                <div className="-mx-1 -mt-1">
                  <AudioMessagePlayer audioUrl={message.media_url} isMe={isMe} />
                </div>
              ) : message.media_url && !isDeleted ? (
                <VaultChatImage
                  remoteUrl={message.media_url}
                  localPath={message.local_media_path}
                  onImageClick={onImageClick}
                />
              ) : null}

              {/* Text Message Content */}
              {message.content && (
                <p className={`whitespace-pre-wrap break-words ${fontClass}`}>
                  {message.content}
                </p>
              )}

              {/* Rich OpenGraph Link Preview Card */}
              {firstUrl && <LinkPreviewCard url={firstUrl} isMe={isMe} />}
            </>
          )}

          {/* Footer Metadata: Time + Delivery Status Ticks */}
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] leading-none select-none ${
              isMe ? 'text-white/80' : 'text-gray-400'
            }`}
          >
            <span>{timeStr}</span>
            {isMe && (
              <span>
                {message.status === 'sending' ? (
                  <Clock className="w-3 h-3 text-white/70 animate-pulse inline" />
                ) : message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => onRetry?.(message)}
                    className="flex items-center gap-0.5 text-rose-300 font-bold hover:text-white"
                  >
                    <AlertCircle className="w-3 h-3 inline" />
                    <span>Tekrar Dene</span>
                  </button>
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-white/90 inline" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

const VaultChatImage: React.FC<{
  remoteUrl: string;
  localPath?: string;
  onImageClick?: (url: string) => void;
}> = ({ remoteUrl, localPath, onImageClick }) => {
  const [src, setSrc] = useState(remoteUrl);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = localPath || remoteUrl;
    localMediaVault.getMediaUrl(key, 'images').then((resolved) => {
      if (!cancelled && resolved) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [remoteUrl, localPath]);

  return (
    <div className="mb-2 -mx-1.5 -mt-1.5 rounded-2xl overflow-hidden bg-black/5 relative">
      {!imageLoaded && (
        <div className="w-full h-44 sm:h-52 bg-black/10 animate-pulse flex items-center justify-center text-xs text-gray-400">
          Yükleniyor...
        </div>
      )}
      <img
        src={src}
        alt="Medya"
        onLoad={() => setImageLoaded(true)}
        onClick={(e) => {
          e.stopPropagation();
          onImageClick?.(src || remoteUrl);
        }}
        className={`w-full max-h-80 object-cover cursor-pointer transition-transform duration-200 hover:scale-[1.01] ${
          imageLoaded ? 'block' : 'hidden'
        }`}
        loading="lazy"
      />
    </div>
  );
};
