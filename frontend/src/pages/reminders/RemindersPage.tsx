import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Check,
  Calendar,
  Repeat,
  X,
  Loader2,
  Clock,
  AlertCircle,
  Sparkles,
  Zap,
  Timer,
} from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useFamily } from '../../contexts/FamilyContext';
import { Reminder } from '../../types';
import { api } from '../../services/api';
import { localRemindersStorage } from '../../services/localRemindersStorage';
import { format, parseISO, isPast, differenceInMinutes, addHours, addDays, setHours, setMinutes } from 'date-fns';
import { tr } from 'date-fns/locale';

export const REMINDER_VIP_CHANNEL = 'family_reminders_channel';

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
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  // 1. Instant Cache + Background Sync
  useEffect(() => {
    if (!currentFamily) return;

    const cached = localRemindersStorage.getReminders(currentFamily.id);
    if (cached && cached.length > 0) {
      setReminders(cached);
      setIsLoading(false);
    }

    api.get<Reminder[]>('/reminders/', { params: { include_completed: true } })
      .then((res) => {
        const merged = localRemindersStorage.mergeReminders(currentFamily.id, res.data);
        setReminders(merged);
      })
      .catch((err) => {
        console.error('Reminders sync error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFamily?.id]);

  // 2. VIP Android Notification Channel Setup
  useEffect(() => {
    const setupNotificationSystem = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        await LocalNotifications.createChannel({
          id: REMINDER_VIP_CHANNEL,
          name: '🚨 Aile Acil & Önemli Hatırlatıcılar',
          description: 'Öncelikli alarm, sesli uyarı ve aile hatırlatmaları',
          importance: 5,
          visibility: 1,
          sound: 'beep.wav',
          vibration: true,
          lights: true,
          lightColor: '#F59E0B',
        });

        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (err) {
        console.warn('VIP Reminder notification channel setup:', err);
      }
    };

    setupNotificationSystem();
  }, []);

  const scheduleLocalNotification = async (reminder: Reminder) => {
    try {
      const remindDate = new Date(reminder.remind_at);
      const scheduleTime = new Date(remindDate.getTime() - (reminder.notify_before_minutes || 0) * 60 * 1000);

      if (scheduleTime > new Date()) {
        const hash = reminder.id
          .split('')
          .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
        const notifId = Math.abs(hash % 2147483647);

        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: `⏰ [ÖNEMLİ] ${reminder.title}`,
              body:
                reminder.description ||
                `${reminder.notify_before_minutes > 0 ? `${reminder.notify_before_minutes} dk sonra ` : ''}${reminder.title} zamanı geldi!`,
              channelId: REMINDER_VIP_CHANNEL,
              schedule: {
                at: scheduleTime,
                allowWhileIdle: true,
              },
              sound: 'beep.wav',
              extra: {
                type: 'reminder',
                reminderId: reminder.id,
              },
            },
          ],
        });
      }
    } catch (err) {
      console.warn('Local notification scheduling error:', err);
    }
  };

  // Quick Preset Handlers
  const applyPreset = (type: '1hour' | 'tonight' | 'tomorrow_morning' | 'weekend') => {
    const now = new Date();
    let target = now;

    if (type === '1hour') {
      target = addHours(now, 1);
    } else if (type === 'tonight') {
      target = setHours(setMinutes(now, 0), 20);
      if (isPast(target)) target = addDays(target, 1);
    } else if (type === 'tomorrow_morning') {
      target = setHours(setMinutes(addDays(now, 1), 0), 9);
    } else if (type === 'weekend') {
      const day = now.getDay();
      const daysUntilSat = (6 - day + 7) % 7 || 7;
      target = setHours(setMinutes(addDays(now, daysUntilSat), 0), 11);
    }

    setDate(format(target, 'yyyy-MM-dd'));
    setTime(format(target, 'HH:mm'));
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || isSaving || !currentFamily) return;

    setIsSaving(true);
    try {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      const remindAtISO = new Date(`${date}T${time}:00`).toISOString();
      const res = await api.post<Reminder>('/reminders/', {
        title: title.trim(),
        description: description.trim() || undefined,
        remind_at: remindAtISO,
        repeat_interval: repeatInterval,
        notify_before_minutes: Number(notifyBefore),
      });

      setReminders((prev) => {
        const next = [...prev, res.data];
        localRemindersStorage.saveReminders(currentFamily.id, next);
        return next;
      });

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
    if (!currentFamily) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    const nextState = !reminder.is_completed;
    setReminders((prev) => {
      const next = prev.map((r) => (r.id === reminder.id ? { ...r, is_completed: nextState } : r));
      localRemindersStorage.saveReminders(currentFamily.id, next);
      return next;
    });

    try {
      await api.patch(`/reminders/${reminder.id}`, { is_completed: nextState });
    } catch {
      setReminders((prev) => {
        const next = prev.map((r) => (r.id === reminder.id ? reminder : r));
        localRemindersStorage.saveReminders(currentFamily.id, next);
        return next;
      });
    }
  };

  const handleSnooze = async (reminder: Reminder) => {
    if (!currentFamily || snoozingId) return;
    setSnoozingId(reminder.id);
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});

    try {
      const res = await api.post<Reminder>(`/reminders/${reminder.id}/snooze`, null, {
        params: { minutes: 10 },
      });

      setReminders((prev) => {
        const next = prev.map((r) => (r.id === reminder.id ? res.data : r));
        localRemindersStorage.saveReminders(currentFamily.id, next);
        return next;
      });

      await scheduleLocalNotification(res.data);
    } catch (err: any) {
      alert('Erteleme yapılamadı: ' + err.message);
    } finally {
      setSnoozingId(null);
    }
  };

  const handleDelete = async (reminderId: string) => {
    if (!confirm('Bu hatırlatıcıyı silmek istiyor musunuz?') || !currentFamily) return;
    setReminders((prev) => {
      const next = prev.filter((r) => r.id !== reminderId);
      localRemindersStorage.saveReminders(currentFamily.id, next);
      return next;
    });
    try {
      await api.delete(`/reminders/${reminderId}`);
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
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-1.5 truncate">
            <span>Hatırlatıcılar</span>
            <span className="text-amber-500">⏰</span>
          </h2>
          <p className="text-xs text-gray-500 truncate">
            {upcomingReminders.length > 0
              ? `${upcomingReminders.length} aktif hatırlatma planlandı`
              : 'Harika, bekleyen bir hatırlatma yok!'}
          </p>
        </div>

        <button
          onClick={() => {
            applyPreset('1hour');
            setShowModal(true);
          }}
          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-sm flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Yeni Ekle</span>
        </button>
      </div>

      {/* Reminder List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <div className="w-14 h-14 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Bell className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">Planlanmış Hatırlatıcı Yok</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
            Önemli randevuları, ilaç saatlerini ve aile etkinliklerini kaçırmamak için hemen hatırlatıcı oluşturun.
          </p>
          <button
            onClick={() => {
              applyPreset('1hour');
              setShowModal(true);
            }}
            className="mt-4 px-4 py-2 bg-amber-500 text-white font-bold rounded-2xl text-xs shadow-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>İlk Hatırlatıcıyı Kur</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Active Upcoming Reminders */}
          {upcomingReminders.map((r) => {
            const remindDate = parseISO(r.remind_at);
            const expired = isPast(remindDate);
            const minutesLeft = differenceInMinutes(remindDate, new Date());
            const isUrgent = minutesLeft >= 0 && minutesLeft <= 120;

            return (
              <div
                key={r.id}
                className={`rounded-3xl p-4 transition-all duration-200 border shadow-xs relative overflow-hidden ${
                  expired
                    ? 'bg-rose-50/70 border-rose-200'
                    : isUrgent
                    ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30'
                    : 'bg-white border-gray-100 hover:border-amber-200'
                }`}
              >
                {/* VIP Indicator Ribbon */}
                {isUrgent && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-xs">
                    <Zap className="w-2.5 h-2.5 fill-current" />
                    <span>Yaklaşıyor ({minutesLeft} dk)</span>
                  </div>
                )}
                {expired && (
                  <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-xs">
                    <AlertCircle className="w-2.5 h-2.5 fill-current" />
                    <span>Zamanı Geldi</span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Completion Check Circle */}
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      className={`w-7 h-7 rounded-2xl border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition cursor-pointer ${
                        r.is_completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : expired
                          ? 'border-rose-400 text-rose-500 bg-white hover:bg-rose-100'
                          : isUrgent
                          ? 'border-amber-500 text-amber-600 bg-white hover:bg-amber-100'
                          : 'border-gray-300 text-gray-400 bg-white hover:border-amber-500'
                      }`}
                      title="Tamamlandı Olarak İşaretle"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          className={`text-sm font-bold text-gray-900 truncate ${
                            r.is_completed ? 'line-through text-gray-400' : ''
                          }`}
                        >
                          {r.title}
                        </h4>
                      </div>

                      {r.description && (
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {r.description}
                        </p>
                      )}

                      {/* Meta Tags */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-semibold text-gray-500">
                        <span className="flex items-center gap-1 text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded-lg border border-amber-200/50">
                          <Calendar className="w-3 h-3" />
                          <span>{format(remindDate, 'd MMMM yyyy, HH:mm', { locale: tr })}</span>
                        </span>

                        {r.repeat_interval !== 'none' && (
                          <span className="flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
                            <Repeat className="w-3 h-3" />
                            <span>
                              {r.repeat_interval === 'daily'
                                ? 'Her Gün'
                                : r.repeat_interval === 'weekly'
                                ? 'Her Hafta'
                                : 'Her Ay'}
                            </span>
                          </span>
                        )}

                        <span className="text-gray-400 font-normal">
                          {r.creator_name?.split(' ')[0] || 'Aile'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions (Snooze & Delete) */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      disabled={snoozingId === r.id}
                      onClick={() => handleSnooze(r)}
                      className="px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-[10px] font-bold text-gray-700 transition flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                      title="10 Dakika Ertele"
                    >
                      {snoozingId === r.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                      ) : (
                        <Timer className="w-3 h-3 text-amber-600" />
                      )}
                      <span>+10 Dk</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Completed Reminders Accordion */}
          {completedReminders.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Tamamlananlar ({completedReminders.length})
              </div>
              <div className="space-y-1.5 opacity-60">
                {completedReminders.map((r) => (
                  <div
                    key={r.id}
                    className="bg-gray-50 border border-gray-200/60 rounded-2xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggle(r)}
                        className="w-5 h-5 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                      <span className="text-xs font-medium text-gray-600 line-through truncate">
                        {r.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="p-1 text-gray-400 hover:text-rose-500 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIP Add Reminder Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">Hatırlatıcı Oluştur</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Önemli etkinlikleri kaçırmayın</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
                Hızlı Zaman Seçimi
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('1hour')}
                  className="px-2.5 py-2 bg-amber-50/70 hover:bg-amber-100 border border-amber-200/60 rounded-xl text-left transition cursor-pointer"
                >
                  <div className="text-xs font-bold text-amber-900">⚡ 1 Saat Sonra</div>
                  <div className="text-[10px] text-amber-700">Acil hatırlatma</div>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('tonight')}
                  className="px-2.5 py-2 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200/60 rounded-xl text-left transition cursor-pointer"
                >
                  <div className="text-xs font-bold text-indigo-900">🌙 Bu Akşam</div>
                  <div className="text-[10px] text-indigo-700">Saat 20:00</div>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('tomorrow_morning')}
                  className="px-2.5 py-2 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200/60 rounded-xl text-left transition cursor-pointer"
                >
                  <div className="text-xs font-bold text-emerald-900">☀️ Yarın Sabah</div>
                  <div className="text-[10px] text-emerald-700">Saat 09:00</div>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('weekend')}
                  className="px-2.5 py-2 bg-purple-50/70 hover:bg-purple-100 border border-purple-200/60 rounded-xl text-left transition cursor-pointer"
                >
                  <div className="text-xs font-bold text-purple-900">🎉 Hafta Sonu</div>
                  <div className="text-[10px] text-purple-700">Cumartesi 11:00</div>
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateReminder} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Hatırlatma Başlığı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Doktor randevusu, Fatura ödemesi"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Açıklama (Opsiyonel)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detaylar veya notlar..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Tarih <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Saat <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tekrar</label>
                  <select
                    value={repeatInterval}
                    onChange={(e) => setRepeatInterval(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
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
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  >
                    <option value={0}>Tam Zamanında</option>
                    <option value={15}>15 Dk Önce</option>
                    <option value={30}>30 Dk Önce</option>
                    <option value={60}>1 Saat Önce</option>
                    <option value={1440}>1 Gün Önce</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4 fill-current" />
                  )}
                  <span>Hatırlatıcıyı Kur</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
