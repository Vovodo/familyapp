import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember, createFamily, joinFamily, isLoading } = useFamily();
  const navigate = useNavigate();

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [nickname, setNickname] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'Günaydın';
    if (hour >= 12 && hour < 18) return 'İyi günler';
    if (hour >= 18 && hour < 22) return 'İyi akşamlar';
    return 'İyi geceler';
  };

  const displayName = activeMember?.nickname || user?.full_name || 'Sevgili Ailem';

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      setActionError(null);
      await joinFamily(inviteCode.trim(), nickname.trim() || undefined);
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

  if (!currentFamily && !isLoading) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-6">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-family-100 rounded-3xl flex items-center justify-center text-family-600 mx-auto mb-4 shadow-lg shadow-family-100">
            <Heart className="w-10 h-10 fill-family-500 text-family-500" />
          </div>
          <h2 className="text-2xl font-black text-gray-900">Hoş Geldiniz!</h2>
          <p className="text-gray-600 text-sm mt-1">
            Uygulamayı kullanmaya başlamak için bir aile grubu oluşturun veya var olan ailenize katılın.
          </p>
        </div>

        {actionError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
            {actionError}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full p-5 bg-family-600 hover:bg-family-700 active:scale-[0.98] text-white rounded-3xl shadow-xl shadow-family-600/25 flex items-center justify-between text-left transition"
          >
            <div>
              <div className="text-lg font-bold">Yeni Aile Grubu Kur</div>
              <div className="text-xs text-family-100 mt-0.5">Aileniz için ilk grubu oluşturun ve davet kodu alın</div>
            </div>
            <Plus className="w-6 h-6 flex-shrink-0" />
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="w-full p-5 bg-white hover:bg-gray-50 active:scale-[0.98] border-2 border-gray-200 text-gray-900 rounded-3xl shadow-sm flex items-center justify-between text-left transition"
          >
            <div>
              <div className="text-lg font-bold">Aileye Katıl</div>
              <div className="text-xs text-gray-500 mt-0.5">Aile üyenizden aldığınız davet kodunu girin</div>
            </div>
            <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />
          </button>
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
              <p className="text-xs text-gray-500 mb-4">Size verilen 6-8 haneli katılım kodunu girin</p>
              <form onSubmit={handleJoin} className="space-y-3">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="AILE-123456"
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-base font-mono uppercase tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500 text-center font-bold"
                  autoFocus
                />
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Hitabınız (Örn: Anne, Baba, Ege)"
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
      </div>
    );
  }

  const menuCards = [
    {
      title: 'Aile Sohbeti',
      subtitle: 'Mesajlar ve fotoğraflar',
      icon: MessageCircle,
      to: '/chat',
      bgColor: 'bg-rose-50',
      iconBg: 'bg-rose-500',
      textColor: 'text-rose-900',
      badge: '💬 Sohbet Et',
    },
    {
      title: 'Alışveriş Listesi',
      subtitle: 'Market ve ev ihtiyaçları',
      icon: ShoppingBag,
      to: '/shopping',
      bgColor: 'bg-emerald-50',
      iconBg: 'bg-emerald-500',
      textColor: 'text-emerald-900',
      badge: '🛒 Ortak Liste',
    },
    {
      title: 'Hatırlatıcılar',
      subtitle: 'Randevular ve özel günler',
      icon: Bell,
      to: '/reminders',
      bgColor: 'bg-amber-50',
      iconBg: 'bg-amber-500',
      textColor: 'text-amber-900',
      badge: '🔔 Alarm & Not',
    },
    {
      title: 'Aile Notları',
      subtitle: 'Önemli bilgiler ve şifreler',
      icon: StickyNote,
      to: '/notes',
      bgColor: 'bg-sky-50',
      iconBg: 'bg-sky-500',
      textColor: 'text-sky-900',
      badge: '📝 Not Defteri',
    },
    {
      title: 'Fotoğraf & Anılar',
      subtitle: 'Güzel anlar albümü',
      icon: ImageIcon,
      to: '/gallery',
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-500',
      textColor: 'text-purple-900',
      badge: '📷 Galeri',
    },
    {
      title: 'Aile Üyeleri',
      subtitle: 'Davet kodu ve ayarlar',
      icon: Users,
      to: '/family',
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-500',
      textColor: 'text-orange-900',
      badge: '❤️ Ailemiz',
    },
  ];

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Warm Greeting Card */}
      <div className="bg-gradient-to-br from-family-600 to-family-800 rounded-3xl p-6 text-white shadow-xl shadow-family-900/15 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10 pointer-events-none">
          <Heart className="w-48 h-48 fill-white" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-family-200">
            <Sparkles className="w-4 h-4" />
            <span>Aile Alanı</span>
          </div>
          <h2 className="text-2xl font-black mt-1">
            {getGreeting()}, {displayName} ❤️
          </h2>
          <p className="text-xs text-family-100 mt-1 leading-relaxed">
            {currentFamily?.name} grubundasınız. Bugün aileyle paylaşmak istediğiniz bir şey var mı?
          </p>
        </div>
      </div>

      {/* 6 Core Feature Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        {menuCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.to}
              onClick={() => navigate(card.to)}
              className={`${card.bgColor} p-4 rounded-3xl border border-white/60 shadow-sm hover:shadow-md active:scale-95 transition-all text-left flex flex-col justify-between h-36 relative overflow-hidden group`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`w-11 h-11 ${card.iconBg} rounded-2xl flex items-center justify-center text-white shadow-md`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-gray-700 shadow-xs">
                  {card.badge}
                </span>
              </div>

              <div>
                <h3 className={`text-base font-bold ${card.textColor} leading-tight`}>
                  {card.title}
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
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
