import { Note } from '../types';

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
    const map = new Map<string, Note>();

    for (const n of local) {
      map.set(n.id, n);
    }

    for (const sn of serverNotes) {
      map.set(sn.id, sn);
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    this.saveNotes(familyId, merged);
    return merged;
  },
};
