package com.aile.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Android Foreground Service — SSE tabanlı arka plan bildirimi.
 * Firebase olmadan, uygulama tamamen kapalıyken bile çalışır.
 *
 * Kritik özellikler:
 *  - START_STICKY: OS tarafından öldürülse otomatik yeniden başlar
 *  - stopWithTask=false (Manifest): Kullanıcı uygulamayı kapatınca DURMAZ
 *  - onTaskRemoved: Uygulama sürüklendiğinde servisi AlarmManager ile yeniden zamanlar
 *  - onStartCommand null intent: Servis OS tarafından yeniden başlatıldığında foreground devam eder
 */
public class FamilyNotificationService extends Service {

    private static final String TAG = "FamilyNotifService";

    public static final String CHANNEL_ID_FOREGROUND = "ailem_foreground_service";
    public static final String CHANNEL_ID_HEART = "family_heart_channel";
    public static final String CHANNEL_ID_GENERAL = "family_general_channel";

    public static final String ACTION_START = "START_SSE";
    public static final String ACTION_STOP = "STOP_SSE";

    // Capacitor Preferences → SharedPreferences key prefix
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final long[] HEART_VIBRATION = {0, 500, 200, 500, 200, 500, 200, 500};

    private ExecutorService executor;
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private Handler mainHandler;

    // Son alınan bildirimi tekrar göstermemek için
    private String lastHeartId = "";

    @Override
    public void onCreate() {
        super.onCreate();
        executor = Executors.newSingleThreadExecutor();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannels();
        Log.d(TAG, "Service onCreate");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand: intent=" + (intent != null ? intent.getAction() : "null(restart)"));

        // ÖNCE foreground başlat — hem normal başlatmada hem OS'un null intent ile restart'ında
        Notification notification = buildForegroundNotification();
        startForeground(1001, notification);

        // Durdurma isteği
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSseLoop();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // SSE döngüsünü başlat (zaten çalışmıyorsa)
        if (!isRunning.get()) {
            startSseLoop();
        }

        return START_STICKY;
    }

