import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth, indexedDBLocalPersistence } from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;
let activeDatabaseUrl = '';

export function getFirebaseForVoice(config: FirebaseWebConfig): { app: FirebaseApp; auth: Auth; database: Database } {
  if (!config?.apiKey || !config.databaseURL) {
    throw new Error('Firebase ses yapılandırması eksik.');
  }

  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
  }

  if (!auth) {
    try {
      auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    } catch {
      auth = getAuth(app);
    }
  }

  if (!database || activeDatabaseUrl !== config.databaseURL) {
    database = getDatabase(app, config.databaseURL);
    activeDatabaseUrl = config.databaseURL;
  }

  return { app, auth, database };
}
