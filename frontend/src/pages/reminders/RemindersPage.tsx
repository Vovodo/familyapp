import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Check,
  Calendar,
  Clock,
  Repeat,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Reminder } from '../../types';
import { api } from '../../services/api';
import { format, parseISO, isPast } from 'date-fns';
import { tr } from 'date-fns/locale';

export const RemindersPage: React.FC = () => {
  const { user } = useAuth();
  const { currentFamily } = useFamily();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [repeatInterval, setRepeatInterval] = useState('none');
  const [notifyBefore, setNotifyBefore] = useState(15);
  const [isSaving, setIsSaving] = useState(false);

  const fetchReminders = async () => {
    if (!currentFamily) return;
    try {
      const res = await api.get<Reminder[]>('/reminders/', {
        params: { include_completed: true },
      });
      setReminders(res.data);
    } catch (err) {
      console.error('Reminders fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();

    // Request notification permission when viewing reminders
    const requestNotificationPermission = async () => {
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch {
        // Fallback
      }
    };
    requestNotificationPermission();
  }, [currentFamily]);

  const scheduleLocalNotification = async (reminder: Reminder) => {
    try {
      const remindDate = new Date(reminder.remind_at);
      const scheduleTime = new Date(remindDate.getTime() - reminder.notify_before_minutes * 60 * 1000);

      if (scheduleTime > new Date()) {
        const notifId = Math.abs(reminder.id.split('-')[0].split('').reduce((a, b) => a + b.charCodeAt(0), 0));
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: `🔔 Hatırlatıcı: ${reminder.title}`,
              body: reminder.description || `${reminder.notify_before_minutes} dakika sonra randevunuz var.`,
              schedule: { at: scheduleTime },
              sound: 'beep.wav',
            },
          ],
        });
      }
    } catch (err) {
      console.warn('Local notification scheduling failed (running in browser or permission denied):', err);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || isSaving) return;

    setIsSaving(true);
    try {
      const remindAtISO = new Date(`${date}T${time}:00`).toISOString();
      const res = await api.post<Reminder>('/reminders/', {
        title: title.trim(),
        description: description.trim() || undefined,
        remind_at: remindAtISO,
        repeat_interval: repeatInterval,
        notify_before_minutes: Number(notifyBefore),
      });

      setReminders((prev) => [...prev, res.data]);
      await scheduleLocalNotification(res.data);
      setShowModal(false);
      setTitle('');
      setDescription('');
      setDate('');
    } catch (err: any) {
      alert('Hatırlatıcı oluşturulamadı: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    const nextState = !reminder.is_completed;
    setReminders((prev) =>
      prev.map((r) => (r.id === reminder.id ? { ...r, is_completed: nextState } : r))
    );

    try {
      await api.patch(`/reminders/${reminder.id}`, { is_completed: nextState });
    } catch (err) {
      fetchReminders();
    }
  };

  const handleDelete = async (reminderId: string) => {
    if (!confirm('Bu hatırlatıcıyı silmek istiyor musunuz?')) return;
    try {
      await api.delete(`/reminders/${reminderId}`);
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
    } catch (err: any) {
      alert('Silinemedi: ' + err.message);
    }
  };

  const activeReminders = reminders.filter((r) => !r.is_completed);
  const completedReminders = reminders.filter((r) => r.is_completed);

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Hatırlatıcılar 🔔</h2>
          <p className="text-xs text-gray-500">Aile randevuları, doktor ve ilaç takipleri</p>
        </div>
        <button
          onClick={() => {
            // Set default date to today
            const today = new Date().toISOString().split('T')[0];
            setDate(today);
            setShowModal(true);
          }}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-amber-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Ekle</span>
        </button>
      </div>

      {/* Reminders List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Bell className="w-12 h-12 text-amber-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Planlanmış hatırlatıcı yok</h3>
          <p className="text-xs text-gray-500 mt-1">
            Doktor randevusu veya önemli bir etkinliği kaydetmek için yukarıdaki butona dokunun.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeReminders.map((reminder) => {
            const remindDate = new Date(reminder.remind_at);
            const isPastDue = isPast(remindDate);

            return (
              <div
                key={reminder.id}
                onClick={() => handleToggle(reminder)}
                className={`bg-white rounded-3xl p-4 border shadow-xs flex items-center justify-between gap-3 active:scale-98 transition cursor-pointer ${
                  isPastDue ? 'border-amber-300 bg-amber-50/30' : 'border-gray-100 hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-6 h-6 rounded-full border-2 border-amber-500 flex items-center justify-center text-transparent hover:text-amber-500 flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="text-sm font-bold text-gray-900 truncate">{reminder.title}</div>
                    {reminder.description && (
                      <div className="text-xs text-gray-600 truncate">{reminder.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-amber-700 font-semibold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {format(remindDate, 'd MMMM yyyy', { locale: tr })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {format(remindDate, 'HH:mm')}
                      </span>
                      {reminder.repeat_interval !== 'none' && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5 text-gray-500">
                            <Repeat className="w-3 h-3" />
                            {reminder.repeat_interval === 'daily'
                              ? 'Her Gün'
                              : reminder.repeat_interval === 'weekly'
                              ? 'Her Hafta'
                              : 'Her Ay'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(reminder.id);
                  }}
                  className="text-gray-300 hover:text-red-500 p-1.5 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {/* Completed Reminders */}
          {completedReminders.length > 0 && (
            <div className="pt-4 space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">
                Tamamlananlar ({completedReminders.length})
              </h3>
              {completedReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  onClick={() => handleToggle(reminder)}
                  className="bg-gray-50 rounded-2xl p-3 border border-gray-200 flex items-center justify-between gap-3 cursor-pointer opacity-60 hover:opacity-100 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-medium text-gray-500 line-through truncate">
                        {reminder.title}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {format(new Date(reminder.remind_at), 'd MMM, HH:mm', { locale: tr })}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(reminder.id);
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

      {/* Reminder Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Yeni Hatırlatıcı Ekle</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ne hatırlatılsın? (Örn: Doktor Randevusu)"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />

              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ek detay veya not (İsteğe bağlı)"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Tarih
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Saat
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Tekrarlama
                  </label>
                  <select
                    value={repeatInterval}
                    onChange={(e) => setRepeatInterval(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="none">Tek Seferlik</option>
                    <option value="daily">Her Gün</option>
                    <option value="weekly">Her Hafta</option>
                    <option value="monthly">Her Ay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Bildirim Zamanı
                  </label>
                  <select
                    value={notifyBefore}
                    onChange={(e) => setNotifyBefore(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={0}>Tam Zamanında</option>
                    <option value={10}>10 Dakika Önce</option>
                    <option value={30}>30 Dakika Önce</option>
                    <option value={60}>1 Saat Önce</option>
                    <option value={1440}>1 Gün Önce</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1 shadow-md"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
