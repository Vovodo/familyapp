import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Smile, Loader2, X } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localChatStorage, reconcileMessages } from '../../services/localChatStorage';
import { mediaStorage } from '../../services/mediaStorage';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ChatInput } from '../../components/chat/ChatInput';
import { DateSeparator } from '../../components/chat/DateSeparator';
import { ScrollToBottomButton } from '../../components/chat/ScrollToBottomButton';
import { TypingIndicator, TypingUser } from '../../components/chat/TypingIndicator';
import { PinchZoomViewer } from '../../components/common/PinchZoomViewer';

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

    if (scrollTop < 60 && hasMore && !isLoadingOlder && !isLoading) {
      fetchOlderMessages();
    }
  };

  // 2. Fetch Initial Messages: Instant Local Cache (0ms) + Safe Non-Destructive Background Sync
  const loadMessagesInstantAndSync = async () => {
    if (!currentFamily) return;

    // A. INSTANT 0ms LOAD FROM LOCAL STORAGE
    const cached = await localChatStorage.getMessages(currentFamily.id);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setIsLoading(false);
      setTimeout(() => scrollToBottom(false), 20);
    }

    // B. BACKGROUND SYNC
    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 50 },
      });

      setMessages((current) => {
        const merged = reconcileMessages(current, res.data);
        localChatStorage.saveMessages(currentFamily.id, merged);
        return merged;
      });

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
        setMessages((current) => {
          const merged = reconcileMessages(current, res.data);
          localChatStorage.saveMessages(currentFamily.id, merged);
          return merged;
        });

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

    // A. Realtime Fast Message Broadcast (Sub-50ms)
    channel.on('broadcast', { event: 'new_msg' }, (payload) => {
      const incMsg = payload.payload as Message;
      if (!incMsg || incMsg.sender_id === user?.id) return;
      handleIncomingMessage(incMsg);
    });

    // B. Realtime Typing Broadcast
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

    // C. Postgres Changes Fallback Listener
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

  // 5. Incoming Message Handler with Safe Reconciliation
  const handleIncomingMessage = useCallback(
    (newMsg: Message) => {
      if (!currentFamily) return;

      setMessages((current) => {
        const updated = reconcileMessages(current, [newMsg]);
        localChatStorage.saveMessages(currentFamily.id, updated);
        return updated;
      });

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

  // 7. Optimistic Text Message Sending (Permanent Instant Visibility)
  const handleSendText = async (text: string) => {
    if (!user || !currentFamily || !text.trim()) return;

    const clientMsgId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: Message = {
      id: clientMsgId,
      client_message_id: clientMsgId,
      family_id: currentFamily.id,
      sender_id: user.id,
      content: text.trim(),
      is_edited: false,
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_nickname: activeMember?.nickname,
      sender_avatar: user.avatar_url,
      status: 'sending' as const,
    };

    // 1. Instantly display in UI & local cache
    setMessages((prev) => {
      const next: Message[] = [...prev, optimisticMsg];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);

    // 2. Broadcast via Realtime WebSocket for sub-50ms peer delivery
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'new_msg',
        payload: optimisticMsg,
      });
    }

    // 3. Persist to Backend API
    try {
      const res = await api.post<Message>('/messages/', {
        content: text.trim(),
        client_message_id: clientMsgId,
      });

      const serverMsg = res.data;
      setMessages((current) => {
        const next = reconcileMessages(current, [serverMsg]);
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next: Message[] = prev.map((m) =>
          m.id === clientMsgId || m.client_message_id === clientMsgId
            ? { ...m, status: 'failed' as const }
            : m
        );
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

        setMessages((current) => {
          const next = reconcileMessages(current, [serverMsg]);
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
      setMessages((current) => {
        const next = reconcileMessages(current, [serverMsg]);
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const next: Message[] = prev.map((m) =>
          m.id === clientMsgId || m.client_message_id === clientMsgId
            ? { ...m, status: 'failed' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
      setError('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

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

      if (!prev || !isSameDay(new Date(current.created_at), new Date(prev.created_at))) {
        items.push(
          <DateSeparator key={`date-${current.created_at}-${current.id}`} date={current.created_at} />
        );
      }

      const isMe = current.sender_id === user?.id;

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

      {selectedImage && (
        <PinchZoomViewer src={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
    </div>
  );
};
