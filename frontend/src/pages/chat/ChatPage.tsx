import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sliders, Trash2, X, Check, Loader2, Sparkles, MessageCircle, AlertCircle } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Message } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localChatStorage, reconcileMessages } from '../../services/localChatStorage';
import { localMediaVault } from '../../services/localMediaVault';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { ChatInput } from '../../components/chat/ChatInput';
import { DateSeparator } from '../../components/chat/DateSeparator';
import { ScrollToBottomButton } from '../../components/chat/ScrollToBottomButton';
import { TypingIndicator, TypingUser } from '../../components/chat/TypingIndicator';
import { PinchZoomViewer } from '../../components/common/PinchZoomViewer';
import { ChatSettingsModal, FontSizeOption, WallpaperOption, WALLPAPERS } from '../../components/chat/ChatSettingsModal';
import { playMessageSent, playMessageReceived } from '../../services/soundService';
import { MemberProfilePopup } from '../../components/chat/MemberProfilePopup';
import { CreatePollModal } from '../../components/chat/CreatePollModal';

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

  // Single Message Delete State (15-min limit)
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  // Poll Modal State
  const [showPollModal, setShowPollModal] = useState(false);

  // Multi-Selection State (Only user's own messages)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Member Profile Popup (for poke feature)
  const [profilePopup, setProfilePopup] = useState<{
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
  } | null>(null);

  // Settings State (Persisted in localStorage)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [fontSize, setFontSize] = useState<FontSizeOption>(() => {
    return (localStorage.getItem('ailem_chat_font_size') as FontSizeOption) || 'md';
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ailem_chat_notifs') !== 'false';
  });
  const [wallpaper, setWallpaper] = useState<WallpaperOption>(() => {
    return (localStorage.getItem('ailem_chat_wallpaper') as WallpaperOption) || 'classic';
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const isNearBottomRef = useRef(true);

  // Settings handlers
  const handleChangeFontSize = (size: FontSizeOption) => {
    setFontSize(size);
    localStorage.setItem('ailem_chat_font_size', size);
  };

  const handleToggleNotifications = () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    localStorage.setItem('ailem_chat_notifs', String(next));
  };

  const handleChangeWallpaper = (wp: WallpaperOption) => {
    setWallpaper(wp);
    localStorage.setItem('ailem_chat_wallpaper', wp);
  };

  // Clear Chat History (Clears text messages, preserves local photos and audio in vault)
  const handleClearChatHistory = async () => {
    if (!currentFamily) return;
    setMessages([]);
    localChatStorage.saveMessages(currentFamily.id, []);
    try {
      await api.post('/messages/cleanup-old?days=1');
    } catch {}
  };

  // Scroll Helpers
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      if (smooth) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      setShowScrollBottom(false);
      setUnreadCount(0);
      isNearBottomRef.current = true;
    }
  }, []);

  // Force Instant Scroll to Bottom when messages are loaded
  useEffect(() => {
    if (messages.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;

      // 1. Immediate instant jump
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }

      // 2. Next animation frame
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });

      // 3. Timers to catch image loads / font layout
      setTimeout(() => scrollToBottom(false), 50);
      setTimeout(() => scrollToBottom(false), 200);
      setTimeout(() => scrollToBottom(false), 500);
    }
  }, [messages.length, scrollToBottom]);

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

  // Load Messages Instant & Sync
  const loadMessagesInstantAndSync = async (silent = false) => {
    if (!currentFamily) return;

    if (!silent) {
      const cached = await localChatStorage.getMessages(currentFamily.id);
      if (cached && cached.length > 0) {
        setMessages(cached);
        setIsLoading(false);
        setTimeout(() => scrollToBottom(false), 10);
      }
    }

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

      if (!silent) {
        setTimeout(() => scrollToBottom(false), 20);
      }
    } catch (err: any) {
      if (!silent) {
        setError('Mesajlar yüklenirken bir problem oluştu.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    initialScrollDoneRef.current = false;
    loadMessagesInstantAndSync(false);
  }, [currentFamily?.id]);

  // Silent background reconciliation every 6 seconds for guaranteed message delivery
  useEffect(() => {
    if (!currentFamily) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMessagesInstantAndSync(true);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [currentFamily?.id]);

  // Fetch Older Messages (Infinite Scroll)
  const fetchOlderMessages = async () => {
    if (!currentFamily || isLoadingOlder || messages.length === 0) return;

    setIsLoadingOlder(true);
    const oldestId = messages[0].id;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const res = await api.get<Message[]>('/messages/', {
        params: { limit: 40, before: oldestId },
      });

      if (res.data.length < 40) {
        setHasMore(false);
      }

      if (res.data.length > 0) {
        setMessages((prev) => {
          const merged = reconcileMessages(prev, res.data);
          localChatStorage.saveMessages(currentFamily.id, merged);
          return merged;
        });

        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        }, 30);
      }
    } catch (err) {
      console.warn('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Realtime Supabase Subscription
  useEffect(() => {
    if (!currentFamily || !user) return;

    const channelName = `family-chat-${currentFamily.id}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const incomingMsg: Message = payload;
        setMessages((prev) => {
          const merged = reconcileMessages(prev, [incomingMsg]);
          localChatStorage.saveMessages(currentFamily.id, merged);
          return merged;
        });

        // Play receive sound for messages from others
        playMessageReceived();

        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 30);
        } else {
          setUnreadCount((c) => c + 1);
        }
      })
      .on('broadcast', { event: 'message_deleted' }, ({ payload }) => {
        const deletedIds: string[] = payload.message_ids || [payload.message_id];
        setMessages((prev) =>
          prev.map((msg) =>
            deletedIds.includes(msg.id)
              ? { ...msg, content: '🚫 Bu mesaj silindi', media_url: undefined, media_thumbnail_url: undefined }
              : msg
          )
        );
      })
      .on('broadcast', { event: 'poll_voted' }, ({ payload }) => {
        setMessages((prev) => {
          const next = prev.map((msg) => {
            if (
              msg.poll?.poll_id === payload.poll_id ||
              msg.id === payload.message_id ||
              msg.poll?.message_id === payload.message_id
            ) {
              return {
                ...msg,
                poll: {
                  ...msg.poll!,
                  tallies: payload.tallies,
                  voters: payload.voters,
                  total_votes: payload.total_votes,
                },
              };
            }
            return msg;
          });
          localChatStorage.saveMessages(currentFamily.id, next);
          return next;
        });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== user.id) {
          setTypingUsers((prev) => {
            const filtered = prev.filter((u) => u.userId !== payload.userId);
            return [
              ...filtered,
              {
                userId: payload.userId,
                userName: payload.name || payload.userName || 'Biri',
                nickname: payload.nickname,
                timestamp: Date.now(),
              },
            ];
          });
        }
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [currentFamily?.id, user?.id, scrollToBottom]);

  // Clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => now - (u.timestamp || 0) < 3500));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Send Text Message
  const handleSendMessage = async (text: string) => {
    if (!currentFamily || !user || !activeMember) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientMessageId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      family_id: currentFamily.id,
      sender_id: user.id,
      content: text,
      is_edited: false,
      status: 'sending',
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_avatar: user.avatar_url,
      sender_nickname: activeMember.nickname,
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);
    playMessageSent();

    try {
      const res = await api.post<Message>('/messages/', {
        content: text,
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) => (m.client_message_id === clientMessageId ? res.data : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch (err) {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    }
  };

  // Send GIF Message
  const handleSendGif = async (gifUrl: string) => {
    if (!currentFamily || !user || !activeMember) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientMessageId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      family_id: currentFamily.id,
      sender_id: user.id,
      media_url: gifUrl,
      media_type: 'image/gif',
      content: '',
      is_edited: false,
      status: 'sending',
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_avatar: user.avatar_url,
      sender_nickname: activeMember.nickname,
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const res = await api.post<Message>('/messages/', {
        media_url: gifUrl,
        media_type: 'image/gif',
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) => (m.client_message_id === clientMessageId ? res.data : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch (err) {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    }
  };

  // Send Image Message
  const handleSendMedia = async (blob: Blob, ext = 'jpg') => {
    if (!currentFamily || !user || !activeMember) return;

    setIsUploading(true);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientMessageId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const imageFilename = `photo_${Date.now()}.${ext}`;

    // 1. Save directly into local "family/images" disk vault (0ms load)
    const localVaultUrl = await localMediaVault.saveMedia(imageFilename, blob, 'images');

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      family_id: currentFamily.id,
      sender_id: user.id,
      media_url: localVaultUrl,
      media_type: 'image/jpeg',
      is_edited: false,
      status: 'sending',
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_avatar: user.avatar_url,
      sender_nickname: activeMember.nickname,
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const formData = new FormData();
      formData.append('file', blob, imageFilename);

      const uploadRes = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = uploadRes.data.url;

      const res = await api.post<Message>('/messages/', {
        media_url: uploadedUrl,
        media_type: 'image/jpeg',
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) => (m.client_message_id === clientMessageId ? res.data : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch (err) {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Send Audio Voice Message
  const handleSendAudio = async (blob: Blob, durationSecs: number) => {
    if (!currentFamily || !user || !activeMember) return;

    setIsUploading(true);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientMessageId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const ext = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : 'webm';
    const audioFilename = `voice_${Date.now()}.${ext}`;

    // 1. Save directly into local "family/audio" disk vault (0ms load)
    const localVaultUrl = await localMediaVault.saveMedia(audioFilename, blob, 'audio');

    const optimisticMessage: Message = {
      id: tempId,
      client_message_id: clientMessageId,
      family_id: currentFamily.id,
      sender_id: user.id,
      media_url: localVaultUrl,
      media_type: 'audio',
      is_edited: false,
      status: 'sending',
      created_at: new Date().toISOString(),
      sender_name: user.full_name,
      sender_avatar: user.avatar_url,
      sender_nickname: activeMember.nickname,
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });
    setTimeout(() => scrollToBottom(true), 20);
    playMessageSent();

    try {
      const formData = new FormData();
      formData.append('file', blob, audioFilename);

      const uploadRes = await api.post('/media/upload-audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = uploadRes.data.url;

      const res = await api.post<Message>('/messages/', {
        media_url: uploadedUrl,
        media_type: 'audio',
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) => (m.client_message_id === clientMessageId ? res.data : m));
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch (err) {
      console.warn('Send audio error:', err);
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Camera & Photo Selection Handlers
  const handleCameraClick = async (source: 'camera' | 'photos') => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });

      if (image.webPath) {
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        handleSendMedia(blob, image.format || 'jpg');
      }
    } catch (err: any) {
      if (err.message !== 'User cancelled photos app') {
        fileInputRef.current?.click();
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSendMedia(file, file.name.split('.').pop() || 'jpg');
    }
  };

  // Long-Press Single Message Delete (15-min limit)
  const handleLongPressMessage = (id: string) => {
    const targetMsg = messages.find((m) => m.id === id);
    if (!targetMsg || targetMsg.sender_id !== user?.id || targetMsg.content === '🚫 Bu mesaj silindi') return;

    const msgTime = new Date(targetMsg.created_at).getTime();
    const ageMs = Date.now() - msgTime;

    if (ageMs > 15 * 60 * 1000) {
      setDeleteNotice('Mesajlar yalnızca ilk 15 dakika içinde silinebilir.');
      setTimeout(() => setDeleteNotice(null), 3000);
      return;
    }

    setMessageToDelete(targetMsg);
  };

  const handleConfirmDeleteSingleMessage = async () => {
    if (!messageToDelete) return;
    const id = messageToDelete.id;
    setIsDeletingSingle(true);

    try {
      await api.delete(`/messages/${id}?for_everyone=true`);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id
            ? { ...msg, content: '🚫 Bu mesaj silindi', media_url: undefined, media_thumbnail_url: undefined, is_edited: true }
            : msg
        )
      );

      channelRef.current?.send({
        type: 'broadcast',
        event: 'message_deleted',
        payload: { message_ids: [id] },
      });
    } catch (err: any) {
      console.warn('Single delete error:', err);
    } finally {
      setIsDeletingSingle(false);
      setMessageToDelete(null);
    }
  };

  // Create Poll in Chat
  const handleCreatePoll = async (question: string, options: string[], durationHours: number) => {
    if (!currentFamily || !user) return;
    const clientMessageId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await api.post<Message>('/messages/poll', {
        question,
        options,
        duration_hours: durationHours,
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = [...prev, res.data];
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
      setTimeout(() => scrollToBottom(true), 20);
      playMessageSent();

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch (err: any) {
      console.warn('Poll creation error:', err);
      throw err;
    }
  };

  // Typing Emitter
  const handleTyping = () => {
    if (!user || !activeMember) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: user.id,
        userName: user.full_name,
        nickname: activeMember.nickname,
      },
    });
  };

  const handleStopTyping = () => {
    if (!user) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { userId: user.id },
    });
  };

  // Wallpaper Class
  const currentWallpaperClass = useMemo(() => {
    return WALLPAPERS.find((w) => w.id === wallpaper)?.bgClass || 'bg-warm-50';
  }, [wallpaper]);

  return (
    <div className={`flex flex-col h-full flex-1 relative overflow-hidden ${currentWallpaperClass}`}>
      {/* Hidden file input for web fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* STICKY TOP BAR (Glued to top at all times) */}
      <div className="sticky top-0 z-40 w-full shadow-xs">
        <div className="bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-family-500 to-rose-500 text-white flex items-center justify-center shadow-xs">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 leading-tight">
                {currentFamily?.name || 'Aile Sohbeti'}
              </h2>
              <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Canlı Aile Grubu</span>
              </p>
            </div>
          </div>

          {/* Settings Trigger */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition active:scale-95 cursor-pointer shadow-2xs"
            title="Sohbet Ayarları"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Notice Toast (15-min limit) */}
      {deleteNotice && (
        <div className="fixed top-14 inset-x-4 sm:inset-x-auto sm:right-6 z-50 p-3 bg-amber-600 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 animate-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{deleteNotice}</span>
        </div>
      )}

      {/* MESSAGES SCROLL CONTAINER */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1 relative"
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-family-600" />
          </div>
        )}

        {/* Older Messages Indicator */}
        {isLoadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-5 h-5 animate-spin text-family-500" />
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 text-center font-bold">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-rose-100/80 text-rose-600 flex items-center justify-center mb-3 shadow-inner">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="font-black text-gray-800 text-base">Sohbete İlk Mesajı Atın! ❤️</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs leading-relaxed">
              Ailenizle günaydınlaşın, fotoğraflar, anketler veya sıcacık bir GIF göndererek neşelendirin.
            </p>
          </div>
        )}

        {/* Message Stream */}
        {messages.map((msg, index) => {
          const isMe = msg.sender_id === user?.id;
          const prevMsg = messages[index - 1];
          const nextMsg = messages[index + 1];

          const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
          const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

          const showDateSeparator =
            !prevMsg || !isSameDay(new Date(msg.created_at), new Date(prevMsg.created_at));

          return (
            <React.Fragment key={msg.id || msg.client_message_id}>
              {showDateSeparator && <DateSeparator date={msg.created_at} />}
              <MessageBubble
                message={msg}
                isMe={isMe}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                fontSize={fontSize}
                onLongPress={handleLongPressMessage}
                onImageClick={(url) => setSelectedImage(url)}
                onRetry={() => handleSendMessage(msg.content || '')}
                onAvatarClick={(senderId, senderName, senderAvatar) => {
                  setProfilePopup({ senderId, senderName, senderAvatar });
                }}
              />
            </React.Fragment>
          );
        })}
        {/* Scroll anchor at the very bottom */}
        <div ref={messagesEndRef} className="h-px w-full" />
      </div>

      {/* Typing Indicator */}
      <TypingIndicator typingUsers={typingUsers} />

      {/* Scroll To Bottom Floating Button */}
      <ScrollToBottomButton
        visible={showScrollBottom}
        unreadCount={unreadCount}
        onClick={() => scrollToBottom(true)}
      />

      {/* CHAT INPUT BAR */}
      <ChatInput
        onSend={handleSendMessage}
        onSendGif={handleSendGif}
        onSendAudio={handleSendAudio}
        onCameraClick={handleCameraClick}
        onOpenPollModal={() => setShowPollModal(true)}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
        isUploading={isUploading}
        disabled={isLoading || !currentFamily}
      />

      {/* Full-Screen Pinch-to-Zoom Image Modal */}
      {selectedImage && (
        <PinchZoomViewer src={selectedImage} onClose={() => setSelectedImage(null)} />
      )}

      {/* Chat Customization Settings Modal */}
      {showSettingsModal && (
        <ChatSettingsModal
          fontSize={fontSize}
          onChangeFontSize={handleChangeFontSize}
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={handleToggleNotifications}
          wallpaper={wallpaper}
          onChangeWallpaper={handleChangeWallpaper}
          onClearChat={handleClearChatHistory}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Create Poll Modal */}
      {showPollModal && (
        <CreatePollModal
          onClose={() => setShowPollModal(false)}
          onSubmit={handleCreatePoll}
        />
      )}

      {/* Single Message Delete Confirmation Modal */}
      {messageToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">Mesajı Sil</h3>
                <p className="text-xs text-gray-500">Bu mesaj herkesten silinsin mi?</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200/80 text-xs text-gray-700 italic line-clamp-3">
              "{messageToDelete.content || (messageToDelete.media_type === 'audio' ? 'Sesli Mesaj' : 'Medya')}"
            </div>

            <p className="text-[11px] text-gray-500">
              Mesaj tüm aile üyelerinin ekranında silinecektir.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMessageToDelete(null)}
                disabled={isDeletingSingle}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingleMessage}
                disabled={isDeletingSingle}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs shadow-md shadow-rose-300 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingSingle ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Herkesten Sil</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Profile Popup (poke feature) */}
      {profilePopup && (
        <MemberProfilePopup
          senderId={profilePopup.senderId}
          senderName={profilePopup.senderName}
          senderAvatar={profilePopup.senderAvatar}
          onClose={() => setProfilePopup(null)}
          onPokeSent={(name) => {
            setProfilePopup(null);
          }}
        />
      )}
    </div>
  );
};

