import React, { useState, useEffect, useRef } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  PieChart,
  List,
  Sparkles,
  Loader2,
  Calendar,
  AlertCircle,
  Tag,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { BudgetItem, BudgetSummary } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { cacheService } from '../../services/cacheService';

const CATEGORIES_EXPENSE = [
  'Market & Gıda',
  'Faturalar (Elektrik, Su, Doğalgaz)',
  'Kira & Aidat',
  'Ulaşım & Yakıt',
  'Sağlık & Eczane',
  'Giyim & Alışveriş',
  'Kafe & Eğlence',
  'Çocuk & Eğitim',
  'Diğer Giderler',
];

const CATEGORIES_INCOME = [
  'Maaş',
  'Ek Gelir & Prim',
  'Harçlık & Destek',
  'Kira Geliri',
  'Diğer Gelir',
];

export const BudgetPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();

  // Current month & year default
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();

  const cacheKey = currentFamily ? `budget_${currentFamily.id}_${selectedMonth}_${selectedYear}` : '';
  const cachedData = cacheKey ? cacheService.get<{ tx: BudgetItem[]; sum: BudgetSummary }>(cacheKey) : null;

  const [transactions, setTransactions] = useState<BudgetItem[]>(() => cachedData?.tx || []);
  const [summary, setSummary] = useState<BudgetSummary | null>(() => cachedData?.sum || null);
  const [isLoading, setIsLoading] = useState(() => !cachedData);
  const [viewMode, setViewMode] = useState<'transactions' | 'report'>('transactions');

  // Add transaction form
  const [showAddModal, setShowAddModal] = useState(false);
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES_EXPENSE[0]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3-second action cooldown ref
  const lastActionTimestampRef = useRef<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Fetch data
  const fetchBudgetData = async () => {
    if (!currentFamily) return;
    try {
      const [txRes, sumRes] = await Promise.all([
        api.get<BudgetItem[]>(`/budget/?month=${selectedMonth}&year=${selectedYear}`),
        api.get<BudgetSummary>(`/budget/summary?month=${selectedMonth}&year=${selectedYear}`),
      ]);
      setTransactions(txRes.data);
      setSummary(sumRes.data);
      if (cacheKey) cacheService.set(cacheKey, { tx: txRes.data, sum: sumRes.data });
    } catch (err) {
      console.warn('Failed to fetch budget:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetData();
  }, [currentFamily?.id, selectedMonth, selectedYear]);

  // Realtime Supabase listener
  useEffect(() => {
    if (!currentFamily || !supabase) return;

    const channel = supabase.channel(`family-budget-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budget_items',
          filter: `family_id=eq.${currentFamily.id}`,
        },
        () => {
          fetchBudgetData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id, selectedMonth, selectedYear]);

  // Month navigation
  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() - 1);
      return next;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + 1);
      return next;
    });
  };

  const handleCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !amount || !title.trim()) return;

    // 3s cooldown check
    const now = Date.now();
    const elapsed = now - lastActionTimestampRef.current;
    if (elapsed < 3000) {
      const waitSec = Math.ceil((3000 - elapsed) / 1000);
      setCooldownRemaining(waitSec);
      setError(`Lütfen ${waitSec} saniye bekleyin.`);
      return;
    }

    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Lütfen geçerli bir tutar girin.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    lastActionTimestampRef.current = now;
    setCooldownRemaining(3);

    try {
      await api.post('/budget/', {
        type: txType,
        amount: numAmount,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        transaction_date: currentDate.toISOString(),
      });

      setShowAddModal(false);
      setTitle('');
      setAmount('');
      setDescription('');
      fetchBudgetData();
    } catch (err: any) {
      setError(err.message || 'İşlem eklenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const now = Date.now();
    const elapsed = now - lastActionTimestampRef.current;
    if (elapsed < 3000) return;
    lastActionTimestampRef.current = now;

    setTransactions((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.delete(`/budget/${id}`);
      fetchBudgetData();
    } catch (err) {
      console.warn('Delete failed:', err);
      fetchBudgetData();
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="p-3 sm:p-4 space-y-4 w-full max-w-lg mx-auto pb-24 select-none box-border">
      {/* Month Selector Bar */}
      <div className="bg-white rounded-2xl p-2.5 border border-gray-200/90 shadow-xs flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center cursor-pointer" onClick={handleCurrentMonth}>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Ortak Aile Bütçesi
          </div>
          <div className="text-base font-black text-gray-900 flex items-center justify-center gap-1.5">
            <span>{summary?.month_name || `${selectedMonth}/${selectedYear}`}</span>
            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
              Bu Ay
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Kasa Özeti Kartı */}
      <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-purple-900 rounded-3xl p-5 text-white shadow-xl shadow-indigo-900/20 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />
              <span>Aile Kasa Durumu</span>
            </span>

            {summary?.expense_change_percent !== null && summary?.expense_change_percent !== undefined && (
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-0.5 ${
                  summary.expense_change_percent > 0
                    ? 'bg-rose-500/30 text-rose-200'
                    : 'bg-emerald-500/30 text-emerald-200'
                }`}
              >
                {summary.expense_change_percent > 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                <span>Önceki aya göre %{Math.abs(summary.expense_change_percent)} {summary.expense_change_percent > 0 ? 'artış' : 'tasarruf'}</span>
              </span>
            )}
          </div>

          <div>
            <div className="text-xs text-indigo-200 font-medium">Net Bakiye</div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5">
              {formatCurrency(summary?.net_balance || 0)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/15">
            <div className="bg-white/10 rounded-2xl p-2.5">
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Toplam Gelir</span>
              </div>
              <div className="text-sm font-black mt-1">
                {formatCurrency(summary?.total_income || 0)}
              </div>
            </div>

            <div className="bg-white/10 rounded-2xl p-2.5">
              <div className="flex items-center gap-1 text-[11px] font-bold text-rose-300">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Toplam Gider</span>
              </div>
              <div className="text-sm font-black mt-1">
                {formatCurrency(summary?.total_expense || 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar: Add Income / Expense */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setTxType('expense');
            setCategory(CATEGORIES_EXPENSE[0]);
            setShowAddModal(true);
          }}
          className="py-3 px-3 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-2xl font-black text-xs shadow-md shadow-rose-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Gider Ekle (Harcama)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTxType('income');
            setCategory(CATEGORIES_INCOME[0]);
            setShowAddModal(true);
          }}
          className="py-3 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl font-black text-xs shadow-md shadow-emerald-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Gelir Ekle (Kasa)</span>
        </button>
      </div>

      {/* View Switcher: List vs Monthly Report */}
      <div className="flex bg-gray-100 p-1 rounded-2xl w-full">
        <button
          type="button"
          onClick={() => setViewMode('transactions')}
          className={`flex-1 py-2.5 px-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            viewMode === 'transactions'
              ? 'bg-white text-indigo-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <List className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">İşlem Listesi ({transactions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('report')}
          className={`flex-1 py-2.5 px-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            viewMode === 'report'
              ? 'bg-white text-indigo-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <PieChart className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Aylık Rapor & Dağılım</span>
        </button>
      </div>

      {/* Main Content Area with Fixed Min-Height to Prevent Layout Jumps */}
      <div className="w-full min-h-[280px]">
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : viewMode === 'report' ? (
        /* Category Breakdown Report */
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-gray-900 text-sm">
              Harcama Kategorileri Dağılımı
            </h3>
            <span className="text-xs text-gray-400 font-semibold">
              Toplam {formatCurrency(summary?.total_expense || 0)}
            </span>
          </div>

          {!summary?.categories || summary.categories.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              Bu ay için henüz harcama kaydı bulunmuyor.
            </div>
          ) : (
            <div className="space-y-3">
              {summary.categories.map((cat, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800">{cat.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900">
                        {formatCurrency(cat.amount)}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">
                        (%{cat.percentage})
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Transactions List */
        transactions.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="font-black text-gray-800 text-base">Henüz İşlem Kaydı Yok</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto">
              Bu ay için harcama veya gelir ekleyerek aile bütçesini takip etmeye başlayın.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {transactions.map((item) => {
              const isExpense = item.type === 'expense';
              return (
                <div
                  key={item.id}
                  className="bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${
                        isExpense
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {isExpense ? (
                        <TrendingDown className="w-5 h-5" />
                      ) : (
                        <TrendingUp className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-semibold">
                        <span>{item.category}</span>
                        <span>•</span>
                        <span>{item.creator_name || 'Aile'}</span>
                        <span>•</span>
                        <span>
                          {new Date(item.transaction_date).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-sm font-black ${
                        isExpense ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {isExpense ? '-' : '+'}
                      {formatCurrency(item.amount)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-gray-300 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
      </div>

      {/* Modal: Create Transaction */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">
                {txType === 'expense' ? 'Gider (Harcama) Ekle' : 'Gelir (Kasa) Ekle'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateTransaction} className="space-y-3.5">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTxType('expense');
                    setCategory(CATEGORIES_EXPENSE[0]);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    txType === 'expense'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🔴 Gider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType('income');
                    setCategory(CATEGORIES_INCOME[0]);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    txType === 'income'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🟢 Gelir
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Tutar (₺) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-base font-black focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Açıklama / Başlık *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Haftalık Pazar Alışverişi"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Kategori
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {(txType === 'expense' ? CATEGORIES_EXPENSE : CATEGORIES_INCOME).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !amount || !title.trim() || cooldownRemaining > 0}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-md shadow-indigo-300 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : cooldownRemaining > 0 ? (
                    <span>Bekleyin ({cooldownRemaining}s)</span>
                  ) : (
                    <span>Kaydet 💳</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
