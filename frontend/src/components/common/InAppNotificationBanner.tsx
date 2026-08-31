import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Bell, X, Heart, Clock } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';

interface InAppAlert {
  id: string;
  type: 'chat' | 'reminder' | 'heart';
  title: string;
  body: string;
  avatarUrl?: string;
  link: string;
}

export const InAppNotificationBanner: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const navigate = useNavigate();
  const [alert, setAlert] = useState<InAppAlert | null>(null);

  useEffect(() => {
    if (!currentFamily || !supabase || !user) return;

    const channel = supabase.channel(`family-inapp-alerts-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    // Listen to real-time chat messages
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
        if (msg.sender_id === user.id || window.location.pathname === '/chat') return;

        const senderMember = currentFamily.members?.find((m) => m.user_id === msg.sender_id);
        const senderName = senderMember?.nickname || senderMember?.user?.full_name || 'Aile Üyesi';
        const avatarUrl = senderMember?.user?.avatar_url;

        let bodyText = msg.content;
        if (!bodyText) {
          if (msg.media_type === 'audio') bodyText = '🎤 Bir sesli mesaj gönderdi';
          else if (msg.media_type === 'image') bodyText = '📷 Bir fotoğraf paylaştı';
          else bodyText = 'Yeni bir mesaj gönderdi';
        }

        setAlert({
          id: msg.id || String(Date.now()),
          type: 'chat',
          title: senderName,
          body: bodyText,
          avatarUrl,
          link: '/chat',
        });
      }
    );

    // Listen to real-time heart events
    channel.on('broadcast', { event: 'heart_received' }, (payload) => {
      const data = payload.payload;
      if (!data || data.sender_id === user.id) return;

      setAlert({
        id: `heart-${Date.now()}`,
        type: 'heart',
        title: '❤️ Aileden Bir Kalp',
        body: `${data.sender_name || 'Aileniz'} size sevgi dolu bir kalp gönderdi!`,
        link: '/',
      });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, user?.id]);

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

  return (
    <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-50 animate-in slide-in-from-top-4 duration-200">
      <div
        onClick={handleClick}
        className="bg-white/95 backdrop-blur-md border border-gray-200/80 shadow-2xl rounded-3xl p-3 flex items-center gap-3 cursor-pointer hover:bg-white transition active:scale-98"
      >
        {/* Avatar or Icon */}
        <div className="relative flex-shrink-0">
          {alert.avatarUrl ? (
            <img
              src={alert.avatarUrl}
              alt={alert.title}
              className="w-11 h-11 rounded-2xl object-cover border-2 border-family-200 shadow-sm"
            />
          ) : alert.type === 'heart' ? (
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <Heart className="w-6 h-6 fill-rose-500 text-rose-500 animate-pulse" />
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

          {alert.type === 'chat' && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-family-600 text-white rounded-full flex items-center justify-center border-2 border-white shadow-xs">
              <MessageSquare className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-gray-900 truncate">{alert.title}</h4>
            <span className="text-[10px] text-gray-400 font-semibold">Şimdi</span>
          </div>
          <p className="text-xs text-gray-600 truncate mt-0.5 font-medium">{alert.body}</p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAlert(null);
          }}
          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
