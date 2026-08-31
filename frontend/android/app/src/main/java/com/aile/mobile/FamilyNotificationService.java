package com.aile.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
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
 * Native Android Foreground Service that maintains an SSE connection to the backend.
 * Works even when the WebView (Capacitor) is killed, providing real-time notifications
 * without requiring Firebase/FCM.
 */
public class FamilyNotificationService extends Service {

    private static final String TAG = "FamilyNotifService";

    public static final String CHANNEL_ID_FOREGROUND = "ailem_foreground_service";
    public static final String CHANNEL_ID_HEART = "family_heart_channel";
    public static final String CHANNEL_ID_GENERAL = "family_general_channel";

    public static final String ACTION_START = "START_SSE";
    public static final String ACTION_STOP = "STOP_SSE";

    private static final String PREFS_NAME = "CapacitorStorage";
    private static final long[] HEART_VIBRATION = {0, 500, 200, 500, 200, 500, 200, 500};

    private ExecutorService executor;
    private AtomicBoolean isRunning = new AtomicBoolean(false);
    private Handler mainHandler;

    @Override
    public void onCreate() {
        super.onCreate();
        executor = Executors.newSingleThreadExecutor();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopSseLoop();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Start as foreground service with subtle persistent notification
        Notification notification = buildForegroundNotification();
        startForeground(1001, notification);

        if (!isRunning.get()) {
            startSseLoop();
        }

        return START_STICKY;
    }

    private void startSseLoop() {
        isRunning.set(true);
        executor.execute(() -> {
            while (isRunning.get()) {
                try {
                    String token = getAuthToken();
                    String familyId = getActiveFamilyId();

                    if (token == null || token.isEmpty() || familyId == null || familyId.isEmpty()) {
                        Log.d(TAG, "No auth token or family ID. Waiting 15s...");
                        Thread.sleep(15000);
                        continue;
                    }

                    connectAndListen(token, familyId);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    Log.e(TAG, "SSE connection error: " + e.getMessage());
                    try {
                        Thread.sleep(10000); // Retry after 10s
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        });
    }

    private void connectAndListen(String token, String familyId) throws Exception {
        // Backend SSE endpoint
        String apiBase = getApiBaseUrl();
        String sseUrl = apiBase + "/api/v1/events/family/" + familyId + "/stream";
        Log.d(TAG, "Connecting to SSE: " + sseUrl);

        URL url = new URL(sseUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Accept", "text/event-stream");
        conn.setRequestProperty("Cache-Control", "no-cache");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(90000); // 90s read timeout (longer than 30s keepalive)
        conn.connect();

        int responseCode = conn.getResponseCode();
        if (responseCode != 200) {
            Log.w(TAG, "SSE connection failed: HTTP " + responseCode);
            conn.disconnect();
            return;
        }

        Log.d(TAG, "SSE connected! Listening for events...");

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
            String line;
            StringBuilder dataBuilder = new StringBuilder();

            while (isRunning.get() && (line = reader.readLine()) != null) {
                if (line.startsWith("data:")) {
                    String jsonStr = line.substring(5).trim();
                    dataBuilder.append(jsonStr);
                } else if (line.isEmpty() && dataBuilder.length() > 0) {
                    // Full SSE event received
                    String eventJson = dataBuilder.toString();
                    dataBuilder.setLength(0);
                    processEvent(eventJson, familyId);
                }
            }
        }

        conn.disconnect();
        Log.d(TAG, "SSE connection ended. Will reconnect.");
    }

    private void processEvent(String jsonStr, String myFamilyId) {
        try {
            JSONObject event = new JSONObject(jsonStr);
            String type = event.optString("type", "");
            String eventFamilyId = event.optString("family_id", "");

            // Family isolation check
            if (!eventFamilyId.isEmpty() && !eventFamilyId.equals(myFamilyId)) {
                return;
            }

            if ("heart".equals(type)) {
                String senderName = event.optString("sender_name", "Aile Bireyi");
                String heartId = event.optString("heart_id", "");
                String message = event.optString("message", senderName + " size bir kalp gönderdi ❤️");

                Log.d(TAG, "HEART_EVENT: " + senderName + " sent a heart!");
                mainHandler.post(() -> {
                    showHeartNotification(senderName, message, heartId);
                    vibrateHeart();
                });

            } else if ("ping".equals(type)) {
                Log.v(TAG, "SSE ping received");
            }
        } catch (Exception e) {
            Log.w(TAG, "Error parsing SSE event: " + e.getMessage());
        }
    }

    private void showHeartNotification(String senderName, String message, String heartId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("type", "heart");
        intent.putExtra("heartId", heartId);

        int requestCode = (int) (System.currentTimeMillis() % 100000);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID_HEART);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("❤️ Aileden bir kalp")
            .setContentText(message)
            .setSubText(senderName)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVibrate(HEART_VIBRATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_MESSAGE);
            builder.setVisibility(Notification.VISIBILITY_PUBLIC);
        }

        int notifId = (int) (System.currentTimeMillis() % 10000) + 2000;
        nm.notify(notifId, builder.build());
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

    private Notification buildForegroundNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID_FOREGROUND);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_MIN);
        }

        builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Ailem Aktif 💚")
            .setContentText("Aile bildirimleri etkin - kalp ve mesajlar takip ediliyor")
            .setOngoing(true)
            .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setVisibility(Notification.VISIBILITY_SECRET);
        }

        return builder.build();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // Foreground service channel (minimal)
            NotificationChannel fgChannel = new NotificationChannel(
                CHANNEL_ID_FOREGROUND,
                "Arka Plan Servisi",
                NotificationManager.IMPORTANCE_MIN
            );
            fgChannel.setDescription("Ailem aktif bildirim servisi");
            fgChannel.setShowBadge(false);
            nm.createNotificationChannel(fgChannel);

            // Heart notification channel (high priority)
            NotificationChannel heartChannel = new NotificationChannel(
                CHANNEL_ID_HEART,
                "Aile Kalp Bildirimleri ❤️",
                NotificationManager.IMPORTANCE_HIGH
            );
            heartChannel.setDescription("Aile kalp göndermelerinden anlık bildirim ve titreşim");
            heartChannel.enableVibration(true);
            heartChannel.setVibrationPattern(HEART_VIBRATION);
            heartChannel.enableLights(true);
            heartChannel.setLightColor(0xFFE11D48);
            heartChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(heartChannel);

            // General channel
            NotificationChannel generalChannel = new NotificationChannel(
                CHANNEL_ID_GENERAL,
                "Aile Genel Bildirimleri",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            generalChannel.setDescription("Mesajlar ve hatırlatıcılar");
            nm.createNotificationChannel(generalChannel);
        }
    }

    private String getAuthToken() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        // Capacitor Preferences stores keys as _cap_<key>
        String token = prefs.getString("_cap_auth_token", null);
        if (token == null) {
            token = prefs.getString("auth_token", null);
        }
        // Remove surrounding quotes if stored as JSON string
        if (token != null) {
            token = token.replace("\"", "").trim();
        }
        return token;
    }

    private String getActiveFamilyId() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String familyId = prefs.getString("_cap_active_family_id", null);
        if (familyId == null) {
            familyId = prefs.getString("active_family_id", null);
        }
        if (familyId != null) {
            familyId = familyId.replace("\"", "").trim();
        }
        return familyId;
    }

    private String getApiBaseUrl() {
        // Read from Capacitor config; falls back to production URL
        return "https://familyapi.rfqcollector.com";
    }

    private void stopSseLoop() {
        isRunning.set(false);
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Override
    public void onDestroy() {
        stopSseLoop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
