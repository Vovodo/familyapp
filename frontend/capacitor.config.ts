import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aile.mobile',
  appName: 'Ailem',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1A1230',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#CA374C',
      sound: 'beep.wav',
    },
    Camera: {
      presentationStyle: 'fullscreen',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1A1230',
    },
  },
};

export default config;
