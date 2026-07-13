// Gemini request helpers live outside the view so error handling and retry
// behavior can be tested without mounting React Native.

export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

const GEMINI_GENERATE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 700;
const MAX_ATTEMPTS = 2;

export const GEMINI_ERRORS = {
  invalidRequest:
    'Gemini did not accept the key or request. Review this key in Google AI Studio and try again.',
  precondition:
    'Gemini needs billing enabled for this project or is unavailable in your region. Check the project in Google AI Studio.',
  unauthenticated:
    'Gemini could not authenticate this key. Create or review it in Google AI Studio and try again.',
  permission:
    'This key does not have permission to use Gemini. Review its project and Gemini API access in Google AI Studio.',
  leakedKey:
    'Google blocked this key after detecting it as exposed. Revoke it and create a new auth key in Google AI Studio.',
  unrestrictedKey:
    'Google no longer accepts unrestricted Standard keys. Restrict this key to the Gemini API or create a new auth key in Google AI Studio.',
  dormantKey:
    'Google blocked this key after a period of inactivity. Create a new auth key in Google AI Studio.',
  blockedKey:
    'Google has blocked this key. Check its status in Google AI Studio and create a new auth key if needed.',
  blockedProject:
    'Google has blocked this project or account from Gemini API access. Check the Projects and Billing pages in Google AI Studio.',
  notFound:
    'This Gemini service or model is unavailable. Update the app, then try again.',
  quota:
    'This Gemini project has reached a rate or usage limit. Wait a little or check its quota in Google AI Studio.',
  unavailable:
    'Gemini is temporarily unavailable. Please try again in a little while.',
  timeout:
    'Gemini took too long to respond. Check your connection and try again.',
  network:
    'Could not reach Gemini. Check your connection and try again.',
  blocked:
    'Gemini\'s safety filters did not return a reflection for this selection. Try fewer or different sources.',
  empty:
    'Gemini returned no reflection. Please try again.',
  generic:
    'Gemini could not process this request. Please try again.',
} as const;

export class GeminiRequestError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'GeminiRequestError';
  }
}

type GeminiApiError = {
  status?: unknown;
  message?: unknown;
  details?: unknown;
};

function geminiApiError(payload: unknown): GeminiApiError | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: unknown }).error;
  return error && typeof error === 'object' ? error as GeminiApiError : null;
}

function geminiApiStatus(payload: unknown): string | null {
  const status = geminiApiError(payload)?.status;
  return typeof status === 'string' ? status : null;
}

function geminiApiSafeReasonText(payload: unknown): string {
  const error = geminiApiError(payload);
  if (!error) return '';

  const fragments: string[] = [];
  if (typeof error.message === 'string') fragments.push(error.message);
  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (!detail || typeof detail !== 'object') continue;
      const reason = (detail as { reason?: unknown }).reason;
      if (typeof reason === 'string') fragments.push(reason);
    }
  }
  return fragments.join(' ').toLowerCase();
}

// The backend message is never returned or logged. Only a short allowlist of
// known key-state phrases is classified into app-owned guidance.
function geminiKeyStateError(payload: unknown): string | null {
  const reason = geminiApiSafeReasonText(payload);
  if (!reason) return null;

  if (reason.includes('reported as leaked') || reason.includes('key_exposed')) {
    return GEMINI_ERRORS.leakedKey;
  }
  if (reason.includes('unrestricted') && reason.includes('key')) {
    return GEMINI_ERRORS.unrestrictedKey;
  }
  if (reason.includes('dormant') && reason.includes('key')) {
    return GEMINI_ERRORS.dormantKey;
  }
  if (
    reason.includes('api_key_service_blocked') ||
    reason.includes('api key is blocked') ||
    reason.includes('api key was blocked') ||
    reason.includes('blocked api key')
  ) {
    return GEMINI_ERRORS.blockedKey;
  }
  if (
    reason.includes('project has been denied access') ||
    reason.includes('account has been denied access') ||
    reason.includes('access restricted')
  ) {
    return GEMINI_ERRORS.blockedProject;
  }
  return null;
}

