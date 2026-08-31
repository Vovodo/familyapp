import React, { useState, useEffect, useRef } from 'react';
import { Heart, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { supabase } from '../../services/supabase';
import { pushNotificationService, playHeartVibration } from '../../services/pushNotification';

interface FloatingHeart {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

export const HeartCelebrationOverlay: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [activeHeart, setActiveHeart] = useState<{
    senderName: string;
    eventId: string;
  } | null>(null);

  const processedEventIds = useRef<Set<string>>(new Set());

  const triggerHeartCelebration = (senderName: string, eventId: string) => {
    if (processedEventIds.current.has(eventId)) return;
    processedEventIds.current.add(eventId);

    // Keep set clean
    if (processedEventIds.current.size > 100) {
      processedEventIds.current.clear();
    }

    playHeartVibration();
    setActiveHeart({ senderName, eventId });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setActiveHeart((curr) => (curr?.eventId === eventId ? null : curr));
    }, 4500);
  };

  // 1. Listen to Supabase Realtime Broadcast for instant zero-latency in-app hearts
  useEffect(() => {
    if (!currentFamily || !supabase || !user) return;

    const channel = supabase.channel(`family-realtime-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    channel.on('broadcast', { event: 'heart_received' }, (payload) => {
      const data = payload.payload;
      if (!data) return;
      // Do not show on sender's phone (sender has optimistic feedback)
      if (data.sender_id && data.sender_id === user.id) return;

      triggerHeartCelebration(data.sender_name || 'Aile Bireyi', data.id || `rt-${Date.now()}`);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, user?.id]);

  // 2. Listen to Push Notification Service
  useEffect(() => {
    const unsub = pushNotificationService.subscribeHeartReceived((data) => {
      triggerHeartCelebration(data.sender_name, data.event_id);
    });
    return unsub;
  }, []);

  if (!activeHeart) return null;

  // Generate 16 floating heart particles
  const particles: FloatingHeart[] = Array.from({ length: 16 }).map((_, i) => ({
    id: i,
    left: Math.random() * 90 + 5, // 5% to 95%
    size: Math.floor(Math.random() * 24) + 20, // 20px to 44px
    delay: Math.random() * 0.8,
    duration: Math.random() * 1.5 + 2.5, // 2.5s to 4.0s
    color: ['#E11D48', '#F43F5E', '#FB7185', '#FDA4AF', '#BE123C'][i % 5],
  }));

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex flex-col items-center justify-start pt-16 px-4 overflow-hidden">
      {/* Background Soft Glow */}
      <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-[2px] animate-fade-in pointer-events-none" />

      {/* Floating Heart Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute bottom-0 text-rose-500 animate-float-up opacity-90"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            color: p.color,
          }}
        >
          ❤️
        </div>
      ))}

      {/* Sweet Interactive Celebration Toast */}
      <div className="pointer-events-auto relative z-10 bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 shadow-2xl border-2 border-rose-200/80 max-w-xs w-full text-center space-y-2 animate-bounce-short">
        <button
          onClick={() => setActiveHeart(null)}
          className="absolute top-2.5 right-2.5 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 bg-gradient-to-tr from-rose-500 to-pink-500 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg shadow-rose-500/30 animate-pulse">
          <Heart className="w-8 h-8 fill-white" />
        </div>

        <div>
          <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-rose-600 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sevgi Dolu Bildirim</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-base font-black text-gray-900 mt-0.5">
            {activeHeart.senderName}
          </h3>
          <p className="text-xs font-medium text-gray-600 mt-0.5">
            size sıcacık bir kalp gönderdi! ❤️
          </p>
        </div>
      </div>
    </div>
  );
};
