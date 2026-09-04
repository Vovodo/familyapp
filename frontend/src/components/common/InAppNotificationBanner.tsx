import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, X, Heart, Clock, Coffee, Car, Utensils } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import {
  playMessageReceived,
  playHeartSound,
  playPokeSound,
  playTeaSound,
  playCarHornSound,
  playMealSound,
} from '../../services/soundService';

interface InAppAlert {
  id: string;
  type: 'chat' | 'reminder' | 'heart' | 'poke' | 'tea' | 'coming_home' | 'meal';
  title: string;
  body: string;
  avatarUrl?: string | null;
  link: string;
}

export const InAppNotificationBanner: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const navigate = useNavigate();
  const location = useLocation();
  const [alert, setAlert] = useState<InAppAlert | null>(null);

  useEffect(() => {
    if (!currentFamily || !supabase || !user) return;

    const channel = supabase.channel(`family-inapp-alerts-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    // 1. Listen to real-time chat messages
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        const msg = payload.new as any;
        // Don't notify on own messages or if currently inside /chat
        if (msg.sender_id === user.id || location.pathname === '/chat') return;

        const senderMember = currentFamily.members?.find((m) => m.user_id === msg.sender_id);
        const senderName = senderMember?.nickname || senderMember?.user?.full_name || 'Aile Üyesi';
        const avatarUrl = senderMember?.user?.avatar_url;

        let bodyText = msg.content;
        if (!bodyText) {
          if (msg.media_type === 'audio') bodyText = '🎤 Sesli mesaj';
          else if (msg.media_type === 'image') bodyText = '📷 Fotoğraf';
          else if (msg.media_type === 'poll') bodyText = '📊 Yeni bir anket başlattı';
          else bodyText = 'Yeni bir mesaj';
        }

        playMessageReceived();

        setAlert({
          id: msg.id || String(Date.now()),
          type: 'chat',
          title: senderName,
          body: bodyText,
          avatarUrl,
          link: msg.id ? `/chat?m=${encodeURIComponent(msg.id)}` : '/chat',
        });
      }
    );

    // 2. Listen to real-time heart events
    channel.on('broadcast', { event: 'heart_received' }, (payload) => {
      const data = payload.payload;
      if (!data || data.sender_id === user.id) return;

      playHeartSound();

      setAlert({
        id: `heart-${Date.now()}`,
        type: 'heart',
        title: '❤️ Aileden Bir Kalp',
        body: `${data.sender_name || 'Aileniz'} size sevgi dolu bir kalp gönderdi!`,
        avatarUrl: data.sender_avatar,
        link: '/',
      });
    });

    // 3. Listen to real-time poke events
    channel.on('broadcast', { event: 'poke_received' }, (payload) => {
      const data = payload.payload;
      if (!data || data.sender_id === user.id) return;
      if (data.target_user_id && data.target_user_id !== user.id) return;

      playPokeSound();
      if (navigator.vibrate) navigator.vibrate([80, 50, 80, 50, 80]);

      setAlert({
        id: `poke-${Date.now()}`,
        type: 'poke',
        title: '👉 Dürtüldünüz!',
        body: `${data.sender_name || 'Bir aile üyesi'} sizi dürtüyor!`,
        avatarUrl: data.sender_avatar,
        link: '/chat',
      });
    });

    // 4. Listen to real-time quick status actions (tea, coming_home, meal)
    channel.on('broadcast', { event: 'quick_action_received' }, (payload) => {
      const data = payload.payload;
      if (!data || data.sender_id === user.id) return;

      const actType = data.action_type || data.type;
      if (actType === 'tea') playTeaSound();
      else if (actType === 'coming_home') playCarHornSound();
      else if (actType === 'meal') playMealSound();
      else if (actType === 'heart') playHeartSound();

      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);

      setAlert({
        id: `act-${Date.now()}`,
        type: actType,
        title: data.title || 'Aile Bildirimi',
        body: data.message || `${data.sender_name || 'Bir aile üyesi'} bildirim gönderdi.`,
        avatarUrl: data.sender_avatar,
        link: '/',
      });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, user?.id, location.pathname]);

  // Auto-dismiss after 4.5 seconds
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => {
      setAlert(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [alert]);

  if (!alert) return null;

  const handleClick = () => {
    navigate(alert.link);
    setAlert(null);
  };

  // Color styling based on notification type
  const getBannerBorder = () => {
    switch (alert.type) {
      case 'heart':
        return 'border-rose-300 bg-rose-50/95 shadow-rose-200/50';
      case 'poke':
        return 'border-orange-300 bg-orange-50/95 shadow-orange-200/50 ring-2 ring-orange-400/30';
      case 'tea':
        return 'border-amber-300 bg-amber-50/95 shadow-amber-200/50 ring-2 ring-amber-400/30';
      case 'coming_home':
        return 'border-blue-300 bg-blue-50/95 shadow-blue-200/50 ring-2 ring-blue-400/30';
      case 'meal':
        return 'border-emerald-300 bg-emerald-50/95 shadow-emerald-200/50 ring-2 ring-emerald-400/30';
      case 'reminder':
        return 'border-amber-300 bg-amber-50/95 shadow-amber-200/50';
      default:
        return 'border-gray-200/90 bg-white/95 shadow-gray-200/50';
    }
  };

  const getBadgeColor = () => {
    switch (alert.type) {
      case 'heart':
        return 'bg-rose-500 text-white';
      case 'poke':
        return 'bg-orange-500 text-white';
      case 'tea':
        return 'bg-amber-600 text-white';
      case 'coming_home':
        return 'bg-blue-600 text-white';
      case 'meal':
        return 'bg-emerald-600 text-white';
      case 'reminder':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-family-600 text-white';
    }
  };

  return (
    <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-top-4 duration-200">
      <div
        onClick={handleClick}
        className={`backdrop-blur-md border shadow-2xl rounded-3xl p-3 flex items-center gap-3 cursor-pointer transition active:scale-98 ${getBannerBorder()}`}
      >
        {/* Avatar or Icon with Badge */}
        <div className="relative flex-shrink-0">
          {alert.avatarUrl ? (
            <img
              src={alert.avatarUrl}
              alt={alert.title}
              className="w-11 h-11 rounded-2xl object-cover border-2 border-white shadow-sm"
            />
          ) : alert.type === 'heart' ? (
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <Heart className="w-6 h-6 fill-rose-500 text-rose-500 animate-pulse" />
            </div>
          ) : alert.type === 'tea' ? (
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Coffee className="w-6 h-6 animate-pulse" />
            </div>
          ) : alert.type === 'coming_home' ? (
            <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Car className="w-6 h-6 animate-pulse" />
            </div>
          ) : alert.type === 'meal' ? (
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Utensils className="w-6 h-6 animate-pulse" />
            </div>
          ) : alert.type === 'poke' ? (
            <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
              <span className="text-2xl animate-bounce">👉</span>
            </div>
          ) : alert.type === 'reminder' ? (
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-6 h-6 text-amber-600 animate-bounce" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-family-100 text-family-700 flex items-center justify-center font-bold text-base shadow-xs">
              {alert.title[0] || 'A'}
            </div>
          )}

          {/* Type Badge on avatar */}
          <div
            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs ${getBadgeColor()}`}
          >
            {alert.type === 'heart' ? (
              <Heart className="w-2.5 h-2.5 fill-current" />
            ) : alert.type === 'tea' ? (
              <Coffee className="w-2.5 h-2.5" />
            ) : alert.type === 'coming_home' ? (
              <Car className="w-2.5 h-2.5" />
            ) : alert.type === 'meal' ? (
              <Utensils className="w-2.5 h-2.5" />
            ) : alert.type === 'poke' ? (
              <span className="text-[9px] leading-none">👉</span>
            ) : alert.type === 'reminder' ? (
              <Clock className="w-2.5 h-2.5" />
            ) : (
              <MessageSquare className="w-2.5 h-2.5" />
            )}
          </div>
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4
              className={`text-xs font-black truncate ${
                alert.type === 'poke'
                  ? 'text-orange-950'
                  : alert.type === 'tea'
                  ? 'text-amber-950'
                  : alert.type === 'coming_home'
                  ? 'text-blue-950'
                  : alert.type === 'meal'
                  ? 'text-emerald-950'
                  : alert.type === 'heart'
                  ? 'text-rose-950'
                  : 'text-gray-900'
              }`}
            >
              {alert.title}
            </h4>
            <span className="text-[10px] text-gray-400 font-semibold">Şimdi</span>
          </div>
          <p
            className={`text-xs truncate mt-0.5 font-medium ${
              alert.type === 'poke'
                ? 'text-orange-800 font-semibold'
                : alert.type === 'tea'
                ? 'text-amber-800 font-semibold'
                : alert.type === 'coming_home'
                ? 'text-blue-800 font-semibold'
                : alert.type === 'meal'
                ? 'text-emerald-800 font-semibold'
                : alert.type === 'heart'
                ? 'text-rose-800 font-semibold'
                : 'text-gray-600'
            }`}
          >
            {alert.body}
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAlert(null);
          }}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-black/5 transition flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