// Raw backend messages can contain project details, so the UI uses only
// Google's status enum and the allowlisted key-state phrases above.
export function geminiHttpErrorMessage(httpStatus: number, payload: unknown): string {
  const keyStateError = geminiKeyStateError(payload);
  if (keyStateError) return keyStateError;

  const apiStatus = geminiApiStatus(payload);
  if (apiStatus === 'FAILED_PRECONDITION') return GEMINI_ERRORS.precondition;
  if (apiStatus === 'UNAUTHENTICATED') return GEMINI_ERRORS.unauthenticated;
  if (apiStatus === 'PERMISSION_DENIED') return GEMINI_ERRORS.permission;
  if (apiStatus === 'NOT_FOUND') return GEMINI_ERRORS.notFound;
  if (apiStatus === 'DEADLINE_EXCEEDED') return GEMINI_ERRORS.timeout;
  if (apiStatus === 'RESOURCE_EXHAUSTED') return GEMINI_ERRORS.quota;
  if (apiStatus === 'INTERNAL' || apiStatus === 'UNAVAILABLE') {
    return GEMINI_ERRORS.unavailable;
  }
  if (apiStatus === 'INVALID_ARGUMENT') return GEMINI_ERRORS.invalidRequest;

  if (httpStatus === 400) return GEMINI_ERRORS.invalidRequest;
  if (httpStatus === 401) return GEMINI_ERRORS.unauthenticated;
  if (httpStatus === 403) return GEMINI_ERRORS.permission;
  if (httpStatus === 404) return GEMINI_ERRORS.notFound;
  if (httpStatus === 408 || httpStatus === 504) return GEMINI_ERRORS.timeout;
  if (httpStatus === 429) return GEMINI_ERRORS.quota;
  if (httpStatus >= 500) return GEMINI_ERRORS.unavailable;
  return GEMINI_ERRORS.generic;
}

export function geminiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new GeminiRequestError(GEMINI_ERRORS.empty);
  }
  const response = payload as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: Array<{
      finishReason?: unknown;
      content?: { parts?: Array<{ text?: unknown }> };
    }>;
  };
  const promptBlockReason = response.promptFeedback?.blockReason;
  const candidate = Array.isArray(response.candidates) ? response.candidates[0] : undefined;
  const finishReason = candidate?.finishReason;
  const blockedFinishReasons = new Set([
    'SAFETY',
    'BLOCKLIST',
    'PROHIBITED_CONTENT',
    'SPII',
    'IMAGE_SAFETY',
  ]);
  if (
    (typeof promptBlockReason === 'string' && promptBlockReason !== 'BLOCK_REASON_UNSPECIFIED') ||
    (typeof finishReason === 'string' && blockedFinishReasons.has(finishReason))
  ) {
    throw new GeminiRequestError(GEMINI_ERRORS.blocked);
  }

  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map(part => typeof part?.text === 'string' ? part.text : '')
        .filter(Boolean)
        .join('\n')
        .trim()
    : '';
  if (!text) throw new GeminiRequestError(GEMINI_ERRORS.empty);
  return text;
}

type TarotPromptCard = {
  name?: unknown;
  meaning_up?: unknown;
  meaning_rev?: unknown;
  desc?: unknown;
};

function promptField(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// The saved tarot payload contains both the card and its orientation. Keeping
// this pure makes it difficult for the UI to accidentally describe a reversed
// draw with its upright meaning.
export function buildTarotInterpretationPrompt(savedDraw: unknown): string | null {
  if (!savedDraw || typeof savedDraw !== 'object') return null;
  const draw = savedDraw as { card?: unknown; reversed?: unknown };
  if (!draw.card || typeof draw.card !== 'object') return null;

  const card = draw.card as TarotPromptCard;
  const name = promptField(card.name, 160);
  if (!name) return null;

  const reversed = draw.reversed === true;
  const orientation = reversed ? 'Reversed' : 'Upright';
  const meaning = promptField(reversed ? card.meaning_rev : card.meaning_up, 900);
  const description = promptField(card.desc, 600);

  return (
    'You are a thoughtful tarot interpreter. The user drew the following card. ' +
    'Give a calm, grounded interpretation in plain language. Explain what it might invite ' +
    'them to notice today. Avoid clichés or fortune-telling claims. Under 180 words.\n\n' +
    `Card: ${name}\n` +
    `Orientation: ${orientation}\n` +
    `${orientation} meaning: ${meaning}\n` +
    `Description: ${description}`
  );
}

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AbortError';
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function retryDelay(attempt: number, baseDelayMs: number): Promise<void> {
  if (baseDelayMs <= 0) return Promise.resolve();
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return new Promise(resolve => setTimeout(resolve, exponential + jitter));
}

type GeminiRequestOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export async function requestGeminiReflection(
  apiKey: string,
  prompt: string,
  options: GeminiRequestOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    let timedOut = false;
    try {
      const res = await fetchImpl(GEMINI_GENERATE_URL, {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        if (attempt + 1 < MAX_ATTEMPTS && isTransientHttpStatus(res.status)) {
          await retryDelay(attempt, retryDelayMs);
          continue;
        }
        throw new GeminiRequestError(geminiHttpErrorMessage(res.status, payload));
      }
      return geminiResponseText(payload);
    } catch (error) {
      timedOut = abort.signal.aborted || isAbortError(error);
      if (error instanceof GeminiRequestError) throw error;
      if (attempt + 1 < MAX_ATTEMPTS) {
        await retryDelay(attempt, retryDelayMs);
        continue;
      }
      throw new GeminiRequestError(timedOut ? GEMINI_ERRORS.timeout : GEMINI_ERRORS.network);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new GeminiRequestError(GEMINI_ERRORS.network);
}
