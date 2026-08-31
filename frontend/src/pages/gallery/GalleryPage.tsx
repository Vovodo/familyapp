import React, { useState, useEffect, useRef } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  Camera,
  Plus,
  Trash2,
  X,
  Calendar,
  Loader2,
  Image as ImageIcon,
  Cloud,
  HardDrive,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { MediaItem } from '../../types';
import { api } from '../../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface StorageStats {
  used_bytes: number;
  used_mb: number;
  quota_mb: number;
  usage_percent: number;
  photo_count: number;
  status: 'normal' | 'warning';
  provider: string;
}

export const GalleryPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily, activeMember } = useFamily();
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage Stats & Clear All State
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

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

  useEffect(() => {
    fetchGallery();
  }, [currentFamily]);

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

      // Refresh storage stats
      api.get<StorageStats>('/media/storage-stats').then((s) => setStorageStats(s.data)).catch(() => {});
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
    } catch (err: any) {
      alert('Temizleme hatası: ' + (err.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
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

      {/* Header action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Aile Anıları 📷</h2>
          <p className="text-xs text-gray-500">Paylaşılan özel aile fotoğrafları</p>
        </div>
        <button
          onClick={handleCapacitorCamera}
          className="px-4 py-2.5 bg-family-600 hover:bg-family-700 active:scale-95 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-family-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Fotoğraf Ekle</span>
        </button>
      </div>

      {/* Cloud & Local Storage Quota Bar */}
      {storageStats && (
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <span>Bulut Depolama Alanı</span>
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
                <span>Tüm Görselleri Temizle</span>
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
        <div className="text-center py-16 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
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
