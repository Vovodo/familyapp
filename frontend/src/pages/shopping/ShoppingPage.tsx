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
          // Instantly sync list on any DB change
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

    // Optimistic item
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
    // Instant optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              is_completed: nextState,
              completed_by_name: nextState ? user?.full_name?.split(' ')[0] : undefined,
            }
          : i
      )
    );

    try {
      await api.patch(`/shopping/${item.id}`, {
        is_completed: nextState,
      });
    } catch (err) {
      fetchShoppingList();
    }
  };

  const handleDelete = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await api.delete(`/shopping/${itemId}`);
    } catch (err: any) {
      fetchShoppingList();
    }
  };

  const handleClearCompleted = async () => {
    const completedCount = items.filter((i) => i.is_completed).length;
    if (completedCount === 0) return;

    if (!confirm(`${completedCount} tamamlanan ürünü listeden kaldırmak istiyor musunuz?`)) return;
    setItems((prev) => prev.filter((i) => !i.is_completed));

    try {
      await api.delete('/shopping/completed');
    } catch (err: any) {
      fetchShoppingList();
    }
  };

  const activeItems = items.filter((i) => !i.is_completed);
  const completedItems = items.filter((i) => i.is_completed);

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header with Title & Clear */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <span>Alışveriş Listesi</span>
            <span className="text-emerald-600">🛒</span>
          </h2>
          <p className="text-xs text-gray-500">
            {activeItems.length > 0
              ? `${activeItems.length} alınacak ürün var`
              : 'Tüm ihtiyaçlar alındı! 🎉'}
          </p>
        </div>

        {completedItems.length > 0 && (
          <button
            onClick={handleClearCompleted}
            className="text-xs font-bold text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Alınanları Sil</span>
          </button>
        )}
      </div>

      {/* Add Item Form Card */}
      <div className="bg-white rounded-3xl p-4 shadow-md border border-gray-100">
        <form onSubmit={handleAddItem} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ne alınacak? (Örn: Süt, Ekmek)"
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1 kg, 2 paket vb."
              className="w-24 px-3 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs text-center focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Category Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition ${
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
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-2xl text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition"
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
        <div className="text-center py-12 bg-white rounded-3xl p-6 border border-gray-100">
          <ShoppingBag className="w-12 h-12 text-emerald-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Alışveriş listeniz boş</h3>
          <p className="text-xs text-gray-500 mt-1">Evin ihtiyaçlarını yukarıdan ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Active Items */}
          {activeItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleToggle(item)}
              className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-xs flex items-center justify-between gap-3 active:scale-98 transition cursor-pointer hover:border-emerald-200"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-500 flex items-center justify-center text-transparent hover:text-emerald-500">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="truncate">
                  <div className="text-sm font-bold text-gray-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    <span className="font-semibold text-emerald-700">{item.quantity}</span>
                    <span>•</span>
                    <span className="bg-gray-100 px-1.5 py-0.2 rounded-md">{item.category}</span>
                    <span>•</span>
                    <span>{item.creator_name?.split(' ')[0]}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(item.id);
                }}
                className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Completed Items */}
          {completedItems.length > 0 && (
            <div className="pt-4 space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">
                Alınanlar ({completedItems.length})
              </h3>
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggle(item)}
                  className="bg-gray-50/80 rounded-2xl p-3 border border-gray-200 flex items-center justify-between gap-3 cursor-pointer opacity-70 hover:opacity-100 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-medium text-gray-500 line-through truncate">
                        {item.title} ({item.quantity})
                      </div>
                      <div className="text-[10px] text-emerald-600 font-medium">
                        ✓ {item.completed_by_name || 'Alındı'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="text-gray-300 hover:text-red-500 p-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
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
