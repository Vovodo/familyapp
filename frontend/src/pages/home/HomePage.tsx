import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MessageCircle,
  ShoppingBag,
  Bell,
  StickyNote,
  Image as ImageIcon,
  Heart,
  Users,
  Plus,
  ArrowRight,
  Sparkles,
  Loader2,
  Coffee,
  Car,
  Utensils,
  ListTodo,
  Wallet,
  Gamepad2,
  Clapperboard,
  QrCode,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';
import { WeatherWidget } from '../../components/home/WeatherWidget';
import { InviteQrScanner } from '../../components/family/InviteQrScanner';
import { extractInviteCode, peekPendingInvite, takePendingInvite } from '../../utils/inviteCode';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { playHeartVibration } from '../../services/notificationService';
import {
  playTeaSound,
  playCarHornSound,
  playMealSound,
  playHeartSound,
} from '../../services/soundService';

type QuickActionType = 'heart' | 'tea' | 'coming_home' | 'meal';

export const HomePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { currentFamily, activeMember, createFamily, joinFamily, isLoading, familiesLoaded } =
    useFamily();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [nickname, setNickname] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);

  // Quick action state
  const [activeAction, setActiveAction] = useState<QuickActionType | null>(null);
  const [actionCooldown, setActionCooldown] = useState(0);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [burstEmoji, setBurstEmoji] = useState<string | null>(null);
  const cooldownTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentFamily || !familiesLoaded) return;
    const fromQuery = extractInviteCode(searchParams.get('code'));
    const pending = peekPendingInvite();
    const code = fromQuery || pending;
    if (!code) return;
    setInviteCode(code);
    setShowJoinModal(true);
  }, [currentFamily, familiesLoaded, searchParams]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'Günaydın';
    if (hour >= 12 && hour < 18) return 'İyi günler';
    if (hour >= 18 && hour < 22) return 'İyi akşamlar';
    return 'İyi geceler';
  };

  const displayName = activeMember?.nickname || user?.full_name?.split(' ')[0] || 'Sevgili Ailem';

  const handleSendQuickAction = async (actionType: QuickActionType) => {
    if (actionCooldown > 0 || activeAction || !currentFamily || !user) return;

    setActiveAction(actionType);

    // 1. Play immediate local audio & haptic
    if (actionType === 'tea') {
      playTeaSound();
      setBurstEmoji('☕');
    } else if (actionType === 'coming_home') {
      playCarHornSound();
      setBurstEmoji('🚗');
    } else if (actionType === 'meal') {
      playMealSound();
      setBurstEmoji('🍲');
    } else {
      playHeartSound();
      playHeartVibration();
      setBurstEmoji('❤️');
    }

    setTimeout(() => setBurstEmoji(null), 1200);

    // 2. Start 3-second cooldown
    setActionCooldown(3);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setActionCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await api.post<{
        status: string;
        action_id: string;
        action_type: string;
        title: string;
        message: string;
        recipients_count: number;
      }>('/families/quick-action', {
        action_type: actionType,
      });

      // 3. Supabase Realtime Broadcast for fast delivery
      if (supabase && currentFamily) {
        const channel = supabase.channel(`family-inapp-alerts-${currentFamily.id}`);
        channel.send({
          type: 'broadcast',
          event: 'quick_action_received',
          payload: {
            action_type: actionType,
            title: res.data.title,
            message: res.data.message,
            sender_id: user.id,
            sender_name: displayName,
            sender_avatar: user.avatar_url,
          },
        });
      }

      setActionSuccessMsg(`${res.data.title} (${res.data.recipients_count || 0} kişiye iletildi)`);
      setTimeout(() => setActionSuccessMsg(null), 3000);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setActionSuccessMsg('⏳ Lütfen birkaç saniye bekleyin.');
      } else {
        setActionSuccessMsg('❌ Bildirim iletilemedi.');
      }
      setTimeout(() => setActionSuccessMsg(null), 2500);
    } finally {
      setActiveAction(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      setActionError(null);
      await joinFamily(inviteCode.trim(), nickname.trim() || undefined);
      takePendingInvite();
      setShowJoinModal(false);
      setInviteCode('');
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName.trim()) return;
    try {
      setActionError(null);
      await createFamily(familyName.trim());
      setShowCreateModal(false);
      setFamilyName('');
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Loading state while family information is being fetched. `familiesLoaded`
  // keeps the create/join onboarding below unreachable until the server has
  // confirmed the account really has no family.
  if (isLoading || (!currentFamily && !familiesLoaded)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-family-50 flex items-center justify-center text-family-600 shadow-inner">
          <Heart className="w-8 h-8 fill-family-500 text-family-500 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-family-600" />
          <span>Aile bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  // If user has NO family group yet, display Join / Create onboarding
  if (!currentFamily) {
    return (
      <div className="p-4 flex flex-col justify-center min-h-[80vh] space-y-6 max-w-md mx-auto">
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-3xl bg-family-100 flex items-center justify-center text-family-600 mx-auto shadow-inner">
            <Heart className="w-10 h-10 fill-family-500 text-family-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Hoş Geldiniz, {user?.full_name || 'Aile Üyemiz'}!
          </h1>
          <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
            Ailem uygulamasına başlamak için bir aile grubu oluşturun veya ailenizin davet koduyla katılın.
          </p>
        </div>

        {actionError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 text-center font-bold">
            {actionError}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="w-full py-4 px-5 bg-family-600 hover:bg-family-700 active:scale-98 text-white rounded-3xl font-black text-sm shadow-lg shadow-family-300 flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-extrabold">Yeni Aile Grubu Kur</div>
                <div className="text-[11px] text-family-100 font-normal">
                  Aileniz için özel bir alan açın
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-family-200 flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setShowJoinModal(true)}
            className="w-full py-4 px-5 bg-white hover:bg-gray-50 active:scale-98 text-gray-800 border-2 border-gray-200 rounded-3xl font-black text-sm shadow-xs flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-700">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-extrabold">Aile Grubuna Katıl</div>
                <div className="text-[11px] text-gray-500 font-normal">
                  Davet kodu veya QR ile mevcut gruba girin
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => logout()}
              className="text-xs text-gray-400 hover:text-gray-600 font-semibold underline transition cursor-pointer"
            >
              Farklı bir hesapla giriş yap (Çıkış)
            </button>
          </div>
        </div>

        {/* Modal: Create Family */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Yeni Aile Grubu</h3>
              <p className="text-xs text-gray-500 mb-4">Ailenize vermek istediğiniz ismi girin</p>
              <form onSubmit={handleCreate} className="space-y-4">
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Örn: Pamukçu Ailesi ❤️"
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500"
                  autoFocus
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold rounded-2xl text-sm"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-family-600 hover:bg-family-700 text-white font-bold rounded-2xl text-sm"
                  >
                    Oluştur
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Join Family */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Aileye Katıl</h3>
              <p className="text-xs text-gray-500 mb-4">Katılım kodunu yazın veya QR kodu tarayın</p>
              <form onSubmit={handleJoin} className="space-y-3">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="AILE-123456"
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-base font-mono uppercase tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 text-center font-bold"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowQrScanner(true)}
                  className="w-full py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR kod tara</span>
                </button>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Hitabınız (Örn: Anne, Baba, Kardeş)"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowJoinModal(false)}
                    className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold rounded-2xl text-sm"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-family-600 hover:bg-family-700 text-white font-bold rounded-2xl text-sm"
                  >
                    Katıl
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {showQrScanner && (
          <InviteQrScanner
            onDetected={(code) => {
              setInviteCode(code);
              setShowQrScanner(false);
            }}
            onClose={() => setShowQrScanner(false)}
          />
        )}
      </div>
    );
  }

  const menuCards = [
    {
      title: 'Aile Sohbeti',
      subtitle: 'Mesajlar, anketler ve sesler',
      icon: MessageCircle,
      to: '/chat',
      bgColor: 'bg-rose-50/80',
      iconBg: 'bg-rose-500',
      textColor: 'text-rose-900',
      badge: 'Sohbet Et',
    },
    {
      title: 'Yapılacaklar Listesi',
      subtitle: 'Aile içi iş ve görev paylaşımı',
      icon: ListTodo,
      to: '/tasks',
      bgColor: 'bg-teal-50/80',
      iconBg: 'bg-teal-600',
      textColor: 'text-teal-900',
      badge: 'Görevler',
    },
    {
      title: 'Ortak Bütçe & Harcama',
      subtitle: 'Gelir, gider ve aylık kasa raporu',
      icon: Wallet,
      to: '/budget',
      bgColor: 'bg-indigo-50/80',
      iconBg: 'bg-indigo-600',
      textColor: 'text-indigo-900',
      badge: 'Kasa & Rapor',
    },
    {
      title: 'Alışveriş Listesi',
      subtitle: 'Market ve ev ihtiyaçları',
      icon: ShoppingBag,
      to: '/shopping',
      bgColor: 'bg-emerald-50/80',
      iconBg: 'bg-emerald-500',
      textColor: 'text-emerald-900',
      badge: 'Ortak Liste',
    },
    {
      title: 'Hatırlatıcılar',
      subtitle: 'Randevular ve özel günler',
      icon: Bell,
      to: '/reminders',
      bgColor: 'bg-amber-50/80',
      iconBg: 'bg-amber-500',
      textColor: 'text-amber-900',
      badge: 'Alarmlar',
    },
    {
      title: 'Aile Notları',
      subtitle: 'Önemli bilgiler ve tarifler',
      icon: StickyNote,
      to: '/notes',
      bgColor: 'bg-purple-50/80',
      iconBg: 'bg-purple-500',
      textColor: 'text-purple-900',
      badge: 'Notlar',
    },
    {
      title: 'Oyunlar',
      subtitle: 'Çiz ve tahmin et, birlikte oynayın',
      icon: Gamepad2,
      to: '/games',
      bgColor: 'bg-fuchsia-50/80',
      iconBg: 'bg-fuchsia-600',
      textColor: 'text-fuchsia-900',
      badge: 'Canlı Oyun',
    },
    {
      title: 'Seyir Partisi',
      subtitle: 'Birlikte film ve dizi izleme',
      icon: Clapperboard,
      to: '/watch-party',
      bgColor: 'bg-violet-50/80',
      iconBg: 'bg-violet-600',
      textColor: 'text-violet-900',
      badge: 'Yakında',
    },
    {
      title: 'Fotoğraf & Anılar',
      subtitle: 'Aile albümü ve paylaşımlar',
      icon: ImageIcon,
      to: '/gallery',
      bgColor: 'bg-sky-50/80',
      iconBg: 'bg-sky-500',
      textColor: 'text-sky-900',
      badge: 'Albüm',
    },
    {
      title: 'Aile Yönetimi',
      subtitle: 'Üye daveti ve ayarlar',
      icon: Users,
      to: '/family',
      bgColor: 'bg-gray-50/80',
      iconBg: 'bg-gray-600',
      textColor: 'text-gray-900',
      badge: 'Ayarlar',
    },
  ];

  return (
    <div className="p-4 space-y-4 w-full max-w-full overflow-x-hidden box-border">
      {/* Warm Greeting Card (Aile Alanı Hero Card with Dynamic Theme Gradient) */}
      <div className="theme-hero-card rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden transition-all duration-300">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 pointer-events-none">
          <Heart className="w-40 h-40 sm:w-48 sm:h-48 fill-white" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-90">
            <Sparkles className="w-4 h-4" />
            <span>Aile Alanı</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-1">
            {getGreeting()}, {displayName} ❤️
          </h2>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">
            {currentFamily?.name} grubundasınız. Ailenize anlık bir durum bildirin:
          </p>
        </div>
      </div>

      {/* ☀️ Live Weather Widget (Open-Meteo Integration) */}
      <WeatherWidget />

      {/* 🚀 Quick Family Status Buttons Panel (Kalp, Çay, Eve Geliyorum, Yemek Hazır - 100% Constant Colors) */}
      <div className="relative w-full space-y-2">
        {burstEmoji && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
            <div className="text-5xl animate-ping">{burstEmoji}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* ❤️ Kalp Gönder */}
          <button
            type="button"
            onClick={() => handleSendQuickAction('heart')}
            disabled={actionCooldown > 0 || !!activeAction}
            className="p-3 quick-action-heart rounded-2xl active:scale-95 transition cursor-pointer flex items-center gap-2.5 disabled:opacity-75"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-black truncate">Kalp Gönder</div>
              <div className="text-[10px] text-white/90 truncate">Sevgi ilet</div>
            </div>
          </button>

          {/* ☕ Çay Koydum */}
          <button
            type="button"
            onClick={() => handleSendQuickAction('tea')}
            disabled={actionCooldown > 0 || !!activeAction}
            className="p-3 quick-action-tea rounded-2xl active:scale-95 transition cursor-pointer flex items-center gap-2.5 disabled:opacity-75"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Coffee className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-black truncate">Çay Koydum</div>
              <div className="text-[10px] text-white/90 truncate">Sizi bekliyor</div>
            </div>
          </button>

          {/* 🚗 Eve Geliyorum */}
          <button
            type="button"
            onClick={() => handleSendQuickAction('coming_home')}
            disabled={actionCooldown > 0 || !!activeAction}
            className="p-3 quick-action-coming-home rounded-2xl active:scale-95 transition cursor-pointer flex items-center gap-2.5 disabled:opacity-75"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Car className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-black truncate">Eve Geliyorum</div>
              <div className="text-[10px] text-white/90 truncate">Yola çıktım</div>
            </div>
          </button>

          {/* 🍲 Yemek Hazır */}
          <button
            type="button"
            onClick={() => handleSendQuickAction('meal')}
            disabled={actionCooldown > 0 || !!activeAction}
            className="p-3 quick-action-meal rounded-2xl active:scale-95 transition cursor-pointer flex items-center gap-2.5 disabled:opacity-75"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Utensils className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-black truncate">Yemek Hazır</div>
              <div className="text-[10px] text-white/90 truncate">Sofraya buyrun</div>
            </div>
          </button>
        </div>

        {actionSuccessMsg && (
          <div className="text-center text-xs font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 py-1.5 px-3 rounded-xl shadow-xs animate-in fade-in">
            {actionSuccessMsg}
          </div>
        )}
      </div>

      {/* Core Feature Grid - 8 items */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {menuCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.to}
              onClick={() => navigate(card.to)}
              className="theme-surface p-3.5 rounded-2xl border shadow-xs hover:shadow-md active:scale-95 transition-all text-left flex flex-col gap-3 relative overflow-hidden cursor-pointer min-h-[120px]"
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center text-white shadow-md`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full theme-surface-secondary theme-text-secondary max-w-[75px] truncate">
                  {card.badge}
                </span>
              </div>

              <div className="flex-1">
                <h3 className="text-sm font-black theme-text-primary leading-tight">
                  {card.title}
                </h3>
                <p className="text-[10px] theme-text-secondary mt-0.5 line-clamp-2 leading-snug">
                  {card.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Prominent APK Download Banner on Web (Hidden inside APK) */}
      <DownloadApkButton variant="banner" className="mt-2" />
    </div>
  );
};
