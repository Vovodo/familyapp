import React, { useState, useRef } from 'react';
import { Send, Camera, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onCameraClick: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
  isUploading?: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(
  ({
    onSend,
    onCameraClick,
    onTyping,
    onStopTyping,
    isUploading = false,
    disabled = false,
  }) => {
    const [text, setText] = useState('');
    const typingTimeoutRef = useRef<any>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setText(val);

      onTyping();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onStopTyping();
      }, 2500);
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || disabled) return;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onStopTyping();

      setText('');
      onSend(trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    return (
      <div className="bg-white/95 backdrop-blur-md border-t border-gray-200/80 p-2.5 sm:p-3 safe-area-bottom">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 max-w-lg mx-auto"
        >
          {/* Camera / Photo Button */}
          <button
            type="button"
            onClick={onCameraClick}
            disabled={isUploading || disabled}
            className="w-11 h-11 rounded-2xl bg-gray-100/90 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition flex-shrink-0 disabled:opacity-50"
            title="Fotoğraf Çek / Yükle"
            aria-label="Fotoğraf Gönder"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-family-600" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Bir mesaj yazın..."
            className="flex-1 px-4 py-3 bg-gray-100/80 border border-transparent focus:border-family-300 rounded-2xl text-[14.5px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500/20 transition shadow-inner"
            autoComplete="off"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!text.trim() || disabled}
            className="w-11 h-11 rounded-2xl bg-family-600 hover:bg-family-700 active:scale-95 disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-family-600/25 transition flex-shrink-0"
            title="Gönder"
            aria-label="Mesajı Gönder"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    );
  }
);

ChatInput.displayName = 'ChatInput';
