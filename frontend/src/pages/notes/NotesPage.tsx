import React, { useState, useEffect } from 'react';
import {
  StickyNote,
  Plus,
  Trash2,
  Lock,
  Globe,
  Search,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Note } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localNotesStorage } from '../../services/localNotesStorage';
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

  // 1. 0ms Instant Load + Silent Background Sync
  useEffect(() => {
    if (!currentFamily) return;

    // A. 0ms Instant Cache
    const cached = localNotesStorage.getNotes(currentFamily.id);
    if (cached && cached.length > 0) {
      setNotes(cached);
      setIsLoading(false);
    }

    // B. Background Sync
    api.get<Note[]>('/notes/')
      .then((res) => {
        const merged = localNotesStorage.mergeNotes(currentFamily.id, res.data);
        setNotes(merged);
      })
      .catch((err) => {
        console.error('Notes sync error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFamily?.id]);

  // 2. Realtime Listener for Notes
  useEffect(() => {
    if (!currentFamily || !supabase) return;

    const channel = supabase
      .channel(`family-notes-${currentFamily.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `family_id=eq.${currentFamily.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNote = payload.new as Note;
            setNotes((prev) => {
              const next = [newNote, ...prev.filter((n) => n.id !== newNote.id)];
              localNotesStorage.saveNotes(currentFamily.id, next);
              return next;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Note;
            setNotes((prev) => {
              const next = prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n));
              localNotesStorage.saveNotes(currentFamily.id, next);
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setNotes((prev) => {
              const next = prev.filter((n) => n.id !== deletedId);
              localNotesStorage.saveNotes(currentFamily.id, next);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id]);

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
    if (!title.trim() || !content.trim() || isSaving || !currentFamily) return;

    setIsSaving(true);
    try {
      if (editingNote) {
        const res = await api.patch<Note>(`/notes/${editingNote.id}`, {
          title: title.trim(),
          content: content.trim(),
          is_private: isPrivate,
          color,
        });
        setNotes((prev) => {
          const next = prev.map((n) => (n.id === editingNote.id ? res.data : n));
          localNotesStorage.saveNotes(currentFamily.id, next);
          return next;
        });
      } else {
        const res = await api.post<Note>('/notes/', {
          title: title.trim(),
          content: content.trim(),
          is_private: isPrivate,
          color,
        });
        setNotes((prev) => {
          const next = [res.data, ...prev];
          localNotesStorage.saveNotes(currentFamily.id, next);
          return next;
        });
      }
      setShowModal(false);
    } catch (err: any) {
      alert('Not kaydedilemedi: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?') || !currentFamily) return;
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      localNotesStorage.saveNotes(currentFamily.id, next);
      return next;
    });
    try {
      await api.delete(`/notes/${noteId}`);
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
    <div className="w-full max-w-full px-3 py-3 space-y-3.5 mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-gray-900 truncate">Aile Notları 📝</h2>
          <p className="text-xs text-gray-500 truncate">Ortak bilgiler ve özel notlarınız</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm flex-shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Not</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2 w-full">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Notlarda ara..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
          />
        </div>

        {/* 3-Column Responsive Filters */}
        <div className="grid grid-cols-3 gap-1.5 w-full">
          <button
            onClick={() => setFilterType('all')}
            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition text-center truncate ${
              filterType === 'all' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Tümü ({notes.length})
          </button>
          <button
            onClick={() => setFilterType('public')}
            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition text-center truncate ${
              filterType === 'public' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            Ortak ({notes.filter((n) => !n.is_private).length})
          </button>
          <button
            onClick={() => setFilterType('private')}
            className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition text-center truncate ${
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
        <div className="text-center py-10 bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs">
          <StickyNote className="w-10 h-10 text-sky-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Not bulunamadı</h3>
          <p className="text-xs text-gray-500 mt-1">Önemli şifreler, tarifler veya notlar ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-2.5 w-full">
          {filteredNotes.map((note) => {
            const style = COLOR_MAP[note.color] || COLOR_MAP.amber;
            return (
              <div
                key={note.id}
                onClick={() => openEditModal(note)}
                className={`${style.bg} ${style.border} border rounded-2xl p-3.5 shadow-2xs hover:shadow-xs active:scale-98 transition cursor-pointer space-y-1.5 w-full`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {note.is_private ? (
                      <span className="p-1 bg-white/80 rounded-lg text-rose-600 flex-shrink-0">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 bg-white/80 rounded-lg text-sky-600 flex-shrink-0">
                        <Globe className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <h3 className={`text-sm font-bold ${style.text} truncate`}>
                      {note.title}
                    </h3>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 transition flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-3 leading-relaxed font-normal break-words">
                  {note.content}
                </p>

                <div className="flex items-center justify-between pt-1 text-[10px] text-gray-400 border-t border-black/5">
                  <span className="truncate">{note.author_name}</span>
                  <span>{format(new Date(note.updated_at), 'd MMM yyyy', { locale: tr })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3.5">
          <div className="bg-white rounded-3xl w-full max-w-sm p-4 space-y-3.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {editingNote ? 'Notu Düzenle' : 'Yeni Aile Notu'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Başlık</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Wi-Fi Şifresi, Doğalgaz Vanası"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">İçerik</label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Notunuzu buraya yazın..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Renk</label>
                <div className="flex gap-2">
                  {Object.keys(COLOR_MAP).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        COLOR_MAP[c].bg
                      } ${color === c ? 'border-sky-600 scale-110' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Privacy Toggle */}
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                <div>
                  <div className="text-xs font-bold text-gray-800">Gizli Not</div>
                  <div className="text-[10px] text-gray-500">Sadece siz görebilirsiniz</div>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded-md focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving || !title.trim() || !content.trim()}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-sky-600/20 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{editingNote ? 'Güncelle' : 'Kaydet'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
