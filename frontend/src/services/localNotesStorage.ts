import { Note } from '../types';
import { isTempId } from './listSync';

const STORAGE_KEY = 'ailem_notes_';

export const localNotesStorage = {
  getNotes(familyId: string): Note[] {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}${familyId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveNotes(familyId: string, notes: Note[]): void {
    try {
      localStorage.setItem(`${STORAGE_KEY}${familyId}`, JSON.stringify(notes));
    } catch (err) {
      console.warn('[LocalNotesStorage] save failed:', err);
    }
  },

  mergeNotes(familyId: string, serverNotes: Note[]): Note[] {
    const local = this.getNotes(familyId);
    const serverList = Array.isArray(serverNotes) ? serverNotes : [];
    const localList = Array.isArray(local) ? local : [];

    // Server is the source of truth. Keep only local temp items not yet confirmed.
    const pendingTemps = localList.filter(
      (n) => n?.id && isTempId(n.id) &&
        !serverList.some((s) => s.title === n.title && s.content === n.content)
    );

    const map = new Map<string, Note>();
    for (const sn of serverList) {
      map.set(sn.id, sn);
    }

    const merged = [...pendingTemps, ...Array.from(map.values())];
    merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    this.saveNotes(familyId, merged);
    return merged;
  },
};
