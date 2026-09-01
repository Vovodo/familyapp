import React, { useState, useEffect, useRef } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  Camera,
  Plus,
  Trash2,
  X,
  Loader2,
  Image as ImageIcon,
  Cloud,
  HardDrive,
  AlertTriangle,
  Mic,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { MediaItem } from '../../types';
import { api } from '../../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  localMediaVault,
  VaultFileInfo,
  LocalVaultStorageStats,
} from '../../services/localMediaVault';

interface StorageStats {
  used_bytes: number;
  used_mb: number;
  quota_mb: number;
  usage_percent: number;
  photo_count: number;
  status: 'normal' | 'warning';
  provider: string;
}

type GalleryTab = 'photos' | 'audio' | 'storage';

export const GalleryPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();

  const [activeTab, setActiveTab] = useState<GalleryTab>('photos');
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [audioFiles, setAudioFiles] = useState<VaultFileInfo[]>([]);
  const [localStats, setLocalStats] = useState<LocalVaultStorageStats | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Player State for Voice Archive
  const [playingAudioPath, setPlayingAudioPath] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Storage Stats & Clear All State
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchGallery = async () => {
    if (!currentFamily) return;
    try {
      const [res, statsRes] = await Promise.all([
        api.get<MediaItem[]>('/media/', { params: { limit: 100 } }),
        api.get<StorageStats>('/media/storage-stats').catch(() => null),
      ]);
      setPhotos(res.data);
      if (statsRes?.data) {
        setStorageStats(statsRes.data);
      }
    } catch (err) {
      console.error('Gallery fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalVaultData = async () => {
    try {
      const audios = await localMediaVault.listMediaFiles('audio');
      const stats = await localMediaVault.getStorageUsage();
      setAudioFiles(audios);
      setLocalStats(stats);
    } catch (err) {
      console.debug('Load local vault error:', err);
    }
  };

  useEffect(() => {
    fetchGallery();
    loadLocalVaultData();
  }, [currentFamily]);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowUploadModal(true);
  };

  const handleCapacitorCamera = async () => {
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
        handleFileChange(file);
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (caption.trim()) {
        formData.append('caption', caption.trim());
      }

      const res = await api.post<MediaItem>('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPhotos((prev) => [res.data, ...prev]);
      setShowUploadModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setCaption('');

      api.get<StorageStats>('/media/storage-stats').then((s) => setStorageStats(s.data)).catch(() => {});
      loadLocalVaultData();
      showNotice('Fotoğraf başarıyla paylaşıldı!');
    } catch (err: any) {
      alert('Yükleme hatası: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Bu fotoğrafı silmek istediğinizden emin misiniz?')) return;
    try {
      await api.delete(`/media/${photoId}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null);
      }
      api.get<StorageStats>('/media/storage-stats').then((s) => setStorageStats(s.data)).catch(() => {});
      loadLocalVaultData();
      showNotice('Fotoğraf silindi.');
    } catch (err: any) {
      alert('Fotoğraf silinemedi: ' + err.message);
    }
  };

  const handleClearAllPhotos = async () => {
    setIsClearingAll(true);
    try {
      await api.delete('/media/clear-all');
      setPhotos([]);
      setShowClearAllModal(false);
      api.get<StorageStats>('/media/storage-stats').then((s) => setStorageStats(s.data)).catch(() => {});
      loadLocalVaultData();
      showNotice('Tüm bulut görselleri temizlendi.');
    } catch (err: any) {
      alert('Temizleme hatası: ' + (err.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setIsClearingAll(false);
    }
  };

  // Audio Playback in Vault
  const handleTogglePlayAudio = (file: VaultFileInfo) => {
    if (playingAudioPath === file.path) {
      audioPlayerRef.current?.pause();
      setPlayingAudioPath(null);
    } else {
      setPlayingAudioPath(file.path);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = file.uri;
        audioPlayerRef.current.play().catch(() => {});
      }
    }
  };

  // Delete Individual Audio File to free storage
  const handleDeleteAudioFile = async (file: VaultFileInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${file.name}" ses kaydını cihazınızdan silip hafızayı rahatlatmak istiyor musunuz?`)) {
      return;
    }
    if (playingAudioPath === file.path) {
      audioPlayerRef.current?.pause();
      setPlayingAudioPath(null);
    }
    await localMediaVault.deleteMediaFile(file.name, 'audio');
    await loadLocalVaultData();
    showNotice('Ses kaydı cihazdan silindi.');
  };

  // Clear Local Storage Vault categories
  const handleClearLocalCategory = async (type: 'audio' | 'images' | 'all') => {
    const label =
      type === 'audio'
        ? 'tüm ses kayıtlarını'
        : type === 'images'
        ? 'tüm fotoğraf önbelleğini'
        : 'tüm yerel medya dosyalarını';

    if (
      !confirm(
        `Cihazınızdaki ${label} silerek telefon hafızasını rahatlatmak istediğinize emin misiniz?`
      )
    ) {
      return;
    }

    if (type === 'audio' || type === 'all') {
      audioPlayerRef.current?.pause();
      setPlayingAudioPath(null);
    }

    await localMediaVault.clearLocalVault(type);
    await loadLocalVaultData();
    showNotice(`${type === 'audio' ? 'Ses kayıtları' : 'Yerel medya'} başarıyla temizlendi.`);
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileChange(e.target.files[0]);
          }
        }}
      />

      {/* Hidden audio element for audio vault playback */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setPlayingAudioPath(null)}
        onPause={() => setPlayingAudioPath(null)}
      />

      {/* Action Toast Notice */}
      {actionNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Header action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <span>Fotoğraf & Anılar</span>
            <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
          </h2>
          <p className="text-xs text-gray-500">Aile fotoğrafları, ses arşivleri ve hafıza</p>
        </div>
        {activeTab === 'photos' && (
          <button
            onClick={handleCapacitorCamera}
            className="px-4 py-2.5 bg-family-600 hover:bg-family-700 active:scale-95 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-family-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Fotoğraf Ekle</span>
          </button>
        )}
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="flex p-1 bg-gray-100/90 rounded-2xl border border-gray-200/80 gap-1 text-xs font-extrabold">
        <button
          type="button"
          onClick={() => setActiveTab('photos')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'photos'
              ? 'bg-white text-family-700 shadow-xs ring-1 ring-black/5'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Fotoğraflar ({photos.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('audio');
            loadLocalVaultData();
          }}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'audio'
              ? 'bg-white text-family-700 shadow-xs ring-1 ring-black/5'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Sesler ({audioFiles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('storage');
            loadLocalVaultData();
          }}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'storage'
              ? 'bg-white text-family-700 shadow-xs ring-1 ring-black/5'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Hafıza & Temizlik</span>
        </button>
      </div>

      {/* TAB 1: PHOTOS VIEW */}
      {activeTab === 'photos' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Cloud Storage Quota Bar */}
          {storageStats && (
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <span>Bulut Depolama</span>
                      <span className="text-[10px] bg-sky-100 text-sky-700 font-extrabold px-1.5 py-0.2 rounded-md">
                        {storageStats.quota_mb} MB
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {storageStats.photo_count} fotoğraf • {storageStats.provider}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black text-gray-900">{storageStats.used_mb} MB</span>
                  <span className="text-[10px] text-gray-400 font-semibold"> / {storageStats.quota_mb} MB</span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    storageStats.usage_percent > 85
                      ? 'bg-rose-500'
                      : storageStats.usage_percent > 60
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-sky-500 to-family-600'
                  }`}
                  style={{ width: `${Math.max(2, Math.min(100, storageStats.usage_percent))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                <span>Kullanım: %{storageStats.usage_percent}</span>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowClearAllModal(true)}
                    className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Bulutu Temizle</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Gallery Grid */}
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-8 h-8 text-family-600 animate-spin" />
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl p-6 border border-gray-100 shadow-xs">
              <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-3">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Henüz fotoğraf yok</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                İlk aile fotoğrafını ekleyin ve anılarınızı güvenle saklamaya başlayın.
              </p>
              <button
                onClick={handleCapacitorCamera}
                className="mt-4 px-5 py-3 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md cursor-pointer"
              >
                Fotoğraf Yükle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 cursor-pointer group shadow-xs hover:shadow-md transition active:scale-95"
                >
                  <img
                    src={photo.thumbnail_url || photo.public_url}
                    alt={photo.caption || 'Aile Anısı'}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2">
                    <span className="text-white text-[10px] font-medium truncate">
                      {photo.uploader_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIO VAULT (SES KAYITLARI ARŞİVİ) */}
      {activeTab === 'audio' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>Cihazda Kayıtlı Ses Dosyaları</span>
            <button
              type="button"
              onClick={loadLocalVaultData}
              className="text-family-600 hover:text-family-700 font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Yenile</span>
            </button>
          </div>

          {audioFiles.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl p-6 border border-gray-100 shadow-xs">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-3">
                <Mic className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Henüz ses kaydı yok</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                Sohbet ekranından mikrofon ikonuna basarak kaydettiğiniz tüm sesler burada otomatik olarak arşivlenir.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {audioFiles.map((file) => {
                const isPlaying = playingAudioPath === file.path;
                return (
                  <div
                    key={file.path}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isPlaying
                        ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-300/30 shadow-xs'
                        : 'bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Play / Pause Action Button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePlayAudio(file)}
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition active:scale-90 cursor-pointer flex-shrink-0 ${
                          isPlaying
                            ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <h4 className="text-xs font-extrabold text-gray-900 truncate">
                          {file.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5 font-medium">
                          <span>{format(new Date(file.mtime), 'd MMM yyyy, HH:mm', { locale: tr })}</span>
                          <span>•</span>
                          <span className="font-bold text-amber-700">{formatFileSize(file.size)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Delete file button to free memory */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteAudioFile(file, e)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer flex-shrink-0"
                      title="Cihazdan Sil (Hafızayı Boşalt)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STORAGE & MEMORY MANAGEMENT (HAFIZA RAHATLATMA) */}
      {activeTab === 'storage' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Main Local Storage Card */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Cihaz Hafıza Kullanımı</h3>
                  <p className="text-[10px] text-indigo-200/80">Telefonunuzda tutulan yerel veriler</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg font-black text-emerald-400">
                  {localStats ? `${localStats.totalMb} MB` : '0 MB'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10 text-xs">
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5 space-y-1">
                <div className="text-[10px] text-indigo-200 flex items-center gap-1 font-bold">
                  <Mic className="w-3 h-3 text-amber-400" />
                  <span>Ses Kayıtları</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatFileSize(localStats?.audioBytes || 0)}
                </div>
                <div className="text-[10px] text-indigo-300">
                  {localStats?.audioCount || 0} adet ses dosyası
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-3 border border-white/5 space-y-1">
                <div className="text-[10px] text-indigo-200 flex items-center gap-1 font-bold">
                  <ImageIcon className="w-3 h-3 text-sky-400" />
                  <span>Fotoğraf Önbelleği</span>
                </div>
                <div className="text-sm font-black text-white">
                  {formatFileSize(localStats?.imageBytes || 0)}
                </div>
                <div className="text-[10px] text-indigo-300">
                  {localStats?.imageCount || 0} adet fotoğraf
                </div>
              </div>
            </div>
          </div>

          {/* Quick Cleanup Actions */}
          <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-3">
            <h4 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-family-600" />
              <span>Hafıza Rahatlatma Araçları</span>
            </h4>

            <div className="space-y-2">
              {/* Clear Audio Storage */}
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-100 flex items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-amber-900 flex items-center gap-1">
                    <Mic className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ses Kayıtlarını Temizle</span>
                  </h5>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Cihazdaki tüm ses kayıtlarını silerek hafıza açar ({formatFileSize(localStats?.audioBytes || 0)}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleClearLocalCategory('audio')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex-shrink-0 cursor-pointer"
                >
                  Boşalt
                </button>
              </div>

              {/* Clear Image Cache */}
              <div className="p-3 bg-sky-50/60 rounded-2xl border border-sky-100 flex items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-sky-900 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>Fotoğraf Önbelleğini Temizle</span>
                  </h5>
                  <p className="text-[10px] text-sky-700 mt-0.5">
                    İndirilen görsellerin yerel kopyalarını temizler ({formatFileSize(localStats?.imageBytes || 0)}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleClearLocalCategory('images')}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex-shrink-0 cursor-pointer"
                >
                  Temizle
                </button>
              </div>

              {/* Clear All Local Storage */}
              <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-100 flex items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-rose-900 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Tüm Yerel Medyayı Boşalt</span>
                  </h5>
                  <p className="text-[10px] text-rose-700 mt-0.5">
                    Tüm ses ve fotoğraf dosyalarını cihazdan kaldırır, maksimum depolama alanı kazandırır.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleClearLocalCategory('all')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex-shrink-0 cursor-pointer"
                >
                  Sıfırla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal with Caption */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Fotoğrafı Paylaş</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewUrl && (
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gray-100">
                <img src={previewUrl} alt="Önizleme" className="w-full h-full object-cover" />
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Bir anı notu ekleyin (Opsiyonel)"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Paylaş</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-gray-900">Tüm Görseller Silinsin mi?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Galerideki tüm aile fotoğrafları ve anıları kalıcı olarak silinecek ve depolama alanınız tamamen boşaltılacaktır. Bu işlem geri alınamaz.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={handleClearAllPhotos}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isClearingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Tümünü Sil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col justify-between p-4 backdrop-blur-xs">
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white">
            <div>
              <h4 className="text-sm font-bold">{selectedPhoto.uploader_name}</h4>
              <p className="text-[10px] text-gray-400">
                {format(new Date(selectedPhoto.created_at), 'd MMMM yyyy, HH:mm', { locale: tr })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(selectedPhoto.uploader_id === user?.id || activeMember?.role === 'admin') && (
                <button
                  onClick={() => handleDeletePhoto(selectedPhoto.id)}
                  className="p-2 bg-white/10 hover:bg-rose-600/80 rounded-full transition text-white cursor-pointer"
                  title="Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Photo */}
          <div className="flex-1 flex items-center justify-center my-4 overflow-hidden">
            <img
              src={selectedPhoto.public_url}
              alt={selectedPhoto.caption || 'Aile Fotoğrafı'}
              className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
            />
          </div>

          {/* Caption */}
          {selectedPhoto.caption && (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 text-white text-xs text-center">
              {selectedPhoto.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
