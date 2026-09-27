import {
  parseQuickAction,
  parseShortcutUrl,
  shortcutPathSegments,
  QUICK_ACTIONS,
} from '../lib/shortcuts';

describe('shortcut URLs', () => {
  it('reads the app scheme and Expo development links alike', () => {
    expect(shortcutPathSegments('simplyambient://routine/deep-sleep')).toEqual(['routine', 'deep-sleep']);
    expect(shortcutPathSegments('exp://192.168.1.4:8081/--/routine/deep-sleep?x=1')).toEqual(['routine', 'deep-sleep']);
    expect(shortcutPathSegments('SimplyAmbient://Breathe/Box#frag')).toEqual(['breathe', 'box']);
    expect(shortcutPathSegments('https://binaural.vercel.app/routine/deep-sleep')).toEqual([]);
    expect(shortcutPathSegments('')).toEqual([]);
  });

  it('resolves routines, techniques, soundscapes, rooms, and tabs', () => {
    expect(parseShortcutUrl('simplyambient://routine/deep-sleep')).toEqual({ kind: 'routine', id: 'deep-sleep' });
    expect(parseShortcutUrl('simplyambient://routine/unknown')).toEqual({ kind: 'more', page: 'routines' });
    expect(parseShortcutUrl('simplyambient://breathe/box')).toEqual({ kind: 'breathe', techniqueId: 'box' });
    expect(parseShortcutUrl('simplyambient://breathe/notreal')).toEqual({ kind: 'breathe', techniqueId: null });
    expect(parseShortcutUrl('simplyambient://breathe')).toEqual({ kind: 'breathe', techniqueId: null });
    expect(parseShortcutUrl('simplyambient://soundscape/boxfan')).toEqual({ kind: 'soundscape', id: 'boxfan' });
    expect(parseShortcutUrl('simplyambient://soundscapes')).toEqual({ kind: 'more', page: 'soundscapes' });
    expect(parseShortcutUrl('simplyambient://more/mood')).toEqual({ kind: 'more', page: 'mood' });
    expect(parseShortcutUrl('simplyambient://more')).toEqual({ kind: 'more', page: 'hub' });
    expect(parseShortcutUrl('simplyambient://tones')).toEqual({ kind: 'tones' });
    expect(parseShortcutUrl('simplyambient://nothing/here')).toBeNull();
    expect(parseShortcutUrl(null)).toBeNull();
  });

  it('resolves quick actions by href, then by id', () => {
    expect(parseQuickAction({ id: 'x', params: { href: 'simplyambient://breathe/478' } }))
      .toEqual({ kind: 'breathe', techniqueId: '478' });
    expect(parseQuickAction({ id: 'routine-deep-sleep' })).toEqual({ kind: 'routine', id: 'deep-sleep' });
    expect(parseQuickAction({ id: 'stale-item' })).toBeNull();
    expect(parseQuickAction(null)).toBeNull();
  });

  it('registers at most four quick actions, each resolvable', () => {
    expect(QUICK_ACTIONS.length).toBeLessThanOrEqual(4);
    for (const item of QUICK_ACTIONS) {
      expect(parseShortcutUrl(item.params.href)).not.toBeNull();
    }
  });
});
