import { Reminder } from '../types';
import { isTempId } from './listSync';

const STORAGE_KEY = 'ailem_reminders_';

export const localRemindersStorage = {
  getReminders(familyId: string): Reminder[] {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}${familyId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveReminders(familyId: string, reminders: Reminder[]): void {
    try {
      localStorage.setItem(`${STORAGE_KEY}${familyId}`, JSON.stringify(reminders));
    } catch (err) {
      console.warn('[LocalRemindersStorage] save failed:', err);
    }
  },

  mergeReminders(familyId: string, serverReminders: Reminder[]): Reminder[] {
    const local = this.getReminders(familyId);
    const map = new Map<string, Reminder>();

    for (const r of local) {
      if (r?.id && !isTempId(r.id)) map.set(r.id, r);
    }

    for (const sr of serverReminders) {
      map.set(sr.id, sr);
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());

    this.saveReminders(familyId, merged);
    return merged;
  },
};
