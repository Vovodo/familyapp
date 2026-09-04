import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trash2, Loader2, MoreVertical, AlertCircle } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isSameDay } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Message, PollData } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localChatStorage, reconcileMessages } from '../../services/localChatStorage';
import { localMediaVault } from '../../services/localMediaVault';
import { syncService } from '../../services/syncService';
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
import { VoiceChannelBar } from '../../components/chat/VoiceChannelBar';
import { Logo } from '../../components/branding/Logo';

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const { currentTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusMessageId = searchParams.get('m');

  const [messages, setMessages] = useState<Message[]>(() =>
    currentFamily ? localChatStorage.peekMessages(currentFamily.id) : []
  );
  const [isLoading, setIsLoading] = useState(() =>
    !(currentFamily && localChatStorage.peekMessages(currentFamily.id).length > 0)
  );
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
  const userPinnedToBottomRef = useRef(true);
  const pendingPinTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTouchYRef = useRef<number | null>(null);

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

  // Clear Chat History — this device only (WhatsApp "sohbeti temizle")
  const handleClearChatHistory = async () => {
    if (!currentFamily) return;
    setMessages([]);
    await localChatStorage.saveMessages(currentFamily.id, []);
    setShowSettingsModal(false);
  };

  const clearPendingPins = useCallback(() => {
    pendingPinTimersRef.current.forEach((id) => clearTimeout(id));
    pendingPinTimersRef.current = [];
  }, []);

  const releaseStickToBottom = useCallback(() => {
    userPinnedToBottomRef.current = false;
    isNearBottomRef.current = false;
    clearPendingPins();
  }, [clearPendingPins]);

  const scrollToBottom = useCallback((smooth = true, force = false) => {
    if (!force && !userPinnedToBottomRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    if (smooth) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    setShowScrollBottom(false);
    setUnreadCount(0);
    isNearBottomRef.current = true;
    userPinnedToBottomRef.current = true;
  }, []);

  const queuePinToBottom = useCallback((delayMs: number) => {
    const id = setTimeout(() => scrollToBottom(false), delayMs);
    pendingPinTimersRef.current.push(id);
  }, [scrollToBottom]);

  // First paint: jump to latest once. Later timers must not yank the user if they already scrolled up.
  useEffect(() => {
    if (messages.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      userPinnedToBottomRef.current = true;

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      requestAnimationFrame(() => {
        if (!userPinnedToBottomRef.current) return;
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
      queuePinToBottom(80);
    }
  }, [messages.length, queuePinToBottom]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceToBottom < 80;
    isNearBottomRef.current = isAtBottom;
    userPinnedToBottomRef.current = isAtBottom;

    if (isAtBottom) {
      setShowScrollBottom(false);
      setUnreadCount(0);
    } else {
      setShowScrollBottom(true);
      clearPendingPins();
    }

    if (scrollTop < 60 && hasMore && !isLoadingOlder && !isLoading) {
      fetchOlderMessages();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      releaseStickToBottom();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const y = e.touches[0]?.clientY;
    if (lastTouchYRef.current == null || y == null) return;
    if (y - lastTouchYRef.current > 6) {
      releaseStickToBottom();
    }
  };

  const persistMessages = useCallback(
    (familyId: string, next: Message[]) => {
      localChatStorage.saveMessages(familyId, next);
      return next;
    },
    []
  );

  const persistPollUpdate = useCallback(
    (messageId: string, poll: PollData) => {
      if (!currentFamily) return;
      setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === messageId || msg.poll?.poll_id === poll.poll_id ? { ...msg, poll } : msg
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
    },
    [currentFamily]
  );

  const lastDurableId = (list: Message[]): string | undefined => {
    for (let i = list.length - 1; i >= 0; i--) {
      const id = list[i]?.id;
      if (id && !id.startsWith('temp-')) return id;
    }
    return undefined;
  };

  // Local-first open: IndexedDB instantly, then only messages newer than the last local row.
  const loadMessagesInstantAndSync = useCallback(
    async (silent = false) => {
      if (!currentFamily) return;

      let cached: Message[] = [];
      if (!silent) {
        cached = await localChatStorage.getMessages(currentFamily.id);
        if (cached.length > 0) {
          setMessages(cached);
          setIsLoading(false);
          setHasMore(true);
          queuePinToBottom(10);
        }
      } else {
        cached = await localChatStorage.getMessages(currentFamily.id);
      }

      try {
        const afterId = lastDurableId(cached);
        let incoming: Message[] = [];

        const recentRes = await api.get<Message[]>('/messages/', { params: { limit: 30 } });
        incoming = incoming.concat(recentRes.data);

        if (afterId) {
          let cursor = afterId;
          for (let page = 0; page < 20; page++) {
            const res = await api.get<Message[]>('/messages/', {
              params: { after: cursor, limit: 50 },
            });
            if (!res.data.length) break;
            incoming = incoming.concat(res.data);
            cursor = res.data[res.data.length - 1].id;
            if (res.data.length < 50) break;
          }
        } else {
          setHasMore(recentRes.data.length >= 30);
        }

        if (incoming.length > 0 || !silent) {
          setMessages((current) => persistMessages(currentFamily.id, reconcileMessages(current, incoming)));
        }

        if (!silent && userPinnedToBottomRef.current) {
          queuePinToBottom(20);
        }
      } catch (err: any) {
        if (!silent) {
          setError('Mesajlar yüklenirken bir problem oluştu.');
        }
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [currentFamily, persistMessages, queuePinToBottom]
  );

  useEffect(() => {
    initialScrollDoneRef.current = false;
    userPinnedToBottomRef.current = true;
    isNearBottomRef.current = true;
    clearPendingPins();
    if (currentFamily) {
      const peeked = localChatStorage.peekMessages(currentFamily.id);
      if (peeked.length > 0) {
        setMessages(peeked);
        setIsLoading(false);
      }
    }
    loadMessagesInstantAndSync(false);
    return () => clearPendingPins();
  }, [currentFamily?.id]);

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusMessageId || messages.length === 0) return;
    const exists = messages.some((m) => m.id === focusMessageId);
    if (!exists) return;
    const node = document.getElementById(`msg-${focusMessageId}`);
    if (!node) return;
    userPinnedToBottomRef.current = false;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightedMessageId(focusMessageId);
    const timer = window.setTimeout(() => {
      setHighlightedMessageId(null);
      setSearchParams({}, { replace: true });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [focusMessageId, messages, setSearchParams]);

  // Reconcile only when the app comes back to the foreground — never poll the DB on a timer.
  useEffect(() => {
    if (!currentFamily) return;

    const onResume = () => {
      if (document.visibilityState === 'visible') {
        loadMessagesInstantAndSync(true);
      }
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [currentFamily?.id, loadMessagesInstantAndSync]);

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
        if (incomingMsg.media_type === 'audio' && incomingMsg.media_url) {
          void localMediaVault.ensureCached(incomingMsg.media_url, 'audio');
        }
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
        setMessages((prev) => {
          const next = prev.map((msg) =>
            deletedIds.includes(msg.id)
              ? { ...msg, content: '🚫 Bu mesaj silindi', media_url: undefined, media_thumbnail_url: undefined }
              : msg
          );
          if (currentFamily) localChatStorage.saveMessages(currentFamily.id, next);
          return next;
        });
      })
      .on('broadcast', { event: 'chat_cleared' }, () => {
        setMessages([]);
        if (currentFamily) {
          localChatStorage.saveMessages(currentFamily.id, []);
        }
      })
      .on('broadcast', { event: 'poll_voted' }, ({ payload }) => {
        setMessages((prev) => {
          const next = prev.map((msg) => {
            if (
              msg.poll?.poll_id === payload.poll_id ||
              msg.id === payload.message_id ||
              msg.poll?.message_id === payload.message_id
            ) {
              const myVote =
                payload.voter_id === user?.id && payload.option_index !== undefined
                  ? payload.option_index
                  : msg.poll?.my_vote;

              return {
                ...msg,
                poll: {
                  ...msg.poll!,
                  tallies: payload.tallies,
                  voters: payload.voters,
                  total_votes: payload.total_votes,
                  my_vote: myVote,
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
    setTimeout(() => scrollToBottom(true, true), 20);
    playMessageSent();

    try {
      const res = await api.post<Message>('/messages/', {
        content: text,
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...res.data, status: 'sent' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

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
    setTimeout(() => scrollToBottom(true, true), 20);

    try {
      const res = await api.post<Message>('/messages/', {
        media_url: gifUrl,
        media_type: 'image/gif',
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...res.data, status: 'sent' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

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
      local_media_path: `family/images/${imageFilename}`,
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
    setTimeout(() => scrollToBottom(true, true), 20);

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
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId
            ? { ...res.data, local_media_path: `family/images/${imageFilename}`, status: 'sent' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

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
      local_media_path: `family/audio/${audioFilename}`,
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
    setTimeout(() => scrollToBottom(true, true), 20);
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
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId
            ? { ...res.data, local_media_path: `family/audio/${audioFilename}`, status: 'sent' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

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

  const handleRetryMessage = async (msg: Message) => {
    if (!currentFamily || !user || msg.status !== 'failed') return;

    const clientMessageId = msg.client_message_id;
    if (!clientMessageId) return;

    setMessages((prev) => {
      const next = prev.map((m) =>
        m.client_message_id === clientMessageId ? { ...m, status: 'sending' as const } : m
      );
      localChatStorage.saveMessages(currentFamily.id, next);
      return next;
    });

    try {
      let mediaUrl = msg.media_url?.startsWith('http') ? msg.media_url : undefined;

      if (!mediaUrl && msg.local_media_path) {
        const isAudio = msg.media_type === 'audio' || Boolean(msg.media_type?.startsWith('audio/'));
        const blob = await localMediaVault.readMediaBlob(msg.local_media_path, isAudio ? 'audio' : 'images');
        if (blob) {
          const formData = new FormData();
          const filename = msg.local_media_path.split('/').pop() || `retry_${Date.now()}`;
          formData.append('file', blob, filename);
          const endpoint = isAudio ? '/media/upload-audio' : '/media/upload';
          const uploadRes = await api.post(endpoint, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          mediaUrl = uploadRes.data.url;
        }
      }

      const res = await api.post<Message>('/messages/', {
        content: msg.content,
        media_url: mediaUrl,
        media_type: msg.media_type,
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId
            ? { ...res.data, local_media_path: msg.local_media_path, status: 'sent' as const }
            : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

      channelRef.current?.send({
        type: 'broadcast',
        event: 'new_message',
        payload: res.data,
      });
    } catch {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'failed' as const } : m
        );
        localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });
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

      setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === id
            ? { ...msg, content: '🚫 Bu mesaj silindi', media_url: undefined, media_thumbnail_url: undefined, is_edited: true }
            : msg
        );
        if (currentFamily) localChatStorage.saveMessages(currentFamily.id, next);
        return next;
      });

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
      setTimeout(() => scrollToBottom(true, true), 20);
      playMessageSent();

      syncService.queueMessageForBackup(
        currentFamily.id,
        res.data,
        Boolean(currentFamily.cloud_chat_backup_enabled)
      );

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
    if (currentTheme.isDark) return 'theme-bg';
    return WALLPAPERS.find((w) => w.id === wallpaper)?.bgClass || 'bg-warm-50';
  }, [wallpaper, currentTheme.isDark]);

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

      {/* Compact chat header + voice channel */}
      <div className="sticky top-0 z-40 w-full theme-header safe-area-top">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size="sm" className="!w-9 !h-9 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium theme-text-secondary truncate">
                {(() => {
                  const hour = new Date().getHours();
                  const greet =
                    hour >= 6 && hour < 12
                      ? 'Günaydın'
                      : hour >= 12 && hour < 18
                        ? 'İyi günler'
                        : hour >= 18 && hour < 22
                          ? 'İyi akşamlar'
                          : 'İyi geceler';
                  const name = activeMember?.nickname || user?.full_name?.split(' ')[0] || '';
                  return `${greet}${name ? ` ${name}` : ''} ❤️`;
                })()}
              </p>
              <h2 className="text-sm font-black theme-text-primary leading-tight truncate">
                {currentFamily?.name || 'Aile Sohbeti'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => navigate('/family')}
              className="w-9 h-9 rounded-full overflow-hidden border theme-border cursor-pointer"
              title="Aile ayarları"
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-violet-700 text-white flex items-center justify-center text-xs font-black">
                  {(activeMember?.nickname || user?.full_name || 'A')[0]}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center theme-text-secondary cursor-pointer"
              title="Sohbet Ayarları"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>
        <VoiceChannelBar />
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
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 relative [overflow-anchor:none]"
      >
        {/* Loading Spinner */}
        {isLoading && messages.length === 0 && (
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
            <Logo size="lg" className="mb-3" />
            <h3 className="font-black theme-text-primary text-base">Sohbete İlk Mesajı Atın</h3>
            <p className="text-xs theme-text-secondary mt-1 max-w-xs leading-relaxed">
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
                onRetry={() => handleRetryMessage(msg)}
                onAvatarClick={(senderId, senderName, senderAvatar) => {
                  setProfilePopup({ senderId, senderName, senderAvatar });
                }}
                onPollChange={persistPollUpdate}
                highlighted={highlightedMessageId === msg.id}
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
        onClick={() => scrollToBottom(true, true)}
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

