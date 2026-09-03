package com.aile.mobile.voice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.aile.mobile.MainActivity;

public class VoiceForegroundService extends Service {
    public static final String CHANNEL_ID = "family_voice_channel";
    public static final int NOTIFICATION_ID = 7101;

    public static final String ACTION_START = "com.aile.mobile.voice.START";
    public static final String ACTION_UPDATE = "com.aile.mobile.voice.UPDATE";
    public static final String ACTION_STOP = "com.aile.mobile.voice.STOP";
    public static final String ACTION_MUTE = "com.aile.mobile.voice.MUTE";
    public static final String ACTION_LEAVE = "com.aile.mobile.voice.LEAVE";
    public static final String ACTION_RETURN = "com.aile.mobile.voice.RETURN";

    private PowerManager.WakeLock wakeLock;
    private String title = "Ses Kanalı";
    private String text = "Bağlı";
    private boolean muted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ailem:voice");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_STICKY;
        }
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForegroundInternal();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent.hasExtra("title")) {
            title = intent.getStringExtra("title");
        }
        if (intent.hasExtra("text")) {
            text = intent.getStringExtra("text");
        }
        if (intent.hasExtra("muted")) {
            muted = intent.getBooleanExtra("muted", false);
        }

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else if (Build.VERSION.SDK_INT >= 29) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire();
        }
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopForegroundInternal();
        super.onDestroy();
    }

    private void stopForegroundInternal() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        stopForeground(true);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Aile Ses Kanalı",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Ses kanalındayken devam eden bildirim");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction(ACTION_RETURN);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        openIntent.putExtra("open_path", "/chat");
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            11,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
        );

        PendingIntent returnAction = PendingIntent.getActivity(
            this,
            12,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
        );

        Intent muteIntent = new Intent(this, VoiceActionReceiver.class);
        muteIntent.setAction(ACTION_MUTE);
        PendingIntent muteAction = PendingIntent.getBroadcast(
            this,
            13,
            muteIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
        );

        Intent leaveIntent = new Intent(this, VoiceActionReceiver.class);
        leaveIntent.setAction(ACTION_LEAVE);
        PendingIntent leaveAction = PendingIntent.getBroadcast(
            this,
            14,
            leaveIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()
        );

        String muteLabel = muted ? "Sesi Aç" : "Sessize Al";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(contentIntent)
            .addAction(android.R.drawable.ic_menu_revert, "Uygulamaya Dön", returnAction)
            .addAction(android.R.drawable.ic_lock_silent_mode, muteLabel, muteAction)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Ayrıl", leaveAction);

        return builder.build();
    }

    private int immutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }
}
