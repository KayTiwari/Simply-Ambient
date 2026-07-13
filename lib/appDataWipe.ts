export const APP_STORAGE_PREFIXES = ['@simply_ambient_', '@binaural_'] as const;

export type AppStorage = {
  getAllKeys: () => Promise<readonly string[]>;
  multiRemove: (keys: string[]) => Promise<void>;
};

export function appOwnedStorageKeys(keys: readonly string[]): string[] {
  return keys.filter(key => APP_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix)));
}

/**
 * Remove every app-owned AsyncStorage entry and prove the removal completed.
 * The verification matters for the destructive Safety action: a rejected or
 * partial native storage operation must never be presented as a successful
 * wipe.
 */
export async function removeAndVerifyAppStorage(storage: AppStorage): Promise<void> {
  const initialKeys = appOwnedStorageKeys(await storage.getAllKeys());
  if (initialKeys.length > 0) await storage.multiRemove(initialKeys);

  const remainingKeys = appOwnedStorageKeys(await storage.getAllKeys());
  if (remainingKeys.length > 0) {
    throw new Error('App storage still contains data after removal.');
  }
}

export function appOwnedDocumentPickerCacheUri(cacheDirectory: string | null): string | null {
  if (!cacheDirectory) return null;
  return `${cacheDirectory.replace(/\/+$/, '')}/DocumentPicker`;
}
