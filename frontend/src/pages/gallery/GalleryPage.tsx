import React, { useState, useEffect, useRef } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Camera, Plus, Trash2, X, Calendar, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { MediaItem } from '../../types';
import { api } from '../../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

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

  const fetchGallery = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<MediaItem[]>('/media/', {
        params: { limit: 50 },
      });
      setPhotos(res.data);
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
    } catch (err: any) {
      alert('Fotoğraf silinemedi: ' + err.message);
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
          className="px-4 py-2.5 bg-family-600 hover:bg-family-700 active:scale-95 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-family-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Fotoğraf Ekle</span>
        </button>
      </div>

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
            className="mt-4 px-5 py-3 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md"
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
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Fotoğrafı Paylaş</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewUrl && (
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gray-100 mb-3">
                <img src={previewUrl} alt="Önizleme" className="w-full h-full object-cover" />
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Bir açıklama veya not yazın..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-family-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 py-3 bg-family-600 hover:bg-family-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1 shadow-md"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Albümde Paylaş'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col justify-between p-4 backdrop-blur-md">
          <div className="flex items-center justify-between text-white pt-2">
            <div>
              <div className="text-sm font-bold">{selectedPhoto.uploader_name}</div>
              <div className="text-[11px] text-gray-400">
                {format(new Date(selectedPhoto.created_at), 'd MMMM yyyy, HH:mm', { locale: tr })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(selectedPhoto.uploader_id === user?.id || activeMember?.role === 'admin') && (
                <button
                  onClick={() => handleDeletePhoto(selectedPhoto.id)}
                  className="p-2.5 bg-white/10 hover:bg-red-600/80 rounded-2xl text-white transition"
                  title="Fotoğrafı Sil"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-4">
            <img
              src={selectedPhoto.public_url}
              alt={selectedPhoto.caption || 'Fotoğraf'}
              className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />
          </div>

          {selectedPhoto.caption ? (
            <div className="bg-black/40 text-white p-4 rounded-2xl text-center text-sm font-medium backdrop-blur-xs">
              {selectedPhoto.caption}
            </div>
          ) : (
            <div />
          )}
        </div>
      )}
    </div>
  );
};
