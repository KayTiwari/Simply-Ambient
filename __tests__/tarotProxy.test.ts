const handler = require('../api/tarot').default as (
  req: { query: Record<string, string> },
  res: {
    setHeader: jest.Mock;
    status: jest.Mock;
  },
) => Promise<void>;

describe('tarot web proxy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function responseHarness() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    return { json, status, setHeader };
  }

  test('keeps the default draw major-only', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ nhits: 1, cards: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = responseHarness();

    await handler({ query: { n: '3' } }, res);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://freehoroscopeapi.com/api/v1/tarot/cards/random?n=3',
    );
  });

  test('forwards the minor arcana deck option', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ nhits: 5, cards: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = responseHarness();

    await handler({ query: { n: '5', minor: 'true' } }, res);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://freehoroscopeapi.com/api/v1/tarot/cards/random?n=5&minor=true',
    );
  });
});
