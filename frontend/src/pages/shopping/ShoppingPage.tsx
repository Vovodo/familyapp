import React, { useState, useEffect } from 'react';
import {
  Check,
  Plus,
  Trash2,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { ShoppingItem } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';

const CATEGORIES = ['Market', 'Manav', 'Eczane', 'Kasap', 'Fırın', 'Ev'];

export const ShoppingPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('1 adet');
  const [category, setCategory] = useState('Market');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const fetchShoppingList = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<ShoppingItem[]>('/shopping/');
      setItems(res.data);
    } catch (err) {
      console.error('Shopping list fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShoppingList();

    if (!currentFamily || !supabase) return;

    // Realtime listener for shopping items
    const channel = supabase
      .channel(`family-shopping-${currentFamily.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `family_id=eq.${currentFamily.id}`,
        },
        () => {
          fetchShoppingList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemTitle = title.trim();
    if (!itemTitle || isAdding || !user || !currentFamily) return;

    const itemQty = quantity.trim() || '1 adet';
    setTitle('');
    setIsAdding(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticItem: ShoppingItem = {
      id: tempId,
      family_id: currentFamily.id,
      created_by: user.id,
      title: itemTitle,
      quantity: itemQty,
      category,
      is_completed: false,
      created_at: new Date().toISOString(),
      creator_name: user.full_name,
    };

    setItems((prev) => [optimisticItem, ...prev]);

    try {
      const res = await api.post<ShoppingItem>('/shopping/', {
        title: itemTitle,
        quantity: itemQty,
        category,
      });
      setItems((prev) => prev.map((i) => (i.id === tempId ? res.data : i)));
    } catch (err: any) {
      alert('Ürün eklenemedi: ' + err.message);
      setItems((prev) => prev.filter((i) => i.id !== tempId));
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (item: ShoppingItem) => {
    const nextState = !item.is_completed;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_completed: nextState } : i))
    );

    try {
      await api.patch(`/shopping/${item.id}`, { is_completed: nextState });
    } catch (err) {
      fetchShoppingList();
    }
  };

  const handleDelete = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await api.delete(`/shopping/${itemId}`);
    } catch (err) {
      fetchShoppingList();
    }
  };

  const handleClearCompleted = async () => {
    const completedIds = items.filter((i) => i.is_completed).map((i) => i.id);
    if (completedIds.length === 0) return;

    setItems((prev) => prev.filter((i) => !i.is_completed));

    try {
      await Promise.all(completedIds.map((id) => api.delete(`/shopping/${id}`)));
    } catch {
      fetchShoppingList();
    }
  };

  const activeItems = items.filter((i) => !i.is_completed);
  const completedItems = items.filter((i) => i.is_completed);

  return (
    <div className="w-full max-w-full px-3 py-3 space-y-3.5 mx-auto overflow-x-hidden">
      {/* Header with Title & Clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-1.5 truncate">
            <span>Alışveriş Listesi</span>
            <span className="text-emerald-600">🛒</span>
          </h2>
          <p className="text-xs text-gray-500 truncate">
            {activeItems.length > 0
              ? `${activeItems.length} alınacak ürün var`
              : 'Tüm ihtiyaçlar alındı! 🎉'}
          </p>
        </div>

        {completedItems.length > 0 && (
          <button
            onClick={handleClearCompleted}
            className="text-xs font-bold text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 transition flex items-center gap-1 flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Alınanları</span>
            <span>Sil</span>
          </button>
        )}
      </div>

      {/* Add Item Form Card */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 w-full">
        <form onSubmit={handleAddItem} className="space-y-2.5">
          <div className="flex gap-2 w-full">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ne alınacak? (Örn: Süt)"
              className="flex-1 min-w-0 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1 kg"
              className="w-20 px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-center focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition flex-shrink-0"
            />
          </div>

          {/* Fully Responsive 3x2 Grid for Categories (No Horizontal Scrolling) */}
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition text-center truncate ${
                  category === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!title.trim() || isAdding}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 transition"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Listeye Ekle</span>
          </button>
        </form>
      </div>

      {/* Shopping List Items */}
      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl p-5 border border-gray-100">
          <ShoppingBag className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Alışveriş listeniz boş</h3>
          <p className="text-xs text-gray-500 mt-1">Evin ihtiyaçlarını yukarıdan ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-2 w-full">
          {/* Active Items */}
          {activeItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleToggle(item)}
              className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs flex items-center justify-between gap-2.5 active:scale-98 transition cursor-pointer hover:border-emerald-200 w-full"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-500 flex items-center justify-center text-transparent hover:text-emerald-500 flex-shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">{item.title}</div>
                  <div className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-emerald-700">{item.quantity}</span>
                    <span>•</span>
                    <span className="bg-gray-100 px-1 rounded-sm">{item.category}</span>
                    <span>•</span>
                    <span className="truncate">{item.creator_name?.split(' ')[0]}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(item.id);
                }}
                className="text-gray-300 hover:text-red-500 p-1 rounded-lg transition flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Completed Items */}
          {completedItems.length > 0 && (
            <div className="pt-2 space-y-1.5 w-full">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                Alınanlar ({completedItems.length})
              </h3>
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggle(item)}
                  className="bg-gray-50/80 rounded-2xl p-2.5 border border-gray-200 flex items-center justify-between gap-2.5 cursor-pointer opacity-70 hover:opacity-100 transition w-full"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="text-xs sm:text-sm font-medium text-gray-500 line-through truncate">
                        {item.title} ({item.quantity})
                      </div>
                      <div className="text-[10px] text-emerald-600 font-medium truncate">
                        ✓ {item.completed_by_name || 'Alındı'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
