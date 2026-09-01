import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Flame,
  User as UserIcon,
  Calendar,
  Sparkles,
  Loader2,
  Check,
  Clock,
  ListTodo
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { TaskItem } from '../../types';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { cacheService } from '../../services/cacheService';
import { playTaskCompleteSound } from '../../services/soundService';

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();

  const cacheKey = currentFamily ? `tasks_${currentFamily.id}` : '';
  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    cacheKey ? cacheService.get<TaskItem[]>(cacheKey) || [] : []
  );
  const [isLoading, setIsLoading] = useState(() => (cacheKey ? !cacheService.get(cacheKey) : true));
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  // New task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toggle cooldown ref
  const cooldownMap = useRef<Record<string, number>>({});

  // Fetch tasks
  const fetchTasks = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<TaskItem[]>('/tasks/');
      setTasks(res.data);
      if (cacheKey) cacheService.set(cacheKey, res.data);
    } catch (err) {
      console.warn('Failed to fetch tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [currentFamily?.id]);

  // Realtime listener
  useEffect(() => {
    if (!currentFamily || !supabase) return;

    const channel = supabase.channel(`family-tasks-${currentFamily.id}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_items',
          filter: `family_id=eq.${currentFamily.id}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentFamily?.id]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isAdding) return;

    setIsAdding(true);
    setError(null);

    try {
      const res = await api.post<TaskItem>('/tasks/', {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigned_to: assignedTo || undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      });

      setTasks((prev) => [res.data, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('normal');
      setAssignedTo('');
      setDueDate('');
      setShowAddModal(false);
    } catch (err: any) {
      setError(err.message || 'Görev eklenemedi.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    // 2-second cooldown per task
    const now = Date.now();
    const lastToggle = cooldownMap.current[taskId] || 0;
    if (now - lastToggle < 2000) return;
    cooldownMap.current[taskId] = now;

    // Optimistic toggle
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    const willBeCompleted = !target.is_completed;
    if (willBeCompleted) {
      playTaskCompleteSound();
      if (navigator.vibrate) navigator.vibrate(50);
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              is_completed: willBeCompleted,
              completed_at: willBeCompleted ? new Date().toISOString() : null,
              completer_name: willBeCompleted ? user?.full_name?.split(' ')[0] : null,
            }
          : t
      )
    );

    try {
      const res = await api.patch<TaskItem>(`/tasks/${taskId}/toggle`);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.data : t)));
    } catch (err) {
      console.warn('Toggle failed, reverting:', err);
      fetchTasks();
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.delete(`/tasks/${taskId}`);
    } catch (err) {
      console.warn('Delete task failed:', err);
      fetchTasks();
    }
  };

  const activeTasks = tasks.filter((t) => !t.is_completed);
  const completedTasks = tasks.filter((t) => t.is_completed);
  const displayedTasks = activeTab === 'active' ? activeTasks : completedTasks;

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-lg mx-auto pb-24 select-none">
      {/* Warm Header Card */}
      <div className="bg-gradient-to-br from-teal-600 to-emerald-700 rounded-3xl p-5 text-white shadow-xl shadow-teal-900/15 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-200">
            <ListTodo className="w-4 h-4" />
            <span>Aile İşleri & Görevler</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-1">Yapılacaklar Listesi 📋</h2>
          <p className="text-xs text-teal-100 mt-1 leading-relaxed">
            Evin ve ailenin tüm işlerini kolayca paylaşın, kimin ne yapacağını takip edin.
          </p>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/20 text-xs font-bold">
            <span className="bg-white/20 px-3 py-1 rounded-xl">
              {activeTasks.length} bekleyen iş
            </span>
            <span className="bg-white/10 px-3 py-1 rounded-xl text-teal-100">
              {completedTasks.length} tamamlandı
            </span>
          </div>
        </div>
      </div>

      {/* Quick Add Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full py-3.5 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-2xl font-black text-sm shadow-md shadow-teal-300 flex items-center justify-center gap-2 transition cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        <span>Yeni Görev / İş Ekle</span>
      </button>

      {/* Segmented Control Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'active'
              ? 'bg-white text-teal-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <span>Aktif İşler</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-teal-100 text-teal-800">
            {activeTasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'completed'
              ? 'bg-white text-teal-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <span>Tamamlananlar</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-200 text-gray-700">
            {completedTasks.length}
          </span>
        </button>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-sm space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="font-black text-gray-800 text-base">
            {activeTab === 'active' ? 'Harika! Bekleyen hiçbir iş yok' : 'Henüz tamamlanan bir iş yok'}
          </h3>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            {activeTab === 'active'
              ? 'Tüm aile görevleri tamamlandı. Yeni bir iş eklemek için yukarıdaki butona dokunun.'
              : 'Tamamlanan görevler burada arşivlenecektir.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedTasks.map((task) => {
            const isUrgent = task.priority === 'urgent';
            return (
              <div
                key={task.id}
                onClick={() => handleToggleTask(task.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 relative overflow-hidden active:scale-[0.99] ${
                  task.is_completed
                    ? 'bg-gray-50/90 border-gray-200 text-gray-400'
                    : isUrgent
                    ? 'bg-rose-50/70 border-rose-200 shadow-sm hover:shadow-md'
                    : 'bg-white border-gray-200/90 shadow-xs hover:shadow-md'
                }`}
              >
                {/* Big Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleTask(task.id);
                  }}
                  className={`mt-0.5 w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                    task.is_completed
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                      : isUrgent
                      ? 'border-rose-400 bg-white hover:bg-rose-100'
                      : 'border-gray-300 bg-white hover:border-teal-500'
                  }`}
                >
                  {task.is_completed && <Check className="w-4 h-4 stroke-[3]" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isUrgent && !task.is_completed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white shadow-2xs">
                        <Flame className="w-3 h-3" />
                        ACİL
                      </span>
                    )}

                    <h4
                      className={`text-sm font-bold truncate ${
                        task.is_completed
                          ? 'line-through text-gray-400'
                          : isUrgent
                          ? 'text-rose-950 font-black'
                          : 'text-gray-900'
                      }`}
                    >
                      {task.title}
                    </h4>
                  </div>

                  {task.description && (
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        task.is_completed ? 'line-through text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      {task.description}
                    </p>
                  )}

                  {/* Badges / Meta */}
                  <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold text-gray-400 flex-wrap">
                    {task.assignee_name && (
                      <span className="flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md font-bold">
                        <UserIcon className="w-3 h-3" />
                        {task.assignee_name}
                      </span>
                    )}

                    {task.due_date && (
                      <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                        <Calendar className="w-3 h-3" />
                        {new Date(task.due_date).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}

                    {task.is_completed && task.completer_name && (
                      <span className="text-emerald-700 font-bold">
                        ✓ {task.completer_name} tamamladı
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteTask(task.id, e)}
                  className="p-1.5 text-gray-300 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer flex-shrink-0"
                  title="Görevi Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Task */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-900">Yeni Aile Görevi Ekle</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Görev Başlığı *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Salonun camlarını sil, Çöpü dök..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Açıklama / Detay (İsteğe Bağlı)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ekstra detaylar..."
                  rows={2}
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
                />
              </div>

              {/* Priority Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Öncelik</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPriority('normal')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      priority === 'normal'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>🟢 Normal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('urgent')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      priority === 'urgent'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>🔴 Acil İş</span>
                  </button>
                </div>
              </div>

              {/* Assignee Selector */}
              {currentFamily?.members && currentFamily.members.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Kime Atansın?
                  </label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Tüm Aile (Ortak İş)</option>
                    {currentFamily.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.nickname || m.user?.full_name || 'Aile Üyesi'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Due Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Hedef Tarih (İsteğe Bağlı)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
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
                  disabled={isAdding || !title.trim()}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl text-xs shadow-md shadow-teal-300 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Görevi Kaydet 📋</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
