import { ShoppingItem } from '../types';
import { isTempId } from './listSync';

const STORAGE_KEY = 'ailem_shopping_items_';

export const localShoppingStorage = {
  /**
   * Instantly retrieves cached shopping items.
   */
  getItems(familyId: string): ShoppingItem[] {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}${familyId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /**
   * Persists items to local storage.
   */
  saveItems(familyId: string, items: ShoppingItem[]): void {
    try {
      localStorage.setItem(`${STORAGE_KEY}${familyId}`, JSON.stringify(items));
    } catch (err) {
      console.warn('[LocalShoppingStorage] save failed:', err);
    }
  },

  /**
   * Reconciles server shopping items with local items safely.
   */
  mergeItems(familyId: string, serverItems: ShoppingItem[]): ShoppingItem[] {
    const local = this.getItems(familyId);
    const serverList = Array.isArray(serverItems) ? serverItems : [];
    const localList = Array.isArray(local) ? local : [];

    // Server is the source of truth. Only keep local temp items not yet confirmed by server.
    const pendingTemps = localList.filter(
      (item) => item?.id && isTempId(item.id) &&
        !serverList.some(
          (s) => s.title === item.title && s.quantity === item.quantity && s.category === item.category
        )
    );

    const itemMap = new Map<string, ShoppingItem>();
    for (const sItem of serverList) {
      if (sItem?.id) itemMap.set(sItem.id, sItem);
    }

    const merged = [...pendingTemps, ...Array.from(itemMap.values())];
    // Sort active first, then by created_at desc
    merged.sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return a.is_completed ? 1 : -1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    this.saveItems(familyId, merged);
    return merged;
  },
};
