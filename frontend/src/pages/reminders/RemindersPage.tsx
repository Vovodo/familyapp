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
import { Capacitor } from '@capacitor/core';
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

    // Setup Android Notification Channel & Request Permissions
    const setupNotificationSystem = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        // Create high-importance Android Notification Channel
        await LocalNotifications.createChannel({
          id: 'reminders_channel',
          name: 'Ailem Hatırlatıcılar',
          description: 'Aile etkinlik ve randevu bildirimleri',
          importance: 5,
          visibility: 1,
          sound: 'beep.wav',
          vibration: true,
          lights: true,
          lightColor: '#E11D48',
        });

        // Request display permission if not granted
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (err) {
        console.warn('Local notification channel setup:', err);
      }
    };

    setupNotificationSystem();
  }, [currentFamily]);

  const scheduleLocalNotification = async (reminder: Reminder) => {
    try {
      const remindDate = new Date(reminder.remind_at);
      const scheduleTime = new Date(remindDate.getTime() - reminder.notify_before_minutes * 60 * 1000);

      if (scheduleTime > new Date()) {
        // Deterministic positive 32-bit integer ID for Android AlarmManager
        const hash = reminder.id
          .split('')
          .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
        const notifId = Math.abs(hash % 2147483647);

        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: `🔔 Hatırlatıcı: ${reminder.title}`,
              body: reminder.description || `${reminder.notify_before_minutes > 0 ? `${reminder.notify_before_minutes} dk sonra ` : ''}${reminder.title} zamanı geldi!`,
              channelId: 'reminders_channel',
              schedule: {
                at: scheduleTime,
                allowWhileIdle: true,
              },
              sound: 'beep.wav',
            },
          ],
        });
        console.log(`[Notification] Scheduled notification for ${scheduleTime.toLocaleTimeString()}`);
      }
    } catch (err) {
      console.warn('Local notification scheduling error:', err);
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

  const upcomingReminders = reminders.filter((r) => !r.is_completed);
  const completedReminders = reminders.filter((r) => r.is_completed);

  return (
    <div className="w-full max-w-full px-3 py-3 space-y-3.5 mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-gray-900 truncate">Hatırlatıcılar ⏰</h2>
          <p className="text-xs text-gray-500 truncate">Önemli tarihler ve alarmlar</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Ekle</span>
        </button>
      </div>

      {/* Reminder List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs">
          <Bell className="w-10 h-10 text-amber-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">Hatırlatıcı yok</h3>
          <p className="text-xs text-gray-500 mt-1">
            Fatura, ilaç saati veya doğum günleri için alarm kurun.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 w-full">
          {/* Active Reminders */}
          {upcomingReminders.map((reminder) => {
            const isLate = isPast(new Date(reminder.remind_at));
            return (
              <div
                key={reminder.id}
                onClick={() => handleToggle(reminder)}
                className={`bg-white rounded-2xl p-3.5 border shadow-2xs transition cursor-pointer active:scale-98 w-full ${
                  isLate ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-amber-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-full border-2 border-amber-500 flex items-center justify-center text-transparent hover:text-amber-500 mt-0.5 flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                        {reminder.title}
                      </div>

                      {reminder.description && (
                        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed break-words">
                          {reminder.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                          <Calendar className="w-3 h-3" />
                          {format(parseISO(reminder.remind_at), 'd MMM yyyy, HH:mm', { locale: tr })}
                        </span>

                        {reminder.repeat_interval !== 'none' && (
                          <span className="flex items-center gap-0.5 text-sky-600 font-medium">
                            <Repeat className="w-3 h-3" />
                            {reminder.repeat_interval}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(reminder.id);
                    }}
                    className="p-1 text-gray-300 hover:text-red-500 transition flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Completed Reminders */}
          {completedReminders.length > 0 && (
            <div className="pt-2 space-y-1.5 w-full">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                Tamamlananlar ({completedReminders.length})
              </h3>
              {completedReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  onClick={() => handleToggle(reminder)}
                  className="bg-gray-50/80 rounded-2xl p-2.5 border border-gray-200 flex items-center justify-between gap-2.5 cursor-pointer opacity-60 hover:opacity-100 transition w-full"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="text-xs font-medium text-gray-500 line-through truncate">
                        {reminder.title}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(reminder.id);
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

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3.5">
          <div className="bg-white rounded-3xl w-full max-w-sm p-4 space-y-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Yeni Hatırlatıcı</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Başlık</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Diş Randevusu, İlaç Saati"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Açıklama (İsteğe bağlı)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detaylar..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tarih</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Saat</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tekrar</label>
                  <select
                    value={repeatInterval}
                    onChange={(e) => setRepeatInterval(e.target.value)}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="none">Tek Seferlik</option>
                    <option value="daily">Her Gün</option>
                    <option value="weekly">Her Hafta</option>
                    <option value="monthly">Her Ay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Bildirim Zamanı</label>
                  <select
                    value={notifyBefore}
                    onChange={(e) => setNotifyBefore(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={0}>Tam Zamanında</option>
                    <option value={5}>5 dakika önce</option>
                    <option value={15}>15 dakika önce</option>
                    <option value={30}>30 dakika önce</option>
                    <option value={60}>1 saat önce</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving || !title.trim() || !date}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-600/20 flex items-center justify-center gap-1.5 transition"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Alarmı Kur</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
