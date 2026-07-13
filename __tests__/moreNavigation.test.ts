import {
  MORE_PAGE_META,
  resolveInitialMoreNavigationState,
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
