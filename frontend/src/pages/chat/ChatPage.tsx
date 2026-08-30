import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Camera,
  Image as ImageIcon,
  Trash2,
  Smile,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 50 },
      });
      setMessages(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 4000); // 4-sec polling fallback
    return () => clearInterval(interval);
  }, [currentFamily]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const text = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const res = await api.post<Message>('/messages/', {
        content: text,
      });
      setMessages((prev) => [...prev, res.data]);
      scrollToBottom();
    } catch (err: any) {
      setError('Mesaj gönderilemedi: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Upload via media endpoint
      const mediaRes = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Send as chat message
      const chatRes = await api.post<Message>('/messages/', {
        content: '',
        media_url: mediaRes.data.public_url,
        media_thumbnail_url: mediaRes.data.thumbnail_url,
        media_type: mediaRes.data.mime_type,
      });

      setMessages((prev) => [...prev, chatRes.data]);
      scrollToBottom();
    } catch (err: any) {
      setError('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const takePhotoWithCapacitor = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
      });

      if (image.webPath) {
        const blob = await fetch(image.webPath).then((r) => r.blob());
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        await handlePhotoUpload(file);
      }
    } catch (err) {
      // User cancelled or web fallback
      fileInputRef.current?.click();
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Bu mesajı silmek istiyor musunuz?')) return;
    try {
      await api.delete(`/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err: any) {
      setError('Mesaj silinemedi: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] bg-[#efeae2]/30">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handlePhotoUpload(e.target.files[0]);
          }
        }}
      />

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-xs flex items-center justify-between border-b border-red-100">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">
            Kapat
          </button>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-8 h-8 text-family-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-2 shadow-sm">
              <Smile className="w-8 h-8 text-family-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Henüz mesaj yok</p>
            <p className="text-xs text-gray-400 mt-0.5">İlk mesajı siz gönderin ve sohbeti başlatın!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const senderLabel = isMe
              ? 'Siz'
              : msg.sender_nickname || msg.sender_name?.split(' ')[0] || 'Aile Üyesi';

            const timeStr = msg.created_at
              ? format(new Date(msg.created_at), 'HH:mm', { locale: tr })
              : '';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
              >
                {!isMe && (
                  <span className="text-[11px] font-bold text-gray-500 mb-0.5 ml-2">
                    {senderLabel}
                  </span>
                )}

                <div
                  className={`relative max-w-[82%] rounded-3xl p-3.5 shadow-sm text-sm ${
                    isMe
                      ? 'bg-family-600 text-white rounded-br-xs'
                      : 'bg-white text-gray-900 rounded-bl-xs border border-gray-100'
                  }`}
                >
                  {/* Photo content */}
                  {msg.media_url && (
                    <div className="mb-2 rounded-2xl overflow-hidden bg-black/10">
                      <img
                        src={msg.media_thumbnail_url || msg.media_url}
                        alt="Paylaşılan fotoğraf"
                        className="w-full max-h-60 object-cover rounded-2xl"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Text content */}
                  {msg.content && <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}

                  {/* Message Time and Actions */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMe ? 'text-family-100' : 'text-gray-400'
                    }`}
                  >
                    <span>{timeStr}</span>
                    {isMe && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 transition"
                        title="Mesajı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5 ml-1" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Uploading indicator */}
      {isUploading && (
        <div className="px-4 py-2 bg-white/90 border-t border-gray-100 text-xs text-family-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Fotoğraf yükleniyor ve sıkıştırılıyor...</span>
        </div>
      )}

      {/* Input Bar */}
      <div className="bg-white border-t border-gray-200 p-3 safe-area-bottom">
        <form onSubmit={handleSendText} className="flex items-center gap-2 max-w-md mx-auto">
          <button
            type="button"
            onClick={takePhotoWithCapacitor}
            disabled={isUploading}
            className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 flex items-center justify-center transition flex-shrink-0"
            title="Fotoğraf Gönder"
          >
            <Camera className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Bir mesaj yazın..."
            className="flex-1 px-4 py-3 bg-gray-100 border-none rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="w-11 h-11 rounded-2xl bg-family-600 hover:bg-family-700 active:scale-95 disabled:opacity-50 text-white flex items-center justify-center shadow-md shadow-family-600/30 transition flex-shrink-0"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
