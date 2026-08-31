import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Smile, Loader2, X } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
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

  // 2. Fetch Initial Messages (Latest 40)
  const fetchInitialMessages = async () => {
    if (!currentFamily) return;
    setIsLoading(true);
    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 40 },
      });
      setMessages(res.data);
      setHasMore(res.data.length >= 40);
      setTimeout(() => scrollToBottom(false), 50);
    } catch (err: any) {
      setError(err.message);
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
        setMessages((prev) => {
          // Prepend older messages avoiding duplicates
          const existingIds = new Set(prev.map((m) => m.id));
          const newOlder = res.data.filter((m) => !existingIds.has(m.id));
          return [...newOlder, ...prev];
        });

        // Compensate scroll position immediately so user doesn't jump
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
    fetchInitialMessages();

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

    channel.on('broadcast', { event: 'stop_typing' }, (payload) => {
      const { userId } = payload.payload;
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    });

    // Realtime Postgres INSERT
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
          // Deterministic deduplication via id or client_message_id
          const exists = prev.some(
            (m) =>
              m.id === newMsg.id ||
              (newMsg.client_message_id && m.client_message_id === newMsg.client_message_id) ||
              (m.id.startsWith('temp-') &&
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content)
          );

          if (exists) {
            return prev.map((m) =>
              m.id === newMsg.id ||
              (newMsg.client_message_id && m.client_message_id === newMsg.client_message_id) ||
              (m.id.startsWith('temp-') &&
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content)
                ? { ...newMsg, status: 'sent' }
                : m
            );
          }

          // Lookup sender info from family members
          const senderMember = currentFamily.members?.find((m) => m.user_id === newMsg.sender_id);
          const enrichedMsg: Message = {
            ...newMsg,
            status: 'sent',
            sender_name: senderMember?.user?.full_name || 'Aile Üyesi',
            sender_nickname: senderMember?.nickname,
            sender_avatar: senderMember?.user?.avatar_url,
          };
          return [...prev, enrichedMsg];
        });

        // Remove sender from typing list
        setTypingUsers((prev) => prev.filter((u) => u.userId !== newMsg.sender_id));

        // Auto-scroll if user is near bottom or if sender is current user
        if (isNearBottomRef.current || newMsg.sender_id === user?.id) {
          setTimeout(() => scrollToBottom(true), 30);
        } else {
          setUnreadCount((c) => c + 1);
          setShowScrollBottom(true);
        }
      }
    );

    // Realtime Postgres DELETE
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

    // Periodically clean stale typing users (> 3.5s)
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - u.timestamp < 3500));
    }, 1500);

    return () => {
      clearInterval(cleanupInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [currentFamily?.id, user?.id]);

  // 5. Send Typing Broadcasts
  const handleStartTyping = useCallback(() => {
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
    }
  }, [user, activeMember]);

  const handleStopTyping = useCallback(() => {
    if (channelRef.current && user) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId: user.id },
      });
    }
  }, [user]);

  // 6. Instant Optimistic Message Send (<16ms)
  const handleSendText = useCallback(
    async (text: string) => {
      if (!user || !currentFamily) return;

      const clientMsgId = `cmsg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
        status: 'sending',
        retryPayload: { content: text },
      };

      // 0 ms local state update
      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => scrollToBottom(true), 20);

      try {
        const res = await api.post<Message>('/messages/', {
          content: text,
          client_message_id: clientMsgId,
        });

        // Confirm sent status and replace with server ID
        setMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMsgId || m.id === clientMsgId
              ? { ...res.data, status: 'sent' }
              : m
          )
        );
      } catch (err: any) {
        console.error('Send message failed:', err);
        // Mark as failed with retry action
        setMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMsgId || m.id === clientMsgId
              ? { ...m, status: 'failed' }
              : m
          )
        );
      }
    },
    [user, currentFamily, activeMember, scrollToBottom]
  );

  // 7. Retry Failed Message
  const handleRetry = useCallback(
    async (failedMsg: Message) => {
      if (!failedMsg.retryPayload?.content) return;

      // Reset to sending
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...m, status: 'sending' } : m))
      );

      try {
        const res = await api.post<Message>('/messages/', {
          content: failedMsg.retryPayload.content,
          client_message_id: failedMsg.client_message_id,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === failedMsg.id ? { ...res.data, status: 'sent' } : m))
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === failedMsg.id ? { ...m, status: 'failed' } : m))
        );
      }
    },
    []
  );

  // 8. Photo Upload with Optimistic UI
  const handlePhotoUpload = async (file: File) => {
    if (!user || !currentFamily) return;
    setIsUploading(true);
    setError(null);

    const clientMsgId = `cmsg-photo-${Date.now()}`;
    const localPreviewUrl = URL.createObjectURL(file);

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
      status: 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
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

      setMessages((prev) =>
        prev.map((m) =>
          m.id === clientMsgId || m.client_message_id === clientMsgId
            ? { ...chatRes.data, status: 'sent' }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === clientMsgId ? { ...m, status: 'failed' } : m))
      );
      setError('Fotoğraf yüklenemedi: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCameraClick = async () => {
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

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    if (!confirm('Bu mesajı silmek istiyor musunuz?')) return;
    try {
      await api.delete(`/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err: any) {
      alert('Mesaj silinemedi: ' + err.message);
    }
  }, []);

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
