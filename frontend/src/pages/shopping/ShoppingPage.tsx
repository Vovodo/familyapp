import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  Plus,
  Trash2,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { ShoppingItem } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { localShoppingStorage } from '../../services/localShoppingStorage';

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
  Market: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', activeBg: 'bg-emerald-600' },
  Manav: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', activeBg: 'bg-orange-600' },
  Eczane: { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200', activeBg: 'bg-cyan-600' },
  Kasap: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', activeBg: 'bg-rose-600' },
  Fırın: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', activeBg: 'bg-amber-600' },
  Ev: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', activeBg: 'bg-indigo-600' },
};

const CATEGORIES = Object.keys(CATEGORY_STYLES);

export const ShoppingPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('1 adet');
  const [category, setCategory] = useState('Market');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Locking and debounce ref to prevent rapid double-click race conditions
  const pendingActionIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);

  // 1. Initial 0ms Instant Load + Background Fetch
  useEffect(() => {
    if (!currentFamily) return;

    // A. 0ms Instant Local Cache
    const cached = localShoppingStorage.getItems(currentFamily.id);
    if (cached && cached.length > 0) {
      setItems(cached);
      setIsLoading(false);
    }

    // B. Background Sync
    api.get<ShoppingItem[]>('/shopping/')
      .then((res) => {
        const merged = localShoppingStorage.mergeItems(currentFamily.id, res.data);
        setItems(merged);
      })
      .catch((err) => {
        console.error('Shopping background sync failed:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFamily?.id]);

  // 2. Granular Realtime WebSocket Stream (Zero Race Condition)
  useEffect(() => {
    if (!currentFamily || !supabase) return;

    const channel = supabase.channel(`family-shopping-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    // Realtime Broadcast for sub-30ms instant peer updates
    channel.on('broadcast', { event: 'shopping_delta' }, (payload) => {
      const data = payload.payload;
      if (!data) return;
      applyDelta(data.action, data.item);
    });

    // Postgres Changes Granular Delta Handler
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'shopping_items',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        applyDelta('INSERT', payload.new as ShoppingItem);
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'shopping_items',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        applyDelta('UPDATE', payload.new as ShoppingItem);
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'shopping_items',
        filter: `family_id=eq.${currentFamily.id}`,
      },
      (payload) => {
        applyDelta('DELETE', payload.old as ShoppingItem);
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentFamily?.id]);

  // Granular Delta Applier (Preserves cached metadata & eliminates flickering)
  const applyDelta = useCallback((action: 'INSERT' | 'UPDATE' | 'DELETE', item: ShoppingItem) => {
    if (!currentFamily) return;

    setItems((prev) => {
      let next: ShoppingItem[] = [];
      if (action === 'INSERT') {
        const exists = prev.some((i) => i.id === item.id || (i.title === item.title && i.category === item.category && i.is_completed === item.is_completed));
        if (exists) {
          next = prev.map((i) => (i.title === item.title && i.category === item.category ? { ...i, ...item } : i));
        } else {
          next = [item, ...prev];
        }
      } else if (action === 'UPDATE') {
        next = prev.map((i) => {
          if (i.id === item.id) {
            return {
              ...i,
              ...item,
              // Preserve creator name and completed by name
              creator_name: item.creator_name || i.creator_name,
              completed_by_name: item.completed_by_name || i.completed_by_name || (item.is_completed ? (user?.full_name || 'Alındı') : undefined),
            };
          }
          return i;
        });
      } else if (action === 'DELETE') {
        next = prev.filter((i) => i.id !== item.id);
      } else {
        next = prev;
      }

      localShoppingStorage.saveItems(currentFamily.id, next);
      return next;
    });
  }, [currentFamily, user?.full_name]);

  const broadcastDelta = (action: 'INSERT' | 'UPDATE' | 'DELETE', item: ShoppingItem) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'shopping_delta',
        payload: { action, item },
      });
    }
  };

  // 3. Add Item (Optimistic + Lock Protected)
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemTitle = title.trim();
    if (!itemTitle || isAdding || !user || !currentFamily) return;

    const itemQty = quantity.trim() || '1 adet';
    setTitle('');
    setIsAdding(true);

    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}

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

    setItems((prev) => {
      const next = [optimisticItem, ...prev];
      localShoppingStorage.saveItems(currentFamily.id, next);
      return next;
    });

    broadcastDelta('INSERT', optimisticItem);

    try {
      const res = await api.post<ShoppingItem>('/shopping/', {
        title: itemTitle,
        quantity: itemQty,
        category,
      });

      setItems((prev) => {
        const next = prev.map((i) => (i.id === tempId ? { ...res.data, creator_name: user.full_name } : i));
        localShoppingStorage.saveItems(currentFamily.id, next);
        return next;
      });
    } catch (err: any) {
      alert('Ürün eklenemedi: ' + err.message);
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== tempId);
        localShoppingStorage.saveItems(currentFamily.id, next);
        return next;
      });
    } finally {
      setIsAdding(false);
    }
  };

  // 4. Toggle Item with Per-Item Mutex Locking (Debounced & Glitch-Free)
  const handleToggle = async (item: ShoppingItem) => {
    // Prevent duplicate multi-taps on the same item while network request is in flight
    if (pendingActionIds.current.has(item.id)) return;
    pendingActionIds.current.add(item.id);

    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}

    const nextState = !item.is_completed;
    const updatedItem: ShoppingItem = {
      ...item,
      is_completed: nextState,
      completed_by_name: nextState ? (user?.full_name || 'Alındı') : undefined,
    };

    // 1. Instantly update UI without waiting
    setItems((prev) => {
      const next = prev.map((i) => (i.id === item.id ? updatedItem : i));
      if (currentFamily) localShoppingStorage.saveItems(currentFamily.id, next);
      return next;
    });

    // 2. Broadcast immediately
    broadcastDelta('UPDATE', updatedItem);

    // 3. Send API patch
    try {
      await api.patch(`/shopping/${item.id}`, { is_completed: nextState });
    } catch (err) {
      // Revert only if network call completely failed
      setItems((prev) => {
        const next = prev.map((i) => (i.id === item.id ? item : i));
        if (currentFamily) localShoppingStorage.saveItems(currentFamily.id, next);
        return next;
      });
    } finally {
      // Release lock after 300ms to allow smooth follow-up taps
      setTimeout(() => {
        pendingActionIds.current.delete(item.id);
      }, 300);
    }
  };

  // 5. Delete Item (Instant Delta)
  const handleDelete = async (itemId: string) => {
    if (pendingActionIds.current.has(itemId)) return;
    pendingActionIds.current.add(itemId);

    const itemToDelete = items.find((i) => i.id === itemId);
    if (!itemToDelete) return;

    try {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    } catch {}

    setItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      if (currentFamily) localShoppingStorage.saveItems(currentFamily.id, next);
      return next;
    });

    broadcastDelta('DELETE', itemToDelete);

    try {
      await api.delete(`/shopping/${itemId}`);
    } catch (err) {
      if (itemToDelete) {
        setItems((prev) => [itemToDelete, ...prev]);
      }
    } finally {
      setTimeout(() => {
        pendingActionIds.current.delete(itemId);
      }, 300);
    }
  };

  const handleClearCompleted = async () => {
    const completedItems = items.filter((i) => i.is_completed);
    if (completedItems.length === 0) return;

    setItems((prev) => {
      const next = prev.filter((i) => !i.is_completed);
      if (currentFamily) localShoppingStorage.saveItems(currentFamily.id, next);
      return next;
    });

    try {
      await Promise.all(completedItems.map((i) => api.delete(`/shopping/${i.id}`)));
    } catch (err) {
      console.error('Clear completed failed:', err);
    }
  };

  const activeItems = items.filter((i) => !i.is_completed);
  const completedItems = items.filter((i) => i.is_completed);

  return (
    <div className="w-full max-w-full px-3 py-3 space-y-3.5 mx-auto overflow-x-hidden">
      {/* Header */}
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
            className="text-xs font-bold text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 transition flex items-center gap-1 flex-shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Alınanları</span>
            <span>Sil</span>
          </button>
        )}
      </div>

      {/* Add Item Form Card */}
      <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-gray-100 w-full">
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

          {/* Color Coded 3x2 Grid for Categories */}
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {CATEGORIES.map((cat) => {
              const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.Market;
              const isSelected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition text-center truncate border cursor-pointer ${
                    isSelected
                      ? `${style.activeBg} text-white border-transparent shadow-xs scale-102`
                      : `${style.bg} ${style.text} ${style.border} hover:opacity-90`
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={!title.trim() || isAdding}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
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
          {activeItems.map((item) => {
            const catStyle = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.Market;
            return (
              <div
                key={item.id}
                onClick={() => handleToggle(item)}
                className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs flex items-center justify-between gap-2.5 active:scale-98 transition-all duration-150 cursor-pointer hover:border-emerald-200 w-full select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-full border-2 border-emerald-500 flex items-center justify-center text-transparent hover:text-emerald-500 transition-colors flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">{item.title}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-emerald-700">{item.quantity}</span>
                      <span>•</span>
                      <span className={`px-1.5 py-0.2 rounded-md font-bold text-[10px] ${catStyle.bg} ${catStyle.text} border ${catStyle.border}`}>
                        {item.category}
                      </span>
                      <span>•</span>
                      <span className="truncate">{item.creator_name?.split(' ')[0] || 'Aile'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition flex-shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {/* Completed Items */}
          {completedItems.length > 0 && (
            <div className="pt-2 space-y-1.5 w-full animate-fade-in">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                Alınanlar ({completedItems.length})
              </h3>
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggle(item)}
                  className="bg-gray-50/80 rounded-2xl p-2.5 border border-gray-200 flex items-center justify-between gap-2.5 cursor-pointer opacity-70 hover:opacity-100 transition-all duration-150 w-full select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
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
                    className="text-gray-300 hover:text-red-500 p-1.5 flex-shrink-0 cursor-pointer"
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
