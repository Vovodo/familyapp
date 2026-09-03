package com.aile.mobile.voice;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class VoiceActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (VoiceForegroundService.ACTION_MUTE.equals(action)) {
            VoiceChannelPlugin.emit("muteToggle");
        } else if (VoiceForegroundService.ACTION_LEAVE.equals(action)) {
            VoiceChannelPlugin.emit("leave");
        }
    }
}
