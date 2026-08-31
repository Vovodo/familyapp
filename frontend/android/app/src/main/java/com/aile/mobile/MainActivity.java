package com.aile.mobile;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Start the standalone background notification service (no Firebase required)
        startFamilyNotificationService();
    }

    @Override
    public void onResume() {
        super.onResume();
        startFamilyNotificationService();
    }

    private void startFamilyNotificationService() {
        try {
            Intent serviceIntent = new Intent(this, FamilyNotificationService.class);
            serviceIntent.setAction(FamilyNotificationService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            // Silently ignore if service can't start
        }
    }
}
