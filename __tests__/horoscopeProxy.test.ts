const handler = require('../api/horoscope').default as (
  req: { query: Record<string, string> },
  res: {
    setHeader: jest.Mock;
    status: jest.Mock;
  },
) => Promise<void>;

describe('horoscope web proxy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('routes weekly readings to the upstream weekly endpoint', async () => {
    const payload = {
      data: {
        date: '2026-07-06',
        period: 'weekly',
        sign: 'Aries',
        horoscope: 'A weekly reading.',
      },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();

    await handler(
      { query: { period: 'weekly', sign: 'Aries' } },
      { setHeader, status },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://freehoroscopeapi.com/api/v1/get-horoscope/weekly?sign=Aries',
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(payload);
  });
});
