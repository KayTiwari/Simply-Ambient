import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The previous release kept this secret in AsyncStorage. Keep the old key only
// as a migration source, then remove it as soon as the safer destination has
// accepted the value.
export const LEGACY_GEMINI_KEY = '@simply_ambient_gemini_key_v1';
const SECURE_GEMINI_KEY = 'simply_ambient_gemini_key_v2';
const WEB_SESSION_GEMINI_KEY = 'simply_ambient_gemini_key_session_v1';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let webMemoryKey = '';
let storageQueue: Promise<void> = Promise.resolve();

function enqueueStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.catch(() => {}).then(operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
}

function browserSessionStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readWebSessionKey(): string {
  try {
    return browserSessionStorage()?.getItem(WEB_SESSION_GEMINI_KEY)?.trim() || webMemoryKey;
  } catch {
    return webMemoryKey;
  }
}

function writeWebSessionKey(value: string): void {
  webMemoryKey = value;
  const storage = browserSessionStorage();
  if (value) storage?.setItem(WEB_SESSION_GEMINI_KEY, value);
  else storage?.removeItem(WEB_SESSION_GEMINI_KEY);
}

async function loadGeminiApiKeyNow(): Promise<string> {
  if (Platform.OS === 'web') {
    const sessionKey = readWebSessionKey();
    const legacyKey = (await AsyncStorage.getItem(LEGACY_GEMINI_KEY).catch(() => null))?.trim() || '';
    const key = sessionKey || legacyKey;
    if (key && !sessionKey) writeWebSessionKey(key);
    // Browser keys are intentionally session-only after this one-time upgrade.
    await AsyncStorage.removeItem(LEGACY_GEMINI_KEY).catch(() => {});
    return key;
  }

  try {
    const secureKey = (await SecureStore.getItemAsync(SECURE_GEMINI_KEY, SECURE_OPTIONS))?.trim() || '';
    if (secureKey) {
      await AsyncStorage.removeItem(LEGACY_GEMINI_KEY).catch(() => {});
      return secureKey;
    }

    const legacyKey = (await AsyncStorage.getItem(LEGACY_GEMINI_KEY).catch(() => null))?.trim() || '';
    if (!legacyKey) return '';

    await SecureStore.setItemAsync(SECURE_GEMINI_KEY, legacyKey, SECURE_OPTIONS);
    await AsyncStorage.removeItem(LEGACY_GEMINI_KEY).catch(() => {});
    return legacyKey;
  } catch {
    // Leave a legacy value untouched if secure migration fails. It can be
    // migrated on the next launch, but is never copied back into AsyncStorage.
    return '';
  }
}

async function saveGeminiApiKeyNow(value: string): Promise<void> {
  const key = value.trim();
  if (!key) return;

  if (Platform.OS === 'web') {
    writeWebSessionKey(key);
    await AsyncStorage.removeItem(LEGACY_GEMINI_KEY).catch(() => {});
    return;
  }

  await SecureStore.setItemAsync(SECURE_GEMINI_KEY, key, SECURE_OPTIONS);
  await AsyncStorage.removeItem(LEGACY_GEMINI_KEY).catch(() => {});
}

async function removeGeminiApiKeyNow(): Promise<void> {
  let failed = false;
  try {
    writeWebSessionKey('');
  } catch {
    failed = true;
  }
  try {
    await AsyncStorage.removeItem(LEGACY_GEMINI_KEY);
  } catch {
    failed = true;
  }
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(SECURE_GEMINI_KEY, SECURE_OPTIONS);
    } catch {
      failed = true;
    }
  }

  // Explicit removal and Safety > Wipe are destructive user actions. Verify
  // the end state instead of assuming a resolved platform call removed the
  // credential everywhere.
  try {
    if (await AsyncStorage.getItem(LEGACY_GEMINI_KEY)) failed = true;
  } catch {
    failed = true;
  }
  if (Platform.OS === 'web') {
    try {
      if (readWebSessionKey()) failed = true;
    } catch {
      failed = true;
    }
  } else {
    try {
      if (await SecureStore.getItemAsync(SECURE_GEMINI_KEY, SECURE_OPTIONS)) failed = true;
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error('Could not remove the Gemini key from every storage location.');
}

// Serializing operations prevents a slow per-character save from completing
// after the user has explicitly removed the key or wiped all app data.
export function loadGeminiApiKey(): Promise<string> {
  return enqueueStorageOperation(loadGeminiApiKeyNow);
}

export function saveGeminiApiKey(value: string): Promise<void> {
  return enqueueStorageOperation(() => saveGeminiApiKeyNow(value));
}

export function removeGeminiApiKey(): Promise<void> {
  return enqueueStorageOperation(removeGeminiApiKeyNow);
}
