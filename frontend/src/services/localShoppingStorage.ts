import { ShoppingItem } from '../types';
import { isTempId } from './listSync';

const STORAGE_KEY = 'ailem_shopping_items_';

export const localShoppingStorage = {
  getItems(familyId: string): ShoppingItem[] {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}${familyId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveItems(familyId: string, items: ShoppingItem[]): void {
    try {
      const real = Array.isArray(items) ? items.filter((item) => item?.id) : [];
      localStorage.setItem(`${STORAGE_KEY}${familyId}`, JSON.stringify(real));
    } catch (err) {
      console.warn('[LocalShoppingStorage] save failed:', err);
    }
  },
};
