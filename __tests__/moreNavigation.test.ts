import {
  DEFAULT_PINNED_MORE_PAGES,
  MORE_PAGE_META,
  resolveInitialMoreNavigationState,
  resolvePinnedMorePages,
  type MorePageId,
} from '../moreNavigation';

describe('resolveInitialMoreNavigationState', () => {
  it('shows a requested available room on the first painted frame', () => {
    const unavailable = new Set<MorePageId>(['natal', 'compatibility']);

    (Object.keys(MORE_PAGE_META) as MorePageId[])
      .filter(page => !unavailable.has(page))
      .forEach(page => {
        expect(resolveInitialMoreNavigationState(page)).toEqual({
          page,
          hubReveal: 0,
          pageReveal: 1,
          destination: 'page',
        });
      });
  });

  it.each([undefined, null, 'hub'])(
    'shows the hub immediately for %s',
    requestedPage => {
      expect(resolveInitialMoreNavigationState(requestedPage)).toEqual({
        page: null,
        hubReveal: 1,
        pageReveal: 0,
        destination: 'hub',
      });
    },
  );

  it.each(['natal', 'compatibility'] as const)(
    'keeps the disabled %s preview on the hub',
    requestedPage => {
      expect(resolveInitialMoreNavigationState(requestedPage)).toEqual({
        page: null,
        hubReveal: 1,
        pageReveal: 0,
        destination: 'hub',
      });
    },
  );

  it('falls back to the hub for a stale persisted page id', () => {
    expect(resolveInitialMoreNavigationState('retired-room')).toEqual({
      page: null,
      hubReveal: 1,
      pageReveal: 0,
      destination: 'hub',
    });
  });
});

describe('resolvePinnedMorePages', () => {
  it('pins soundscapes by default when nothing is stored', () => {
    expect(resolvePinnedMorePages(null)).toEqual(['soundscapes']);
  });

  it('only lists pinnable pages as defaults', () => {
    DEFAULT_PINNED_MORE_PAGES.forEach(page => {
      expect(MORE_PAGE_META[page].pinnable).toBe(true);
    });
  });

  it('keeps an explicit empty list after the user unpins everything', () => {
    expect(resolvePinnedMorePages('[]')).toEqual([]);
  });

  it('preserves stored order and drops unknown, unpinnable, or duplicate entries', () => {
    const raw = JSON.stringify(['mood', 'settings', 'retired-room', 'soundscapes', 'mood']);
    expect(resolvePinnedMorePages(raw)).toEqual(['mood', 'soundscapes']);
  });

  it.each(['not json', '"soundscapes"', '{}'])(
    'falls back to the defaults for unreadable storage %s',
    raw => {
      expect(resolvePinnedMorePages(raw)).toEqual(['soundscapes']);
    },
  );
});
