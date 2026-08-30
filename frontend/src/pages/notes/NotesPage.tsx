import React, { useState, useEffect } from 'react';
import {
  StickyNote,
  Plus,
  Trash2,
  Lock,
  Globe,
  Search,
  X,
  Edit2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Note } from '../../types';
import { api } from '../../services/api';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-900' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900' },
};

export const NotesPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modal / Editor State
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [color, setColor] = useState('amber');
  const [isSaving, setIsSaving] = useState(false);

  const fetchNotes = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<Note[]>('/notes/');
      setNotes(res.data);
    } catch (err) {
      console.error('Notes fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [currentFamily]);

  const openCreateModal = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setIsPrivate(false);
    setColor('amber');
    setShowModal(true);
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsPrivate(note.is_private);
    setColor(note.color || 'amber');
    setShowModal(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isSaving) return;

    setIsSaving(true);
    try {
      if (editingNote) {
        const res = await api.patch<Note>(`/notes/${editingNote.id}`, {
          title: title.trim(),
          content: content.trim(),
          is_private: isPrivate,
          color,
        });
        setNotes((prev) => prev.map((n) => (n.id === editingNote.id ? res.data : n)));
      } else {
        const res = await api.post<Note>('/notes/', {
          title: title.trim(),
          content: content.trim(),
          is_private: isPrivate,
          color,
        });
        setNotes((prev) => [res.data, ...prev]);
      }
      setShowModal(false);
    } catch (err: any) {
      alert('Not kaydedilemedi: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      alert('Not silinemedi: ' + err.message);
    }
  };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === 'public') return !note.is_private;
    if (filterType === 'private') return note.is_private;
    return true;
  });

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Aile Notları 📝</h2>
          <p className="text-xs text-gray-500">Ortak bilgiler ve özel notlarınız</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Not</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Notlarda ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'all' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Tümü ({notes.length})
          </button>
          <button
            onClick={() => setFilterType('public')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'public' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Ortak ({notes.filter((n) => !n.is_private).length})
          </button>
          <button
            onClick={() => setFilterType('private')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterType === 'private' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Gizli 🔒 ({notes.filter((n) => n.is_private).length})
          </button>
        </div>
      </div>

      {/* Notes Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <StickyNote className="w-12 h-12 text-sky-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Not bulunamadı</h3>
          <p className="text-xs text-gray-500 mt-1">Önemli şifreler, tarifler veya notlar ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const style = COLOR_MAP[note.color] || COLOR_MAP.amber;
            return (
              <div
                key={note.id}
                onClick={() => openEditModal(note)}
                className={`${style.bg} ${style.border} border rounded-3xl p-4 shadow-sm hover:shadow-md active:scale-98 transition cursor-pointer space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {note.is_private ? (
                      <span className="p-1 bg-white/80 rounded-lg text-rose-600 shadow-2xs">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 bg-white/80 rounded-lg text-sky-600 shadow-2xs">
                        <Globe className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <h3 className={`text-base font-bold ${style.text} truncate max-w-[200px]`}>
                      {note.title}
                    </h3>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-4 leading-relaxed font-normal">
                  {note.content}
                </p>

                <div className="flex items-center justify-between pt-1 text-[10px] text-gray-400 border-t border-black/5">
                  <span>{note.author_name}</span>
                  <span>{format(new Date(note.updated_at), 'd MMM yyyy', { locale: tr })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Note Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {editingNote ? 'Notu Düzenle' : 'Yeni Not Ekle'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Başlık (Örn: Wi-Fi Şifresi)"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Not içeriğini buraya yazın..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              {/* Color Selector */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Not Rengi
                </label>
                <div className="flex gap-2">
                  {Object.keys(COLOR_MAP).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${COLOR_MAP[c].bg} ${
                        color === c ? 'border-gray-900 scale-110' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Private Checkbox */}
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded-md focus:ring-sky-500"
                />
                <span>Sadece ben görebileyim (Kişisel Not) 🔒</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1 shadow-md"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
