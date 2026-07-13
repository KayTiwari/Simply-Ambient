import {
  buildTarotInterpretationPrompt,
  GEMINI_ERRORS,
  GEMINI_MODEL,
  GeminiRequestError,
  geminiHttpErrorMessage,
  geminiResponseText,
  requestGeminiReflection,
} from '../lib/gemini';

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

const successfulPayload = {
  candidates: [{ content: { parts: [{ text: 'A grounded reflection.' }] } }],
};

describe('Gemini request handling', () => {
  it('uses the stable low-latency model selected for short reflections', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.1-flash-lite');
  });

  it.each([
    [
      'leaked',
      { error: { status: 'PERMISSION_DENIED', message: 'Your API key was reported as leaked. Please use another API key.' } },
      GEMINI_ERRORS.leakedKey,
    ],
    [
      'unrestricted',
      { error: { status: 'PERMISSION_DENIED', message: 'Unrestricted Standard API key is no longer accepted.' } },
      GEMINI_ERRORS.unrestrictedKey,
    ],
    [
      'dormant',
      { error: { status: 'PERMISSION_DENIED', message: 'This dormant API key was blocked.' } },
      GEMINI_ERRORS.dormantKey,
    ],
    [
      'blocked',
      { error: { status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] } },
      GEMINI_ERRORS.blockedKey,
    ],
    [
      'project access',
      { error: { status: 'PERMISSION_DENIED', message: 'Your project has been denied access. Please contact support.' } },
      GEMINI_ERRORS.blockedProject,
    ],
  ])('classifies a %s key response without returning backend text', (_label, payload, expected) => {
    expect(geminiHttpErrorMessage(403, payload)).toBe(expected);
  });

  it('falls back to status-based copy for an unknown permission error', () => {
    expect(geminiHttpErrorMessage(403, {
      error: { status: 'PERMISSION_DENIED', message: 'project 12345 has a private internal issue' },
    })).toBe(GEMINI_ERRORS.permission);
  });

  it('joins all text response parts', () => {
    expect(geminiResponseText({
      candidates: [{ content: { parts: [{ text: 'First.' }, { text: 'Second.' }] } }],
    })).toBe('First.\nSecond.');
  });

  it.each([
    ['malformed', null, GEMINI_ERRORS.empty],
    ['empty', { candidates: [{ content: { parts: [] } }] }, GEMINI_ERRORS.empty],
    ['blocked', { promptFeedback: { blockReason: 'SAFETY' } }, GEMINI_ERRORS.blocked],
  ])('rejects a %s output with app-owned guidance', (_label, payload, expected) => {
    expect(() => geminiResponseText(payload)).toThrow(expected);
  });

  it('retries one transient HTTP failure and then returns the reflection', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(503, {
        error: { status: 'UNAVAILABLE', message: 'temporary capacity issue' },
      }))
      .mockResolvedValueOnce(response(200, successfulPayload));

    await expect(requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    })).resolves.toBe('A grounded reflection.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries an HTTP 5xx outside the common gateway statuses', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(501, { error: { status: 'INTERNAL' } }))
      .mockResolvedValueOnce(response(200, successfulPayload));

    await expect(requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    })).resolves.toBe('A grounded reflection.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries one network failure and then returns the reflection', async () => {
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(new TypeError('network request failed'))
      .mockResolvedValueOnce(response(200, successfulPayload));

    await expect(requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    })).resolves.toBe('A grounded reflection.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(403, {
      error: { status: 'PERMISSION_DENIED', message: 'Your API key was reported as leaked. Please use another API key.' },
    }));

    const promise = requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    await expect(promise).rejects.toMatchObject<Partial<GeminiRequestError>>({
      name: 'GeminiRequestError',
      userMessage: GEMINI_ERRORS.leakedKey,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, { error: { status: 'RESOURCE_EXHAUSTED' } }, GEMINI_ERRORS.quota],
    [599, { error: { status: 'INTERNAL' } }, GEMINI_ERRORS.unavailable],
  ])('stops after one retry when HTTP %i persists', async (status, payload, expected) => {
    const fetchImpl = jest.fn().mockResolvedValue(response(status, payload));

    await expect(requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    })).rejects.toMatchObject<Partial<GeminiRequestError>>({ userMessage: expected });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('times out, retries once, and returns the timeout guidance', async () => {
    const fetchImpl = jest.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
    );

    await expect(requestGeminiReflection('test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
      timeoutMs: 1,
    })).rejects.toMatchObject<Partial<GeminiRequestError>>({
      userMessage: GEMINI_ERRORS.timeout,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps the API key in a request header and out of the URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, successfulPayload));

    await requestGeminiReflection('private-test-key', 'prompt', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain('private-test-key');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'private-test-key' });
  });
});

describe('tarot interpretation prompt', () => {
  const card = {
    name: 'The Empress',
    meaning_up: 'Nurture what is growing.',
    meaning_rev: 'Notice where care has become depleted.',
    desc: 'A figure sits in a garden.',
  };

  it('uses the upright orientation and upright meaning', () => {
    const prompt = buildTarotInterpretationPrompt({ card, reversed: false });

    expect(prompt).toContain('Orientation: Upright');
    expect(prompt).toContain('Upright meaning: Nurture what is growing.');
    expect(prompt).not.toContain(card.meaning_rev);
  });

  it('uses the reversed orientation and reversed meaning', () => {
    const prompt = buildTarotInterpretationPrompt({ card, reversed: true });

    expect(prompt).toContain('Orientation: Reversed');
    expect(prompt).toContain('Reversed meaning: Notice where care has become depleted.');
    expect(prompt).not.toContain(card.meaning_up);
  });

  it('returns null for a malformed saved draw', () => {
    expect(buildTarotInterpretationPrompt({ reversed: true })).toBeNull();
  });
});
