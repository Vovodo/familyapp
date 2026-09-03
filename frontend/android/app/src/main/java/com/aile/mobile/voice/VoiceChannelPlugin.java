package com.aile.mobile.voice;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VoiceChannel")
public class VoiceChannelPlugin extends Plugin {
    private static VoiceChannelPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    public static void emit(String event) {
        VoiceChannelPlugin plugin = instance;
        if (plugin == null) return;
        plugin.notifyListeners(event, new JSObject());
    }

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = baseIntent(VoiceForegroundService.ACTION_START, call);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent intent = baseIntent(VoiceForegroundService.ACTION_UPDATE, call);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), VoiceForegroundService.class);
        intent.setAction(VoiceForegroundService.ACTION_STOP);
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    private Intent baseIntent(String action, PluginCall call) {
        Intent intent = new Intent(getContext(), VoiceForegroundService.class);
        intent.setAction(action);
        if (call.getString("title") != null) {
            intent.putExtra("title", call.getString("title"));
        }
        if (call.getString("text") != null) {
            intent.putExtra("text", call.getString("text"));
        }
        if (call.getData().has("muted")) {
            intent.putExtra("muted", call.getBoolean("muted", false));
        }
        return intent;
    }

    private void startService(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
