package com.aile.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager == null) return;

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();

            String[] legacyIds = {
                    "family_heart_channel",
                    "family_tea_channel",
                    "family_car_channel",
                    "family_meal_channel",
                    "family_poke_channel"
            };
            for (String legacyId : legacyIds) {
                try {
                    notificationManager.deleteNotificationChannel(legacyId);
                } catch (Exception ignored) {
                }
            }

            // 1. General & Chat Messages Channel
            NotificationChannel generalChannel = new NotificationChannel(
                    "family_general_channel",
                    "Aile Mesajları & Bildirimleri",
                    NotificationManager.IMPORTANCE_HIGH
            );
            generalChannel.setDescription("Sohbet mesajları, alışveriş listesi ve görev bildirimleri");
            generalChannel.enableVibration(true);
            generalChannel.enableLights(true);
            generalChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(generalChannel);

            createCustomChannel(notificationManager, "family_heart_channel_v2", "Kalp & Sevgi Bildirimleri", "heart", audioAttributes);
            createCustomChannel(notificationManager, "family_tea_channel_v2", "Çay Koydum Bildirimleri", "tea", audioAttributes);
            createCustomChannel(notificationManager, "family_car_channel_v2", "Eve Geliyorum Bildirimleri", "car_horn", audioAttributes);
            createCustomChannel(notificationManager, "family_meal_channel_v2", "Yemek Hazır Bildirimleri", "meal", audioAttributes);
            createCustomChannel(notificationManager, "family_poke_channel_v2", "Dürtme Bildirimleri", "poke", audioAttributes);

            // 7. Reminders Channel
            NotificationChannel remindersChannel = new NotificationChannel(
                    "family_reminders_channel",
                    "Hatırlatıcılar & Alarmlar",
                    NotificationManager.IMPORTANCE_HIGH
            );
            remindersChannel.setDescription("Önemli aile ve kişisel hatırlatma alarmları");
            remindersChannel.enableVibration(true);
            remindersChannel.enableLights(true);
            remindersChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(remindersChannel);
        }
    }

    private void createCustomChannel(NotificationManager manager, String channelId, String name, String rawSoundName, AudioAttributes audioAttributes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    name,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(name);
            channel.enableVibration(true);
            channel.enableLights(true);
            channel.setShowBadge(true);
            channel.setBypassDnd(true);

            try {
                Uri soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/" + rawSoundName);
                channel.setSound(soundUri, audioAttributes);
            } catch (Exception e) {
                // Fallback
            }
            manager.createNotificationChannel(channel);
        }
    }
}
