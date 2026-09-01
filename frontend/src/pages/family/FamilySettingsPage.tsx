import React, { useState, useRef, useEffect } from 'react';
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
  Globe,
  Lock,
  UserMinus,
  Camera,
  ShieldCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { api } from '../../services/api';
import { syncService } from '../../services/syncService';
import { SyncStatus } from '../../types';
import { DownloadApkButton } from '../../components/common/DownloadApkButton';
import { PermissionAssistantModal } from '../../components/common/PermissionAssistantModal';
import { CloudRestorePromptModal } from '../../components/common/CloudRestorePromptModal';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export const FamilySettingsPage: React.FC = () => {
  const { user, logout, updateProfile } = useAuth();
  const { currentFamily, deleteFamily, updateFamilySettings, removeMember, leaveFamily } = useFamily();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  // Cloud Backup & Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isUpdatingBackup, setIsUpdatingBackup] = useState(false);
  const [isManualBackupRunning, setIsManualBackupRunning] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post<{ avatar_url: string }>('/media/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await updateProfile({ avatar_url: res.data.avatar_url });
    } catch (err: any) {
      alert('Fotoğraf yüklenemedi: ' + (err.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  // Group Delete Modal (Creator Only)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Leave Group Modal (Non-Creator Members)
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Kick Member Modal
  const [memberToKick, setMemberToKick] = useState<{ id: string; name: string } | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  // Privacy Toggle State
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);

  const isCreator =
    currentFamily?.created_by === user?.id ||
    (!currentFamily?.created_by && user?.role === 'admin') ||
    user?.role === 'admin';
  const isAdmin =
    currentFamily?.members?.some((m) => m.user_id === user?.id && m.role === 'admin') ||
    isCreator ||
    user?.role === 'admin';

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

  const handleTogglePrivacy = async (newPublicVal: boolean) => {
    if (!isAdmin) return;
    setIsUpdatingPrivacy(true);
    try {
      await updateFamilySettings({ is_public: newPublicVal });
    } catch (err: any) {
      alert('Görünürlük ayarlanamadı: ' + err.message);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  // Load Cloud Backup Status
  useEffect(() => {
    if (currentFamily?.id) {
      syncService.getSyncStatus().then((s) => {
        if (s) setSyncStatus(s);
      });
    }
  }, [currentFamily?.id]);

  const handleToggleCloudBackup = async (newVal: boolean) => {
    if (!isAdmin || isUpdatingBackup) return;
    setIsUpdatingBackup(true);
    try {
      const updated = await syncService.toggleCloudChatBackup(newVal);
      setSyncStatus(updated);
      await updateFamilySettings({ cloud_chat_backup_enabled: newVal });
    } catch (err: any) {
      alert('Yedekleme ayarı değiştirilemedi: ' + (err.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setIsUpdatingBackup(false);
    }
  };

  const handleManualBackupNow = async () => {
    if (!currentFamily || isManualBackupRunning) return;
    setIsManualBackupRunning(true);
    try {
      await syncService.flushBackupQueue(currentFamily.id);
      const updated = await syncService.getSyncStatus();
      if (updated) setSyncStatus(updated);
      alert('Sohbet verileri buluta başarıyla yedeklendi!');
    } catch (err: any) {
      alert('Yedekleme sırasında hata: ' + (err.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setIsManualBackupRunning(false);
    }
  };

  const handleKickMember = async () => {
    if (!memberToKick) return;
    setIsKicking(true);
    try {
      await removeMember(memberToKick.id);
      setMemberToKick(null);
    } catch (err: any) {
      alert('Üye çıkarılamadı: ' + err.message);
    } finally {
      setIsKicking(false);
    }
  };

  const handleLeaveFamily = async () => {
    setIsLeaving(true);
    try {
      await leaveFamily();
      setShowLeaveModal(false);
      navigate('/');
    } catch (err: any) {
      alert('Gruptan ayrılamadı: ' + err.message);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDeleteFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText.trim().toLowerCase() !== 'evet' || !currentFamily || !isCreator) return;

    setIsDeleting(true);
    try {
      await deleteFamily(currentFamily.id);
      setShowDeleteModal(false);
      navigate('/');
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-family-50 text-family-600 rounded-2xl flex items-center justify-center font-bold text-lg">
              ❤️
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">{currentFamily?.name || 'Ailemiz'}</h2>
              <p className="text-xs text-gray-500">
                {currentFamily?.members?.length || 1} Aile Üyesi • {isCreator ? 'Kurucu Sizsiniz' : 'Üyesiniz'}
              </p>
            </div>
          </div>
        </div>

        {/* Public / Private Visibility Toggle (Admin Only) */}
        {isAdmin && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentFamily?.is_public ? (
                <Globe className="w-4 h-4 text-emerald-600" />
              ) : (
                <Lock className="w-4 h-4 text-amber-600" />
              )}
              <div>
                <div className="text-xs font-bold text-gray-800">
                  {currentFamily?.is_public ? 'Herkese Açık Grup' : 'Gizli Aile Grubu'}
                </div>
                <div className="text-[10px] text-gray-400">
                  {currentFamily?.is_public ? 'Aramalarda ve keşfette görünür' : 'Yalnızca davet koduyla girilebilir'}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isUpdatingPrivacy}
              onClick={() => handleTogglePrivacy(!currentFamily?.is_public)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition active:scale-95 cursor-pointer ${
                currentFamily?.is_public
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              }`}
            >
              {isUpdatingPrivacy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : currentFamily?.is_public ? (
                'Gizli Yap'
              ) : (
                'Açık Yap'
              )}
            </button>
          </div>
        )}

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
            const isMemberCreator = member.user_id === currentFamily.created_by;
            const memberAvatar = member.user?.avatar_url || (isCurrentUser ? user?.avatar_url : undefined);

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  {memberAvatar ? (
                    <img
                      src={memberAvatar}
                      alt={member.nickname || member.user?.full_name}
                      className="w-10 h-10 rounded-2xl object-cover border border-gray-200 shadow-2xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-sm shadow-2xs">
                      {member.nickname?.[0] || member.user?.full_name?.[0] || 'A'}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>{member.nickname || member.user?.full_name}</span>
                      {isCurrentUser && (
                        <span className="text-[10px] bg-family-100 text-family-700 font-bold px-1.5 py-0.2 rounded-md">
                          Siz
                        </span>
                      )}
                      {isMemberCreator && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.2 rounded-md">
                          Kurucu
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {member.user?.full_name} {member.user?.email && `• ${member.user.email}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
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

                  {/* Kick Member Button (Admin only, cannot kick self or creator) */}
                  {isAdmin && !isCurrentUser && !isMemberCreator && (
                    <button
                      type="button"
                      onClick={() =>
                        setMemberToKick({
                          id: member.id,
                          name: member.nickname || member.user?.full_name || 'Bu üye',
                        })
                      }
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                      title="Gruptan Çıkar"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Profile Card */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-family-600" />
            <span>Kişisel Profilim</span>
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

        {/* Avatar Photo Section */}
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
          />
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-family-300 shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-family-100 text-family-700 flex items-center justify-center font-black text-2xl border-2 border-family-200">
                {user?.full_name?.[0] || 'A'}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition">
              {isUploadingAvatar ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-900">Profil Fotoğrafı</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Sohbette ve bildirimlerde görünür</div>
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              className="mt-1.5 px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-family-600" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-family-600" />
              )}
              <span>{user?.avatar_url ? 'Fotoğrafı Değiştir' : 'Fotoğraf Yükle'}</span>
            </button>
          </div>
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

      {/* Group Actions: Creator Delete vs Member Leave */}
      {isCreator ? (
        /* Danger Zone: Only the CREATOR can delete the family */
        <div className="bg-red-50/70 rounded-3xl p-5 border border-red-200 space-y-3">
          <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <span>Grup Kurucu Yetkisi (Tehlikeli Bölge)</span>
          </div>
          <p className="text-xs text-red-700 leading-relaxed">
            Bu aile grubunu kuran kişi sizsiniz. Grubu kapattığınızda tüm konuşma geçmişi, notlar ve fotoğraflar kalıcı olarak silinir.
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
            <span>Aile Grubunu Kapat / Kalıcı Sil</span>
          </button>
        </div>
      ) : (
        /* Regular Member Leave Option */
        <div className="bg-amber-50/70 rounded-3xl p-5 border border-amber-200 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <LogOut className="w-5 h-5 text-amber-600" />
            <span>Aileden Ayrıl</span>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Bu aile grubundan ayrılmak istediğinizde diğer aile üyeleri etkilenmez, grup açık kalmaya devam eder.
          </p>
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Aile Grubundan Ayrıl</span>
          </button>
        </div>
      )}

      {/* Bulut Sohbet Yedeklemesi & Senkronizasyon Card */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-md space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${
              syncStatus?.cloud_chat_backup_enabled
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-gray-100 text-gray-500'
            }`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-gray-900">Bulut Sohbet Yedeklemesi</h4>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md ${
                  syncStatus?.cloud_chat_backup_enabled
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-200 text-gray-700'
                }`}>
                  {syncStatus?.cloud_chat_backup_enabled ? 'Aktif' : 'Kapalı'}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {syncStatus?.cloud_chat_backup_enabled
                  ? 'Sohbet mesajları ve medya buluta artımlı olarak yedekleniyor.'
                  : 'Sohbet verileri yalnızca cihazınızın yerel diskinde saklanıyor (Offline-First).'}
              </p>
            </div>
          </div>

          {/* Admin Toggle Switch */}
          {isAdmin && (
            <button
              type="button"
              disabled={isUpdatingBackup}
              onClick={() => handleToggleCloudBackup(!syncStatus?.cloud_chat_backup_enabled)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                syncStatus?.cloud_chat_backup_enabled ? 'bg-emerald-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  syncStatus?.cloud_chat_backup_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          )}
        </div>

        {/* Backup Metrics Details */}
        <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Son Yedekleme</span>
            <span className="font-extrabold text-gray-800 text-[11px]">
              {syncStatus?.last_chat_backup_at
                ? format(new Date(syncStatus.last_chat_backup_at), 'd MMM yyyy, HH:mm', { locale: tr })
                : 'Henüz yapılmadı'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Bulut Yedek Boyutu</span>
            <span className="font-extrabold text-emerald-700 text-[11px]">
              {syncStatus?.chat_backup_size_bytes
                ? `${(syncStatus.chat_backup_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                : '0 MB'}{' '}
              <span className="text-gray-400 font-normal text-[10px]">
                ({syncStatus?.chat_backup_message_count || 0} mesaj)
              </span>
            </span>
          </div>
        </div>

        {/* Manual Actions */}
        <div className="flex gap-2 pt-1">
          {syncStatus?.cloud_chat_backup_enabled && (
            <button
              type="button"
              disabled={isManualBackupRunning}
              onClick={handleManualBackupNow}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isManualBackupRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudUpload className="w-3.5 h-3.5 text-family-600" />
              )}
              <span>Şimdi Yedekle</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRestoreModal(true)}
            className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-100"
          >
            <CloudDownload className="w-3.5 h-3.5 text-indigo-600" />
            <span>Sohbeti Geri Yükle</span>
          </button>
        </div>
      </div>

      {/* İzinler & Bildirim Yönetimi Card */}
      <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-md space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900">İzinler & Bildirim Durumu</h4>
              <p className="text-[10px] text-gray-500">Bildirim, ses, kamera ve alarm izinlerini inceleyin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPermissionsModal(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            Yönet
          </button>
        </div>
      </div>

      {/* Web APK Download Banner */}
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

      {/* Modal: Confirm Kick Member */}
      {memberToKick && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-gray-900">Üyeyi Gruptan Çıkar</h4>
              <button onClick={() => setMemberToKick(null)} className="p-1 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>{memberToKick.name}</strong> adlı üyeyi aile grubundan çıkarmak istediğinize emin misiniz?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMemberToKick(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isKicking}
                onClick={handleKickMember}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                {isKicking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gruptan Çıkar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Leave Family */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-amber-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-gray-900">Aileden Ayrılma Onayı</h4>
              <button onClick={() => setShowLeaveModal(false)} className="p-1 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>{currentFamily?.name}</strong> grubundan ayrılmak istediğinize emin misiniz? Dilediğiniz zaman katılım kodu ile tekrar katılabilirsiniz.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isLeaving}
                onClick={handleLeaveFamily}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                {isLeaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ayrıl'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Permanent Group Deletion (Creator Only) */}
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

      {/* Permission Assistant Modal */}
      {showPermissionsModal && (
        <PermissionAssistantModal
          forceOpen={true}
          onClose={() => setShowPermissionsModal(false)}
        />
      )}

      {/* Cloud Restore Modal */}
      {showRestoreModal && currentFamily && (
        <CloudRestorePromptModal
          familyId={currentFamily.id}
          familyName={currentFamily.name}
          onFinished={async (restored) => {
            setShowRestoreModal(false);
            if (restored) {
              const updated = await syncService.getSyncStatus();
              if (updated) setSyncStatus(updated);
            }
          }}
        />
      )}
    </div>
  );
};
