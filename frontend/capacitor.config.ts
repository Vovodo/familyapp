import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aile.mobile',
  appName: 'Ailem ❤️',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#CA374C',
      sound: 'beep.wav',
    },
    Camera: {
      presentationStyle: 'fullscreen',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#CA374C',
    },
  },
};

export default config;
