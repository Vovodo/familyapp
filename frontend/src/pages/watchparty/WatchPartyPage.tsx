import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Users, Play } from 'lucide-react';
import { Logo } from '../../components/branding/Logo';
import { useFamily } from '../../contexts/FamilyContext';
import { api } from '../../services/api';
import { WatchRoomListItem } from '../../types';
import { extractYoutubeVideoId } from '../../utils/youtubeUrl';

export const WatchPartyPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentFamily } = useFamily();
  const [rooms, setRooms] = useState<WatchRoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadRooms = async () => {
    try {
      const res = await api.get<WatchRoomListItem[]>('/watch-party/rooms');
      setRooms(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail;
      setError(detail || 'Odalar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentFamily?.id) return;
    void loadRooms();
    const timer = window.setInterval(() => {
      void loadRooms();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [currentFamily?.id]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (videoUrl.trim() && !extractYoutubeVideoId(videoUrl)) {
      setError('Geçerli bir YouTube bağlantısı girin.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/watch-party/rooms', {
        title: title.trim() || undefined,
        video_url: videoUrl.trim() || undefined,
      });
      navigate(`/watch-party/${res.data.room_id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || 'Oda oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 w-full max-w-2xl mx-auto space-y-4">
      <div className="theme-surface rounded-3xl p-5 border theme-border">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-violet-600">
          <Logo size="xs" />
          <span>Seyir Partisi</span>
        </div>
        <h1 className="text-xl font-black theme-text-primary mt-1">Aileyle aynı anda izleyin</h1>
        <p className="text-xs theme-text-secondary mt-1 leading-relaxed">
          Bir oda açın, YouTube bağlantısını ekleyin. Oynatma herkesle senkron gider; yanında canlı yorumlaşın.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowCreate((v) => !v)}
        className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
      >
        <Plus className="w-4 h-4" />
        Yeni seyir odası
      </button>

      {showCreate && (
        <form onSubmit={handleCreate} className="theme-surface rounded-3xl p-4 border theme-border space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Oda adı (ör. Cuma filmi)"
            maxLength={120}
            className="w-full px-3 py-2.5 rounded-2xl bg-violet-50/50 border border-violet-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="YouTube bağlantısı (isteğe bağlı)"
            className="w-full px-3 py-2.5 rounded-2xl bg-violet-50/50 border border-violet-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="w-full py-2.5 rounded-2xl bg-violet-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Odayı aç'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider theme-text-secondary px-1">Açık odalar</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-xs theme-text-secondary text-center py-6">Henüz açık oda yok. İlk odayı siz açın.</p>
        ) : (
          rooms.map((room) => (
            <button
              key={room.room_id}
              type="button"
              onClick={() => navigate(`/watch-party/${room.room_id}`)}
              className="w-full text-left p-4 rounded-3xl bg-violet-50/80 hover:bg-violet-100/80 border border-violet-100 cursor-pointer active:scale-98"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 fill-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm text-violet-950 truncate">{room.title}</div>
                  <div className="text-[11px] text-violet-800/80 truncate">
                    {room.video_title || (room.video_id ? 'YouTube videosu hazır' : 'Video bekleniyor')}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-violet-700">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {room.online_count} izleyici
                    </span>
                    {room.host_name && <span>· Ev sahibi {room.host_name}</span>}
                    <span>· {room.playback_state === 'playing' ? 'Oynuyor' : 'Duraklatıldı'}</span>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default WatchPartyPage;
