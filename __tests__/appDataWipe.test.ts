import {
  appOwnedDocumentPickerCacheUri,
  appOwnedStorageKeys,
  removeAndVerifyAppStorage,
  type AppStorage,
} from '../lib/appDataWipe';

describe('app data wipe helpers', () => {
  it('selects only Simply Ambient storage namespaces', () => {
    expect(appOwnedStorageKeys([
      '@simply_ambient_profile_v1',
      '@binaural_user_presets_v1',
      '@another_app_setting',
      'unprefixed',
    ])).toEqual([
      '@simply_ambient_profile_v1',
      '@binaural_user_presets_v1',
    ]);
  });

  it('removes all app keys without touching other AsyncStorage clients', async () => {
    let keys = [
      '@simply_ambient_profile_v1',
      '@binaural_user_presets_v1',
      '@another_app_setting',
    ];
    const storage: AppStorage = {
      getAllKeys: jest.fn(async () => keys),
      multiRemove: jest.fn(async removed => {
        keys = keys.filter(key => !removed.includes(key));
      }),
    };

    await expect(removeAndVerifyAppStorage(storage)).resolves.toBeUndefined();
    expect(storage.multiRemove).toHaveBeenCalledWith([
      '@simply_ambient_profile_v1',
      '@binaural_user_presets_v1',
    ]);
    expect(keys).toEqual(['@another_app_setting']);
  });

  it('rejects a partial wipe instead of reporting success', async () => {
    const storage: AppStorage = {
      getAllKeys: jest
        .fn<Promise<readonly string[]>, []>()
        .mockResolvedValueOnce(['@simply_ambient_profile_v1'])
        .mockResolvedValueOnce(['@simply_ambient_profile_v1']),
      multiRemove: jest.fn(async () => {}),
    };

    await expect(removeAndVerifyAppStorage(storage)).rejects.toThrow(
      'App storage still contains data after removal.',
    );
  });

  it('targets only the DocumentPicker-owned cache directory', () => {
    expect(appOwnedDocumentPickerCacheUri('file:///app/cache/')).toBe(
      'file:///app/cache/DocumentPicker',
    );
    expect(appOwnedDocumentPickerCacheUri(null)).toBeNull();
  });
});