    /**
     * Kullanıcı uygulamayı kapatınca (sürükleyince) çağrılır.
     * AlarmManager ile 2 saniye sonra servisi yeniden başlatır.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.d(TAG, "onTaskRemoved — scheduling restart in 2s");

        Intent restartIntent = new Intent(getApplicationContext(), FamilyNotificationService.class);
        restartIntent.setAction(ACTION_START);
        restartIntent.setPackage(getPackageName());

        int flags = PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getService(
            getApplicationContext(), 1, restartIntent, flags
        );

        AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            long triggerAt = SystemClock.elapsedRealtime() + 2000; // 2 saniye sonra
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            }
        }

        super.onTaskRemoved(rootIntent);
    }

    // ─────────────────────────────────────────────
    // SSE Ana Döngüsü
    // ─────────────────────────────────────────────

    private void startSseLoop() {
        isRunning.set(true);
        executor.execute(() -> {
            Log.d(TAG, "SSE loop started");
            while (isRunning.get()) {
                try {
                    String token = getAuthToken();
                    String familyId = getActiveFamilyId();

                    if (token == null || token.isEmpty() || familyId == null || familyId.isEmpty()) {
                        Log.d(TAG, "No credentials yet, retrying in 10s...");
                        Thread.sleep(10000);
                        continue;
                    }

                    Log.d(TAG, "Connecting SSE for family=" + familyId);
                    connectAndListen(token, familyId);
                    Log.d(TAG, "SSE disconnected, reconnecting in 5s...");
                    Thread.sleep(5000);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    Log.w(TAG, "SSE error: " + e.getMessage() + " — retry in 8s");
                    try { Thread.sleep(8000); } catch (InterruptedException ie) { break; }
                }
            }
            Log.d(TAG, "SSE loop ended");
        });
    }

    private void connectAndListen(String token, String familyId) throws Exception {
        String sseUrl = getApiBaseUrl() + "/api/v1/events/family/" + familyId + "/stream";
        Log.d(TAG, "SSE → " + sseUrl);

        URL url = new URL(sseUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Accept", "text/event-stream");
        conn.setRequestProperty("Cache-Control", "no-cache");
        conn.setRequestProperty("Connection", "keep-alive");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(120000); // 2 dakika (backend her 30s ping atar)
        conn.setDoInput(true);
        conn.connect();

        int code = conn.getResponseCode();
        if (code != 200) {
            Log.w(TAG, "SSE HTTP " + code + " — closing");
            conn.disconnect();
            return;
        }

        Log.d(TAG, "SSE connected ✓");

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            String line;
            StringBuilder dataBuf = new StringBuilder();

            while (isRunning.get() && (line = reader.readLine()) != null) {
                if (line.startsWith("data:")) {
                    dataBuf.append(line.substring(5).trim());
                } else if (line.isEmpty() && dataBuf.length() > 0) {
                    processEvent(dataBuf.toString(), familyId);
                    dataBuf.setLength(0);
                }
            }
        }

        conn.disconnect();
        Log.d(TAG, "SSE stream ended");
    }

    private void processEvent(String jsonStr, String myFamilyId) {
        try {
            JSONObject event = new JSONObject(jsonStr);
            String type = event.optString("type", "");
            String eventFamilyId = event.optString("family_id", "");

            // Aile izolasyonu
            if (!eventFamilyId.isEmpty() && !eventFamilyId.equals(myFamilyId)) {
                Log.d(TAG, "Ignoring event for different family: " + eventFamilyId);
                return;
            }

            if ("heart".equals(type)) {
                String heartId = event.optString("heart_id", "");
                // Tekrar bildirimi önle
                if (heartId.equals(lastHeartId)) return;
                lastHeartId = heartId;

                String senderName = event.optString("sender_name", "Aile Bireyi");
                String message = event.optString("message", senderName + " size bir kalp gönderdi ❤️");

                Log.d(TAG, "HEART from " + senderName + " — showing notification!");
                final String finalSenderName = senderName;
                final String finalMessage = message;
                final String finalHeartId = heartId;
                mainHandler.post(() -> {
                    showHeartNotification(finalSenderName, finalMessage, finalHeartId);
                    vibrateHeart();
                });

            } else if ("ping".equals(type)) {
                Log.v(TAG, "Ping ✓");
            } else if ("connected".equals(type)) {
                Log.d(TAG, "SSE confirmed connected: " + event.optString("family_id"));
            }
        } catch (Exception e) {
            Log.w(TAG, "processEvent error: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    // Bildirim Gösterimi
    // ─────────────────────────────────────────────

    private void showHeartNotification(String senderName, String message, String heartId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("type", "heart");
        intent.putExtra("heartId", heartId);

        int reqCode = (int) (System.currentTimeMillis() % 100000);
        PendingIntent pi = PendingIntent.getActivity(
            this, reqCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notif;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notif = new Notification.Builder(this, CHANNEL_ID_HEART)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle("❤️ Aileden bir kalp")
                .setContentText(message)
                .setSubText(senderName)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setVibrate(HEART_VIBRATION)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build();
        } else {
            notif = new Notification.Builder(this)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle("❤️ Aileden bir kalp")
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setVibrate(HEART_VIBRATION)
                .setPriority(Notification.PRIORITY_HIGH)
                .build();
        }

        int notifId = (int) (System.currentTimeMillis() % 10000) + 2000;
        nm.notify(notifId, notif);
        Log.d(TAG, "Heart notification shown #" + notifId);
    }

    private void vibrateHeart() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    v.vibrate(VibrationEffect.createWaveform(HEART_VIBRATION, -1));
                }
            } else {
                @SuppressWarnings("deprecation")
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createWaveform(HEART_VIBRATION, -1));
                    } else {
                        v.vibrate(HEART_VIBRATION, -1);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration error: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    // Kanal ve Bildirim Oluşturma
    // ─────────────────────────────────────────────

    private Notification buildForegroundNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL_ID_FOREGROUND)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Ailem Aktif 💚")
                .setContentText("Kalp bildirimleri izleniyor — arka planda çalışıyor")
                .setOngoing(true)
                .setContentIntent(pi)
                .setVisibility(Notification.VISIBILITY_SECRET)
                .build();
        } else {
            return new Notification.Builder(this)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Ailem Aktif 💚")
                .setContentText("Kalp bildirimleri izleniyor")
                .setOngoing(true)
                .setContentIntent(pi)
                .setPriority(Notification.PRIORITY_MIN)
                .build();
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // Arka plan servisi kanalı — sessiz, minimal
            NotificationChannel fgCh = new NotificationChannel(
                CHANNEL_ID_FOREGROUND, "Arka Plan Servisi", NotificationManager.IMPORTANCE_MIN
            );
            fgCh.setDescription("Ailem aktif servis — kalp bildirimlerini izler");
            fgCh.setShowBadge(false);
            fgCh.enableVibration(false);
            fgCh.enableLights(false);
            nm.createNotificationChannel(fgCh);

            // Kalp kanalı — maksimum öncelik
            NotificationChannel heartCh = new NotificationChannel(
                CHANNEL_ID_HEART, "Aile Kalp Bildirimleri ❤️", NotificationManager.IMPORTANCE_HIGH
            );
            heartCh.setDescription("Aileden gelen kalpler — anlık titreşim ve bildirim");
            heartCh.enableVibration(true);
            heartCh.setVibrationPattern(HEART_VIBRATION);
            heartCh.enableLights(true);
            heartCh.setLightColor(0xFFE11D48);
            heartCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(heartCh);

            // Genel kanal
            NotificationChannel genCh = new NotificationChannel(
                CHANNEL_ID_GENERAL, "Aile Bildirimleri", NotificationManager.IMPORTANCE_DEFAULT
            );
            genCh.setDescription("Mesajlar ve hatırlatıcılar");
            nm.createNotificationChannel(genCh);
        }
    }

    // ─────────────────────────────────────────────
    // Yardımcı Metotlar
    // ─────────────────────────────────────────────

    /**
     * Capacitor Preferences → Android SharedPreferences.
     * @capacitor/preferences key "auth_token" → "_cap_auth_token"
     */
    private String getAuthToken() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String token = prefs.getString("_cap_auth_token", null);
            if (token == null) token = prefs.getString("auth_token", null);
            // JSON string ise tırnak temizle
            if (token != null) token = token.replace("\"", "").trim();
            return token;
        } catch (Exception e) {
            Log.w(TAG, "getAuthToken error: " + e);
            return null;
        }
    }

    private String getActiveFamilyId() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String id = prefs.getString("_cap_active_family_id", null);
            if (id == null) id = prefs.getString("active_family_id", null);
            if (id != null) id = id.replace("\"", "").trim();
            return id;
        } catch (Exception e) {
            Log.w(TAG, "getActiveFamilyId error: " + e);
            return null;
        }
    }

    private String getApiBaseUrl() {
        return "https://familyapi.rfqcollector.com";
    }

    private void stopSseLoop() {
        isRunning.set(false);
        if (executor != null && !executor.isShutdown()) {
            executor.shutdownNow();
        }
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "Service onDestroy");
        stopSseLoop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
