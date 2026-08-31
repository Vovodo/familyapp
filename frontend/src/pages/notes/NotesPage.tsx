import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Lock,
  Globe,
  Trash2,
  X,
  Loader2,
  Palette,
  Check,
  StickyNote,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Note } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localNotesStorage } from '../../services/localNotesStorage';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

// Google Keep-inspired pastel palette
const KEEP_COLORS: Record<
  string,
  { name: string; bg: string; border: string; text: string; hex: string }
> = {
  amber: { name: 'Sarı', bg: 'bg-[#feefc3]', border: 'border-[#fde293]', text: 'text-amber-950', hex: '#feefc3' },
  emerald: { name: 'Yeşil', bg: 'bg-[#ccff90]', border: 'border-[#b4f570]', text: 'text-emerald-950', hex: '#ccff90' },
  sky: { name: 'Mavi', bg: 'bg-[#cbf0f8]', border: 'border-[#aee7f4]', text: 'text-sky-950', hex: '#cbf0f8' },
  rose: { name: 'Pembe', bg: 'bg-[#fdcfe8]', border: 'border-[#fbb8db]', text: 'text-rose-950', hex: '#fdcfe8' },
  purple: { name: 'Mor', bg: 'bg-[#d7aefb]', border: 'border-[#c58af9]', text: 'text-purple-950', hex: '#d7aefb' },
  orange: { name: 'Turuncu', bg: 'bg-[#ffe0b2]', border: 'border-[#ffcc80]', text: 'text-orange-950', hex: '#ffe0b2' },
  white: { name: 'Beyaz', bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-900', hex: '#ffffff' },
};

export const NotesPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Keep Quick Note Input State (Expanding on top)
  const [isQuickExpanded, setIsQuickExpanded] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickContent, setQuickContent] = useState('');
  const [quickColor, setQuickColor] = useState('white');
  const [quickIsPrivate, setQuickIsPrivate] = useState(false);
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const quickBoxRef = useRef<HTMLDivElement>(null);

  // Keep Full Note Edit Modal State
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('white');
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 1. Initial 0ms Load + Quiet Background Sync with Supabase Cloud
  useEffect(() => {
    if (!currentFamily) return;

    // A. 0ms Instant Local Cache
    const cached = localNotesStorage.getNotes(currentFamily.id);
    if (cached && cached.length > 0) {
      setNotes(cached);
      setIsLoading(false);
    }

    // B. Silent Background Sync with Supabase / PostgreSQL
    api.get<Note[]>('/notes/')
      .then((res) => {
        const merged = localNotesStorage.mergeNotes(currentFamily.id, res.data);
        setNotes(merged);
      })
      .catch((err) => {
        console.warn('[Notes] Quiet sync warning:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFamily?.id]);

  // 2. Realtime WebSocket Listener for Multi-Device Silent Sync
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

  // 3. Quick Note Save (Local-First + Quiet Supabase Post)
  const handleSaveQuickNote = async () => {
    if (!quickTitle.trim() && !quickContent.trim()) {
      setIsQuickExpanded(false);
      return;
    }
    if (!currentFamily || !user) return;

    const finalTitle = quickTitle.trim() || 'Başlıksız Not';
    const finalContent = quickContent.trim();
    const finalColor = quickColor;
    const finalPrivate = quickIsPrivate;

    // Reset quick input
    setQuickTitle('');
    setQuickContent('');
    setQuickColor('white');
    setQuickIsPrivate(false);
    setIsQuickExpanded(false);

    const tempId = `temp-note-${Date.now()}`;
    const optimisticNote: Note = {
      id: tempId,
      family_id: currentFamily.id,
      author_id: user.id,
      title: finalTitle,
      content: finalContent,
      color: finalColor,
      is_private: finalPrivate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_name: user.full_name,
    };

    // A. 0ms Local Save
    setNotes((prev) => {
      const next = [optimisticNote, ...prev];
      localNotesStorage.saveNotes(currentFamily.id, next);
      return next;
    });

    // B. Quiet Supabase Cloud Persistence
    try {
      setIsSavingQuick(true);
      const res = await api.post<Note>('/notes/', {
        title: finalTitle,
        content: finalContent,
        color: finalColor,
        is_private: finalPrivate,
      });

      setNotes((prev) => {
        const next = prev.map((n) => (n.id === tempId ? { ...res.data, author_name: user.full_name } : n));
        localNotesStorage.saveNotes(currentFamily.id, next);
        return next;
      });
    } catch (err: any) {
      console.error('Quick note cloud save failed:', err);
    } finally {
      setIsSavingQuick(false);
    }
  };

  // 4. Edit Note Modal Open
  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditColor(note.color || 'white');
    setEditIsPrivate(note.is_private);
  };

  // 5. Update Note (Local-First + Quiet Supabase Patch)
  const handleUpdateNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingNote || !currentFamily || !user) return;

    const finalTitle = editTitle.trim() || 'Başlıksız Not';
    const finalContent = editContent.trim();
    const updatedNote: Note = {
      ...editingNote,
      title: finalTitle,
      content: finalContent,
      color: editColor,
      is_private: editIsPrivate,
      updated_at: new Date().toISOString(),
    };

    setEditingNote(null);

    // A. 0ms Local Save
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === editingNote.id ? updatedNote : n));
      localNotesStorage.saveNotes(currentFamily.id, next);
      return next;
    });

    // B. Quiet Supabase Cloud Update
    try {
      setIsSavingEdit(true);
      await api.patch<Note>(`/notes/${editingNote.id}`, {
        title: finalTitle,
        content: finalContent,
        color: editColor,
        is_private: editIsPrivate,
      });
    } catch (err: any) {
      console.error('Note update cloud patch failed:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 6. Delete Note (Local-First + Quiet Supabase Delete)
  const handleDeleteNote = async (noteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentFamily) return;

    if (editingNote?.id === noteId) {
      setEditingNote(null);
    }

    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      localNotesStorage.saveNotes(currentFamily.id, next);
      return next;
    });

    try {
      await api.delete(`/notes/${noteId}`);
    } catch (err: any) {
      console.error('Note delete failed:', err);
    }
  };

  // Filter notes
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
    <div className="w-full max-w-full px-3 py-3 space-y-3.5 mx-auto overflow-x-hidden min-h-[calc(100dvh-5rem)]">
      {/* 1. Google Keep Style Pill Search Header */}
      <div className="bg-white rounded-full px-4 py-2.5 shadow-sm border border-gray-200/80 flex items-center gap-2.5 transition focus-within:shadow-md focus-within:border-gray-300">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Notlarınızda arayın..."
          className="w-full text-xs sm:text-sm bg-transparent focus:outline-none text-gray-800 placeholder-gray-400"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 cursor-pointer ${
            filterType === 'all'
              ? 'bg-gray-900 text-white shadow-2xs'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tümü ({notes.length})
        </button>
        <button
          onClick={() => setFilterType('public')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
            filterType === 'public'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Globe className="w-3 h-3" />
          <span>Ortak ({notes.filter((n) => !n.is_private).length})</span>
        </button>
        <button
          onClick={() => setFilterType('private')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
            filterType === 'private'
              ? 'bg-purple-700 text-white shadow-2xs'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Lock className="w-3 h-3" />
          <span>Gizli ({notes.filter((n) => n.is_private).length})</span>
        </button>
      </div>

      {/* 2. Google Keep "Not alın..." Quick Expanding Creator Card */}
      <div
        ref={quickBoxRef}
        className={`rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden ${
          KEEP_COLORS[quickColor]?.bg || 'bg-white'
        } ${KEEP_COLORS[quickColor]?.border || 'border-gray-200'}`}
      >
        {!isQuickExpanded ? (
          <div
            onClick={() => setIsQuickExpanded(true)}
            className="px-4 py-3 cursor-text flex items-center justify-between text-gray-500 hover:text-gray-700"
          >
            <span className="text-xs sm:text-sm font-medium">Not alın...</span>
            <div className="flex items-center gap-2 text-gray-400">
              <StickyNote className="w-4 h-4" />
            </div>
          </div>
        ) : (
          <div className="p-3.5 space-y-2.5 animate-in fade-in duration-150">
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Başlık"
              className="w-full text-sm font-bold bg-transparent focus:outline-none placeholder-gray-400 text-gray-900"
              autoFocus
            />

            <textarea
              rows={3}
              value={quickContent}
              onChange={(e) => setQuickContent(e.target.value)}
              placeholder="Not alın..."
              className="w-full text-xs sm:text-sm bg-transparent focus:outline-none placeholder-gray-400 text-gray-800 resize-none leading-relaxed"
            />

            {/* Bottom Actions Bar in Quick Creator */}
            <div className="flex items-center justify-between pt-2 border-t border-black/5 flex-wrap gap-2">
              {/* Color Palette Selector */}
              <div className="flex items-center gap-1.5">
                {Object.keys(KEEP_COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setQuickColor(c)}
                    className={`w-5 h-5 rounded-full border transition cursor-pointer flex items-center justify-center ${
                      KEEP_COLORS[c].bg
                    } ${quickColor === c ? 'border-gray-900 scale-110 shadow-2xs' : 'border-gray-300'}`}
                    title={KEEP_COLORS[c].name}
                  >
                    {quickColor === c && <Check className="w-3 h-3 text-gray-800" />}
                  </button>
                ))}

                {/* Privacy Lock Toggle */}
                <button
                  type="button"
                  onClick={() => setQuickIsPrivate(!quickIsPrivate)}
                  className={`p-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-1 cursor-pointer ${
                    quickIsPrivate
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title={quickIsPrivate ? 'Gizli Not (Sadece siz)' : 'Ortak Not'}
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Close & Save Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickTitle('');
                    setQuickContent('');
                    setIsQuickExpanded(false);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 rounded-lg cursor-pointer"
                >
                  Vazgeç
                </button>

                <button
                  type="button"
                  onClick={handleSaveQuickNote}
                  disabled={!quickTitle.trim() && !quickContent.trim()}
                  className="px-3.5 py-1.5 bg-gray-900 hover:bg-black active:scale-95 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Google Keep 2-Column Staggered Masonry Layout */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 select-none">
          <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center mx-auto mb-2 shadow-xs border border-gray-100">
            <StickyNote className="w-8 h-8 text-amber-400" />
          </div>
          <p className="text-sm font-bold text-gray-700">Henüz not yok</p>
          <p className="text-xs text-gray-400 mt-1">
            Yukarıdaki "Not alın..." alanına dokunarak ilk notunuzu ekleyin.
          </p>
        </div>
      ) : (
        <div className="columns-2 gap-2.5 space-y-2.5 w-full">
          {filteredNotes.map((note) => {
            const colorConfig = KEEP_COLORS[note.color] || KEEP_COLORS.white;
            return (
              <div
                key={note.id}
                onClick={() => openEditModal(note)}
                className={`break-inside-avoid rounded-2xl p-3 border shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer space-y-1.5 active:scale-[0.99] select-none ${
                  colorConfig.bg
                } ${colorConfig.border}`}
              >
                {/* Note Title & Header */}
                <div className="flex items-start justify-between gap-1.5">
                  <h3 className={`text-xs sm:text-sm font-bold ${colorConfig.text} leading-snug line-clamp-2`}>
                    {note.title}
                  </h3>

                  {note.is_private && (
                    <span className="p-0.5 rounded text-purple-700 flex-shrink-0" title="Gizli Not">
                      <Lock className="w-3 h-3" />
                    </span>
                  )}
                </div>

                {/* Note Body Text */}
                {note.content && (
                  <p className="text-[11px] sm:text-xs text-gray-800 whitespace-pre-wrap line-clamp-6 leading-relaxed font-normal break-words">
                    {note.content}
                  </p>
                )}

                {/* Card Footer: Author & Date */}
                <div className="flex items-center justify-between pt-1.5 text-[9px] sm:text-[10px] text-gray-500/80 border-t border-black/5">
                  <span className="truncate max-w-[65px] font-medium">
                    {note.author_name?.split(' ')[0] || 'Aile'}
                  </span>
                  <span>{format(new Date(note.updated_at), 'd MMM', { locale: tr })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Google Keep Full Note Edit & Detail Modal */}
      {editingNote && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => handleUpdateNote()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`rounded-3xl w-full max-w-md p-4 sm:p-5 space-y-3 shadow-2xl border transition-all animate-in fade-in zoom-in-95 duration-150 ${
              KEEP_COLORS[editColor]?.bg || 'bg-white'
            } ${KEEP_COLORS[editColor]?.border || 'border-gray-200'}`}
          >
            {/* Title Input */}
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Başlık"
                className="w-full text-base font-black bg-transparent focus:outline-none placeholder-gray-400 text-gray-900"
              />

              <button
                type="button"
                onClick={() => handleUpdateNote()}
                className="p-1 rounded-full hover:bg-black/5 text-gray-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Textarea */}
            <textarea
              rows={8}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Not alın..."
              className="w-full text-xs sm:text-sm bg-transparent focus:outline-none placeholder-gray-400 text-gray-800 resize-none leading-relaxed"
              autoFocus
            />

            {/* Note Editor Bottom Toolbar */}
            <div className="flex items-center justify-between pt-3 border-t border-black/10 flex-wrap gap-2">
              {/* Color Selector */}
              <div className="flex items-center gap-1.5">
                {Object.keys(KEEP_COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className={`w-6 h-6 rounded-full border transition cursor-pointer flex items-center justify-center ${
                      KEEP_COLORS[c].bg
                    } ${editColor === c ? 'border-gray-900 scale-110 shadow-2xs' : 'border-gray-300'}`}
                    title={KEEP_COLORS[c].name}
                  >
                    {editColor === c && <Check className="w-3.5 h-3.5 text-gray-800" />}
                  </button>
                ))}

                {/* Privacy Lock Toggle */}
                <button
                  type="button"
                  onClick={() => setEditIsPrivate(!editIsPrivate)}
                  className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ml-1 cursor-pointer ${
                    editIsPrivate
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title={editIsPrivate ? 'Gizli Not (Sadece siz)' : 'Ortak Not'}
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleDeleteNote(editingNote.id, e)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-xl transition cursor-pointer"
                  title="Notu Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateNote()}
                  className="px-4 py-2 bg-gray-900 hover:bg-black active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
