import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Camera,
  Trash2,
  Smile,
  Loader2,
  Check,
  CheckCheck,
} from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface TypingUser {
  userId: string;
  userName: string;
  nickname?: string;
  avatarUrl?: string;
  timestamp: number;
}

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. Initial Load of Messages
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

  // 2. Setup Realtime Supabase Channel & Listeners
  useEffect(() => {
    fetchMessages();

    if (!currentFamily || !supabase) return;

    const channelName = `family-chat-${currentFamily.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    // Listen for typing broadcast events
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const data = payload.payload as TypingUser;
      if (data.userId === user?.id) return;

      setTypingUsers((prev) => {
        const filtered = prev.filter((u) => u.userId !== data.userId);
        return [...filtered, { ...data, timestamp: Date.now() }];
      });
    });

    // Listen for stop typing broadcast events
    channel.on('broadcast', { event: 'stop_typing' }, (payload) => {
      const { userId } = payload.payload;
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    // Listen for new messages inserted in DB
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          // Check if message already exists (e.g. from optimistic update)
          const exists = prev.some((m) => m.id === newMsg.id || (m.id.startsWith('temp-') && m.content === newMsg.content && m.sender_id === newMsg.sender_id));
          if (exists) {
            return prev.map((m) => (m.id.startsWith('temp-') && m.content === newMsg.content ? newMsg : m));
          }

          // Lookup sender info from family members
          const senderMember = currentFamily.members?.find((m) => m.user_id === newMsg.sender_id);
          const enrichedMsg: Message = {
            ...newMsg,
            sender_name: senderMember?.user?.full_name || 'Aile Üyesi',
            sender_nickname: senderMember?.nickname,
            sender_avatar: senderMember?.user?.avatar_url,
          };
          return [...prev, enrichedMsg];
        });

        // Remove sender from typing list
        setTypingUsers((prev) => prev.filter((u) => u.userId !== newMsg.sender_id));
        scrollToBottom();
      }
    );

    // Listen for message deletions
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        const deletedId = (payload.old as any).id;
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      }
    );

    channel.subscribe();
    channelRef.current = channel;

    // Timer to clear stale typing indicators (> 3.5 seconds)
    const cleanupTypingInterval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - u.timestamp < 3500));
    }, 1500);

    return () => {
      clearInterval(cleanupTypingInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [currentFamily?.id, user?.id]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length]);

  // 3. Handle Typing Broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);

    if (channelRef.current && user) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: user.id,
          userName: user.full_name,
          nickname: activeMember?.nickname || user.full_name?.split(' ')[0],
          avatarUrl: user.avatar_url,
        },
      });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'stop_typing',
          payload: { userId: user.id },
        });
      }, 2500);
    }
  };

  // 4. Instant Optimistic Send Message
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !user || !currentFamily) return;

    // Clear input immediately for instant responsiveness
    setInputText('');

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId: user.id },
      });
    }

    // Create optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      family_id: currentFamily.id,
      sender_id: user.id,
      content: text,
      is_edited: false,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_nickname: activeMember?.nickname,
      sender_avatar: user.avatar_url,
    };

    // Instant local state update (0 ms lag)
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      const res = await api.post<Message>('/messages/', {
        content: text,
      });

      // Replace temp message with server confirmed message
      setMessages((prev) => prev.map((m) => (m.id === tempId ? res.data : m)));
    } catch (err: any) {
      setError('Mesaj gönderilemedi: ' + err.message);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  // 5. Photo Upload with Optimistic Loading
  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Upload to storage
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
    } catch {
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
            const isTemp = msg.id.startsWith('temp-');
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
                  className={`relative max-w-[82%] rounded-3xl p-3.5 shadow-sm text-sm transition-all ${
                    isMe
                      ? 'bg-family-600 text-white rounded-br-xs'
                      : 'bg-white text-gray-900 rounded-bl-xs border border-gray-100'
                  } ${isTemp ? 'opacity-70' : 'opacity-100'}`}
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

                  {/* Message Time and Status */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMe ? 'text-family-100' : 'text-gray-400'
                    }`}
                  >
                    <span>{timeStr}</span>
                    {isMe && (
                      <span className="ml-0.5">
                        {isTemp ? (
                          <Check className="w-3 h-3 opacity-60 inline" />
                        ) : (
                          <CheckCheck className="w-3 h-3 text-white inline" />
                        )}
                      </span>
                    )}
                    {isMe && !isTemp && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 transition ml-1"
                        title="Mesajı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Dynamic Animated Typing Indicator Bubble */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 animate-fade-in pt-1">
            <div className="w-7 h-7 rounded-full bg-family-100 text-family-700 flex items-center justify-center font-bold text-xs shadow-xs">
              {typingUsers[0].nickname?.[0] || typingUsers[0].userName?.[0] || 'A'}
            </div>
            <div className="bg-white px-3.5 py-2 rounded-2xl rounded-bl-xs shadow-xs border border-gray-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">
                {typingUsers.map((u) => u.nickname || u.userName.split(' ')[0]).join(', ')} yazıyor
              </span>
              <div className="flex items-center gap-1 pt-0.5">
                <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-family-500 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
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
            onChange={handleInputChange}
            placeholder="Bir mesaj yazın..."
            className="flex-1 px-4 py-3 bg-gray-100 border-none rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 transition"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-11 h-11 rounded-2xl bg-family-600 hover:bg-family-700 active:scale-95 disabled:opacity-50 text-white flex items-center justify-center shadow-md shadow-family-600/30 transition flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
