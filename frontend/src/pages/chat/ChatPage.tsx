import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Smile, Loader2, X } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localChatStorage } from '../../services/localChatStorage';
import { mediaStorage } from '../../services/mediaStorage';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ChatInput } from '../../components/chat/ChatInput';
import { DateSeparator } from '../../components/chat/DateSeparator';
import { ScrollToBottomButton } from '../../components/chat/ScrollToBottomButton';
import { TypingIndicator, TypingUser } from '../../components/chat/TypingIndicator';

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const isNearBottomRef = useRef(true);

  // 1. Scroll Helpers
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setShowScrollBottom(false);
      setUnreadCount(0);
      isNearBottomRef.current = true;
    }
  }, []);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceToBottom < 80;
    isNearBottomRef.current = isAtBottom;

    if (isAtBottom) {
      setShowScrollBottom(false);
      setUnreadCount(0);
    } else {
      setShowScrollBottom(true);
    }

    // Trigger loading older messages when near top (< 60px)
    if (scrollTop < 60 && hasMore && !isLoadingOlder && !isLoading) {
      fetchOlderMessages();
    }
  };

  // 2. Fetch Initial Messages: Instant Local Cache (0ms) + Background Sync
  const loadMessagesInstantAndSync = async () => {
    if (!currentFamily) return;

    // A. INSTANT 0ms LOAD FROM LOCAL DEVICE STORAGE
    const cached = await localChatStorage.getMessages(currentFamily.id);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setIsLoading(false);
      setTimeout(() => scrollToBottom(false), 20);
    }

    // B. BACKGROUND SYNC WITH SERVER
    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 50 },
      });
      
      const merged = await localChatStorage.mergeMessages(currentFamily.id, res.data);
      setMessages(merged);
      setHasMore(res.data.length >= 50);
      
      if (!cached || cached.length === 0) {
        setTimeout(() => scrollToBottom(false), 30);
      }
    } catch (err: any) {
      if (!cached || cached.length === 0) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Cursor Pagination: Fetch Older Messages
  const fetchOlderMessages = async () => {
    if (!currentFamily || messages.length === 0 || isLoadingOlder || !hasMore) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsLoadingOlder(true);
    const oldestMsg = messages[0];
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 30, before: oldestMsg.id },
      });

      if (res.data.length === 0) {
        setHasMore(false);
      } else {
        const merged = await localChatStorage.mergeMessages(currentFamily.id, res.data);
        setMessages(merged);

        // Compensate scroll position immediately so user's view does not jump
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
          }
        });

        if (res.data.length < 30) {
          setHasMore(false);
        }
      }
    } catch (err: any) {
      console.error('Error fetching older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // 4. Setup Supabase Realtime Channel
  useEffect(() => {
    loadMessagesInstantAndSync();

    if (!currentFamily || !supabase) return;

    const channelName = `family-chat-${currentFamily.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    // Listen for typing broadcast events
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const data = payload.payload;
      if (!data || data.user_id === user?.id) return;

      if (data.is_typing) {
        setTypingUsers((prev) => {
          const filtered = prev.filter((u) => u.userId !== data.user_id);
          return [
            ...filtered,
            {
              userId: data.user_id,
              userName: data.user_name || 'Aile Üyesi',
              nickname: data.nickname,
              timestamp: Date.now(),
            },
          ];
        });
      } else {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.user_id));
      }
    });

    // Listen for database inserts, updates, deletes with strict family_id filter
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        handleIncomingMessage(payload.new as Message);
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => {
          const next: Message[] = prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
          localChatStorage.saveMessages(currentFamily.id, next);
          return next;
        });
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        const deletedId = payload.old.id;
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== deletedId);
          localChatStorage.saveMessages(currentFamily.id, next);
          return next;
        });
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentFamily?.id]);

  // Clean stale typing indicators every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - u.timestamp < 3500));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 5. Deterministic Realtime Message Handler
  const handleIncomingMessage = useCallback(
    (newMsg: Message) => {
      if (!currentFamily) return;

      setMessages((prev) => {
        // A. Match by permanent server ID
        const existsByServerId = prev.some((m) => m.id === newMsg.id);
        if (existsByServerId) {
          return prev.map((m) => (m.id === newMsg.id ? { ...newMsg, status: 'sent' as const } : m));
        }

        // B. Match by client_message_id (Replace optimistic placeholder)
        if (newMsg.client_message_id) {
          const matchedIndex = prev.findIndex(
            (m) => m.client_message_id === newMsg.client_message_id || m.id === newMsg.client_message_id
          );
          if (matchedIndex !== -1) {
            const updated = [...prev];
            updated[matchedIndex] = { ...newMsg, status: 'sent' as const };
            localChatStorage.saveMessages(currentFamily.id, updated);
            return updated;
          }
        }

        // C. Clean fallback: Check duplicate optimistic text/media
        if (newMsg.sender_id === user?.id) {
          const optimisticIndex = prev.findIndex(
            (m) =>
              (m.status === 'sending' || m.status === 'failed') &&
              m.sender_id === user?.id &&
              ((newMsg.content && m.content === newMsg.content) ||
                (newMsg.media_url && m.media_url === newMsg.media_url))
          );
          if (optimisticIndex !== -1) {
            const updated = [...prev];
            updated[optimisticIndex] = { ...newMsg, status: 'sent' as const };
            localChatStorage.saveMessages(currentFamily.id, updated);
            return updated;
          }
        }

        // D. Brand new message from another user
        const finalMsgs: Message[] = [...prev, { ...newMsg, status: 'sent' as const }];
        localChatStorage.saveMessages(currentFamily.id, finalMsgs);
        return finalMsgs;
      });

      // Handle unread counts and auto-scroll
      if (isNearBottomRef.current || newMsg.sender_id === user?.id) {
        setTimeout(() => scrollToBottom(true), 30);
      } else {
        setUnreadCount((c) => c + 1);
      }
    },
    [user?.id, currentFamily, scrollToBottom]
  );

  // 6. Typing Broadcast Handlers
  const handleStartTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: user.id,
        user_name: user.full_name,
        nickname: activeMember?.nickname,
        is_typing: true,
      },
    });
  }, [user, activeMember]);

  const handleStopTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: user.id,
        is_typing: false,
      },
    });
  }, [user]);

  // 7. Optimistic Text Message Sending
  const handleSendText = async (text: string) => {
    if (!user || !currentFamily || !text.trim()) return;

    const clientMsgId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: Message = {
      id: clientMsgId,
      client_message_id: clientMsgId,
      family_id: currentFamily.id,
      sender_id: user.id,
      content: text,
      is_edited: false,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_nickname: activeMember?.nickname,
      sender_avatar: user.avatar_url,
      status: 'sending' as const,
    };

    setMessages((prev) => {
      const next: Message[] = [...prev, optimisticMsg];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const res = await api.post<Message>('/messages/', {
        content: text,
        client_message_id: clientMsgId,
      });

      const serverMsg = res.data;
      setMessages((prev) => {
        const alreadyHasServerId = prev.some((m) => m.id === serverMsg.id);
        if (alreadyHasServerId) {
          const filtered = prev.filter((m) => m.id !== clientMsgId && m.client_message_id !== clientMsgId);
          localChatStorage.saveMessages(currentFamily.id, filtered);
          return filtered;
        }

        const next: Message[] = prev.map((m) =>
          m.id === clientMsgId || m.client_message_id === clientMsgId
            ? { ...serverMsg, status: 'sent' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } catch (err) {
      setMessages((prev) => {
        const next: Message[] = prev.map((m) => (m.id === clientMsgId ? { ...m, status: 'failed' as const } : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    }
  };

  const handleRetry = useCallback(
    async (failedMsg: Message) => {
      if (!currentFamily || !user) return;

      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...m, status: 'sending' as const } : m))
      );

      try {
        const payload: any = {
          client_message_id: failedMsg.client_message_id || failedMsg.id,
        };
        if (failedMsg.content) payload.content = failedMsg.content;
        if (failedMsg.media_url) payload.media_url = failedMsg.media_url;
        if (failedMsg.media_type) payload.media_type = failedMsg.media_type;

        const res = await api.post<Message>('/messages/', payload);
        const serverMsg = res.data;

        setMessages((prev) => {
          const next: Message[] = prev.map((m) => (m.id === failedMsg.id ? { ...serverMsg, status: 'sent' as const } : m));
          localChatStorage.saveMessages(currentFamily.id, next);
          return next;
        });
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === failedMsg.id ? { ...m, status: 'failed' as const } : m))
        );
      }
    },
    [currentFamily, user]
  );

  // 8. Photo Upload with Local Phone Storage Backup
  const handlePhotoUpload = async (file: File, base64Preview?: string) => {
    if (!user || !currentFamily) return;
    setIsUploading(true);
    setError(null);

    const clientMsgId = `cmsg-photo-${Date.now()}`;
    const localPreviewUrl = base64Preview ? `data:${file.type};base64,${base64Preview}` : URL.createObjectURL(file);

    // Save a high-res copy to user's phone in 'Ailem' folder
    if (base64Preview) {
      mediaStorage.savePhotoLocally(base64Preview, `ailem_${Date.now()}.jpg`);
    }

    const optimisticMsg: Message = {
      id: clientMsgId,
      client_message_id: clientMsgId,
      family_id: currentFamily.id,
      sender_id: user.id,
      media_url: localPreviewUrl,
      media_thumbnail_url: localPreviewUrl,
      media_type: file.type,
      is_edited: false,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_nickname: activeMember?.nickname,
      sender_avatar: user.avatar_url,
      status: 'sending' as const,
    };

    setMessages((prev) => {
      const next: Message[] = [...prev, optimisticMsg];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const mediaRes = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const chatRes = await api.post<Message>('/messages/', {
        media_url: mediaRes.data.public_url,
        media_thumbnail_url: mediaRes.data.thumbnail_url,
        media_type: mediaRes.data.mime_type,
        client_message_id: clientMsgId,
      });

      const serverMsg = chatRes.data;
      setMessages((prev) => {
        const alreadyHasServerId = prev.some((m) => m.id === serverMsg.id);
        if (alreadyHasServerId) {
          const filtered = prev.filter((m) => m.id !== clientMsgId && m.client_message_id !== clientMsgId);
          localChatStorage.saveMessages(currentFamily.id, filtered);
          return filtered;
        }
        const next: Message[] = prev.map((m) =>
          m.id === clientMsgId || m.client_message_id === clientMsgId
            ? { ...serverMsg, status: 'sent' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const next: Message[] = prev.map((m) => (m.id === clientMsgId ? { ...m, status: 'failed' as const } : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
      setError('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Helper: Convert Base64 string to Blob
  const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handleCameraClick = async (source: 'camera' | 'photos') => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });

      if (image.base64String) {
        const mimeType = image.format ? `image/${image.format}` : 'image/jpeg';
        const blob = base64ToBlob(image.base64String, mimeType);
        const file = new File([blob], `photo_${Date.now()}.${image.format || 'jpg'}`, { type: mimeType });
        await handlePhotoUpload(file, image.base64String);
      }
    } catch (err: any) {
      console.warn('Capacitor camera error, using fallback:', err);
      fileInputRef.current?.click();
    }
  };

  const handleDeleteMessage = useCallback(
    async (msgId: string) => {
      if (!confirm('Bu mesajı silmek istiyor musunuz?')) return;
      try {
        await api.delete(`/messages/${msgId}`);
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== msgId);
          if (currentFamily) {
            localChatStorage.saveMessages(currentFamily.id, next);
          }
          return next;
        });
      } catch (err: any) {
        alert('Mesaj silinemedi: ' + err.message);
      }
    },
    [currentFamily]
  );

  // 9. Memoized Grouping and Date Calculation
  const renderedMessageList = useMemo(() => {
    const items: React.ReactNode[] = [];

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const prev = messages[i - 1];
      const next = messages[i + 1];

      // Insert DateSeparator when date changes
      if (!prev || !isSameDay(new Date(current.created_at), new Date(prev.created_at))) {
        items.push(
          <DateSeparator key={`date-${current.created_at}-${current.id}`} date={current.created_at} />
        );
      }

      const isMe = current.sender_id === user?.id;

      // Grouping rules: Same sender, sent within 3 minutes
      const isFirstInGroup =
        !prev ||
        prev.sender_id !== current.sender_id ||
        !isSameDay(new Date(current.created_at), new Date(prev.created_at)) ||
        Math.abs(new Date(current.created_at).getTime() - new Date(prev.created_at).getTime()) >
          180000;

      const isLastInGroup =
        !next ||
        next.sender_id !== current.sender_id ||
        !isSameDay(new Date(next.created_at), new Date(current.created_at)) ||
        Math.abs(new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) >
          180000;

      items.push(
        <MessageBubble
          key={current.id}
          message={current}
          isMe={isMe}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          onDelete={handleDeleteMessage}
          onRetry={handleRetry}
          onImageClick={(url) => setSelectedImage(url)}
        />
      );
    }

    return items;
  }, [messages, user?.id, handleDeleteMessage, handleRetry]);

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] bg-[#efeae2]/35 relative">
      {/* Hidden file input for web fallback */}
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

      {/* Error banner */}
      {error && (
        <div className="p-2.5 bg-red-50 text-red-700 text-xs flex items-center justify-between border-b border-red-100 z-10">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold p-1">
            Kapat
          </button>
        </div>
      )}

      {/* Messages Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-0.5 overscroll-contain"
      >
        {/* Loading Older Indicator */}
        {isLoadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-5 h-5 text-family-600 animate-spin" />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-8 h-8 text-family-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 select-none">
            <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center mx-auto mb-2 shadow-xs border border-gray-100">
              <Smile className="w-8 h-8 text-family-400" />
            </div>
            <p className="text-sm font-bold text-gray-700">Henüz mesaj yok</p>
            <p className="text-xs text-gray-400 mt-1">
              İlk mesajı siz gönderin ve aile sohbetini başlatın!
            </p>
          </div>
        ) : (
          renderedMessageList
        )}

        {/* Dynamic Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      <ScrollToBottomButton
        visible={showScrollBottom}
        unreadCount={unreadCount}
        onClick={() => scrollToBottom(true)}
      />

      {/* Isolated High-Speed Chat Input */}
      <ChatInput
        onSend={handleSendText}
        onCameraClick={handleCameraClick}
        onTyping={handleStartTyping}
        onStopTyping={handleStopTyping}
        isUploading={isUploading}
      />

      {/* Full-Screen Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedImage}
            alt="Büyük fotoğraf"
            className="max-w-full max-h-[88vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
