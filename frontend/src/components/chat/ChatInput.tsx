import React, { useState, useRef } from 'react';
import { Send, Camera, Image as ImageIcon, Smile, Loader2, Plus, X } from 'lucide-react';
import { EmojiGifPicker } from './EmojiGifPicker';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendGif?: (gifUrl: string) => void;
  onCameraClick: (source: 'camera' | 'photos') => void;
  onTyping: () => void;
  onStopTyping: () => void;
  isUploading?: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(
  ({
    onSend,
    onSendGif,
    onCameraClick,
    onTyping,
    onStopTyping,
    isUploading = false,
    disabled = false,
  }) => {
    const [text, setText] = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const typingTimeoutRef = useRef<any>(null);
    const isSubmittingRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

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

    const submitMessage = () => {
      const trimmed = text.trim();
      if (!trimmed || disabled || isSubmittingRef.current) return;

      isSubmittingRef.current = true;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onStopTyping();

      setText('');
      onSend(trimmed);
      setShowEmojiPicker(false);

      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 100);
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      submitMessage();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMessage();
      }
    };

    const handleSelectEmoji = (emoji: string) => {
      setText((prev) => prev + emoji);
      inputRef.current?.focus();
    };

    const handleSelectGif = (gifUrl: string) => {
      setShowEmojiPicker(false);
      onSendGif?.(gifUrl);
    };

    return (
      <div className="bg-white/95 backdrop-blur-md border-t border-gray-200/80 p-2.5 sm:p-3 safe-area-bottom relative">
        {/* Emoji & GIF Picker Popup */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-auto mb-2 z-50">
            <EmojiGifPicker
              onSelectEmoji={handleSelectEmoji}
              onSelectGif={handleSelectGif}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        {/* Attachment Options Popup */}
        {showAttachMenu && (
          <div className="absolute bottom-full left-4 mb-2 bg-white rounded-3xl shadow-xl border border-gray-100 p-2 flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                onCameraClick('camera');
              }}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Fotoğraf Çek</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttachMenu(false);
                onCameraClick('photos');
              }}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Galeri</span>
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-full">
          {/* Plus (+) Media Toggle */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu((prev) => !prev);
              setShowEmojiPicker(false);
            }}
            disabled={disabled || isUploading}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition active:scale-95 flex-shrink-0 cursor-pointer ${
              showAttachMenu
                ? 'bg-family-600 text-white rotate-45'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title="Medya Ekle"
          >
            <Plus className="w-5 h-5 transition-transform" />
          </button>

          {/* Emoji / GIF Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              setShowAttachMenu(false);
            }}
            disabled={disabled}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition active:scale-95 flex-shrink-0 cursor-pointer ${
              showEmojiPicker
                ? 'bg-family-100 text-family-700'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title="Emoji ve GIF Seç"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Text Input */}
          <div className="flex-1 relative flex items-center min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder="Bir mesaj yazın..."
              className="w-full bg-gray-100 hover:bg-gray-200/70 focus:bg-white text-gray-900 placeholder:text-gray-400 text-sm sm:text-base px-4 py-2.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-family-600/30 transition-all border border-transparent focus:border-family-200"
            />
          </div>

          {/* Send / Uploading Button */}
          <button
            type="submit"
            disabled={(!text.trim() && !isUploading) || disabled}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-150 flex-shrink-0 shadow-sm ${
              text.trim() && !disabled
                ? 'bg-gradient-to-tr from-family-600 to-family-500 hover:from-family-700 hover:to-family-600 text-white shadow-family-600/20 active:scale-95 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            title="Gönder"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-family-600" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
          </button>
        </form>
      </div>
    );
  }
);
