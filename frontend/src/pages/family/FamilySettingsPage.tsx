import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  LogOut,
  UserCheck,
  Shield,
  Heart,
  Edit3,
  Loader2,
  Trash2,
  AlertTriangle,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';

export const FamilySettingsPage: React.FC = () => {
  const { user, logout, updateProfile } = useAuth();
  const { currentFamily, deleteFamily } = useFamily();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  // Delete Group Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const copyInviteCode = () => {
    if (!currentFamily?.invite_code) return;
    navigator.clipboard.writeText(currentFamily.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      setIsEditingProfile(false);
    } catch (err: any) {
      alert('Profil güncellenemedi: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText.trim().toLowerCase() !== 'evet' || !currentFamily) return;

    setIsDeleting(true);
    try {
      await deleteFamily(currentFamily.id);
      setShowDeleteModal(false);
      await logout();
      navigate('/login');
    } catch (err: any) {
      alert('Aile grubu silinemedi: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfirmed = confirmText.trim().toLowerCase() === 'evet';

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Family Info Card */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-family-50 text-family-600 rounded-2xl flex items-center justify-center font-bold text-lg">
            ❤️
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">{currentFamily?.name || 'Ailemiz'}</h2>
            <p className="text-xs text-gray-500">{currentFamily?.members?.length || 1} Aile Üyesi</p>
          </div>
        </div>

        {/* Invite Code Box */}
        {currentFamily?.invite_code && (
          <div className="bg-family-50/60 rounded-2xl p-4 border border-family-100 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-family-800 uppercase tracking-wider">
                Aile Katılım Kodu
              </div>
              <div className="text-xl font-mono font-black text-family-900 tracking-wider mt-0.5">
                {currentFamily.invite_code}
              </div>
              <div className="text-[10px] text-family-600 mt-0.5">
                Yeni aile bireyleri bu kod ile katılabilir
              </div>
            </div>

            <button
              onClick={copyInviteCode}
              className={`p-3 rounded-2xl transition shadow-xs flex items-center gap-1.5 text-xs font-bold ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-family-600 hover:bg-family-700 text-white active:scale-95 cursor-pointer'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Kopyala</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Family Members List */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-family-600" />
            <span>Aile Üyeleri</span>
          </h3>
          <span className="text-xs font-semibold text-gray-400">
            {currentFamily?.members?.length || 0} Kişi
          </span>
        </div>

        <div className="space-y-2">
          {currentFamily?.members?.map((member) => {
            const isCurrentUser = member.user_id === user?.id;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-sm shadow-2xs">
                    {member.nickname?.[0] || member.user?.full_name?.[0] || 'A'}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>{member.nickname || member.user?.full_name}</span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-family-100 text-family-700 font-bold px-1.5 py-0.2 rounded-md">
                          Siz
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {member.user?.full_name} {member.user?.email && `• ${member.user.email}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  {member.role === 'admin' ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Yönetici</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500 bg-gray-200/60 px-2 py-1 rounded-xl">
                      Üye
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Profile Card */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-family-600" />
            <span>Kişisel Bilgilerim</span>
          </h3>
          {!isEditingProfile && (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="text-xs font-bold text-family-600 hover:text-family-700 flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Düzenle</span>
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={handleUpdateProfile} className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Ad Soyad
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Telefon Numarası
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxxx"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2 bg-family-600 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Kaydet'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div>
              <span className="font-bold text-gray-700">İsim:</span> {user?.full_name}
            </div>
            {user?.email && (
              <div>
                <span className="font-bold text-gray-700">E-posta:</span> {user.email}
              </div>
            )}
            {user?.phone && (
              <div>
                <span className="font-bold text-gray-700">Telefon:</span> {user.phone}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Danger Zone: Close / Permanently Delete Family Group */}
      <div className="bg-red-50/70 rounded-3xl p-5 border border-red-200 space-y-3">
        <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
          <ShieldAlert className="w-5 h-5 text-red-600" />
          <span>Tehlikeli Bölge</span>
        </div>
        <p className="text-xs text-red-700 leading-relaxed">
          Aile grubunu kapattığınızda bu grupta yapılan tüm konuşma geçmişi, notlar, hatırlatıcılar ve alışveriş listesi buluttan ve cihazlardan kalıcı olarak silinir.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmText('');
            setShowDeleteModal(true);
          }}
          className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Grubu Kapat / Tüm Verileri Kalıcı Sil</span>
        </button>
      </div>

      {/* Download APK option on Web */}
      <DownloadApkButton variant="compact" />

      {/* Logout Button */}
      <div className="pt-1">
        <button
          onClick={logout}
          className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 border border-gray-200 transition active:scale-98 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Hesaptan Çıkış Yap</span>
        </button>
      </div>

      {/* Confirmation Modal for Permanent Family Deletion */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 border border-red-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600 font-black text-base">
                <AlertTriangle className="w-6 h-6" />
                <span>Grubu Kapatma Onayı</span>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-red-50 rounded-2xl border border-red-200 space-y-1.5 text-xs text-red-800">
              <div className="font-bold">⚠️ DİKKAT: Bu işlem geri alınamaz!</div>
              <p className="leading-relaxed">
                <strong>{currentFamily?.name}</strong> grubuna ait tüm mesajlar, fotoğraflar, notlar ve hatırlatıcılar buluttan ve telefonunuzdan tamamen silinecektir.
              </p>
            </div>

            <form onSubmit={handleDeleteFamily} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Onaylamak için aşağıdaki kutucuğa <span className="text-red-600 font-black">Evet</span> yazın:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Evet"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 text-center"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={!isConfirmed || isDeleting}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 active:scale-98 disabled:opacity-40 text-white font-bold rounded-2xl text-xs shadow-md shadow-red-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Kalıcı Olarak Sil</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
