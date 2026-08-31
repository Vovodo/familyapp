import React, { useState, useRef, useEffect } from 'react';
import { Send, Camera, Image as ImageIcon, Smile, Loader2, Plus, Mic, Trash2, StopCircle } from 'lucide-react';
import { EmojiGifPicker } from './EmojiGifPicker';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendGif?: (gifUrl: string) => void;
  onSendAudio?: (audioBlob: Blob, durationSecs: number) => void;
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
    onSendAudio,
    onCameraClick,
    onTyping,
    onStopTyping,
    isUploading = false,
    disabled = false,
  }) => {
    const [text, setText] = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Audio Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordingError, setRecordingError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<any>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const typingTimeoutRef = useRef<any>(null);
    const isSubmittingRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Format recording time mm:ss
    const formatRecordTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // Clean up streams & timers on unmount
    useEffect(() => {
      return () => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        }
      };
    }, []);

    // Start Audio Recording
    const startRecording = async () => {
      if (disabled || isUploading || isRecording) return;
      setRecordingError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        // Choose best supported mime type
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            mimeType = 'audio/aac';
          } else {
            mimeType = '';
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(150); // Collect slices every 150ms
        setIsRecording(true);
        setRecordingTime(0);

        if (navigator.vibrate) navigator.vibrate(30);

        recordingTimerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.warn('Microphone permission or record error:', err);
        setRecordingError('Mikrofona erişilemedi. Lütfen izinleri kontrol edin.');
        setTimeout(() => setRecordingError(null), 4000);
      }
    };

    // Cancel / Discard Recording
    const cancelRecording = () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      audioChunksRef.current = [];
      setIsRecording(false);
      setRecordingTime(0);
    };

    // Stop and Send Voice Message
    const finishAndSendRecording = () => {
      if (!mediaRecorderRef.current || !isRecording) return;

      const durationSecs = recordingTime;

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size > 500 && durationSecs >= 1) {
          onSendAudio?.(audioBlob, durationSecs);
        }

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }

        audioChunksRef.current = [];
        setIsRecording(false);
        setRecordingTime(0);
      };

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

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
        {/* Error Toast */}
        {recordingError && (
          <div className="absolute bottom-full left-4 right-4 mb-2 p-2 bg-rose-600 text-white text-xs font-bold rounded-2xl shadow-lg text-center animate-in fade-in slide-in-from-bottom-2">
            {recordingError}
          </div>
        )}

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

        {/* Dynamic Input Bar: Recording Mode vs Typing Mode */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-2 max-w-full bg-rose-50/90 border border-rose-200/80 rounded-2xl px-3 py-1.5 animate-in fade-in duration-150">
            {/* Live Recording Indicator & Waves */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-rose-700 tracking-wider">
                  {formatRecordTime(recordingTime)}
                </span>
                <span className="text-[11px] font-medium text-rose-500 hidden sm:inline">
                  • Ses Kaydediliyor...
                </span>
              </div>
            </div>

            {/* Sound Wave Animation Bars */}
            <div className="flex items-center gap-1">
              <div className="w-1 h-3 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1 h-5 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1 h-4 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.45s]" />
              <div className="w-1 h-6 bg-rose-600 rounded-full animate-bounce" />
              <div className="w-1 h-3 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.2s]" />
            </div>

            {/* Cancel (Trash) & Send Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white text-rose-600 hover:bg-rose-100 transition active:scale-90 cursor-pointer shadow-2xs"
                title="İptal Et"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={finishAndSendRecording}
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-sm hover:opacity-95 transition active:scale-95 cursor-pointer"
                title="Sesli Mesajı Gönder"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>
        ) : (
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

            {/* Send OR Microphone Record Button (WhatsApp style) */}
            {text.trim().length > 0 ? (
              <button
                type="submit"
                disabled={disabled || isUploading}
                className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-family-600 to-family-500 hover:from-family-700 hover:to-family-600 text-white shadow-family-600/20 active:scale-95 cursor-pointer transition-all duration-150 flex-shrink-0"
                title="Gönder"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Send className="w-5 h-5 ml-0.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled || isUploading}
                className="w-11 h-11 rounded-2xl flex items-center justify-center bg-family-600 hover:bg-family-700 text-white shadow-sm active:scale-95 cursor-pointer transition-all duration-150 flex-shrink-0"
                title="Ses Kaydet (Bas ve Konuş)"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            )}
          </form>
        )}
      </div>
    );
  }
);
