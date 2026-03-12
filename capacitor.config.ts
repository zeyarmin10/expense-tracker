import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethan.expensetracker',
  appName: 'Expense Tracker',
  webDir: 'dist/expense-tracker/browser', // Angular 17+ output path
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F2340',
      overlaysWebView: false
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0F2340',
      showSpinner: false
    },
    
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '114245767214-70122qvh2g7qor3cc4udhghkk4h2s179.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    }
  }
};

export default config;