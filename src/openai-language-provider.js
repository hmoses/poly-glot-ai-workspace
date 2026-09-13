/**
 * OpenAI language provider adapter for cross-platform voice/language tools.
 *
 * Uses the OpenAI Responses API for language tasks and the Audio Transcriptions
 * API for speech-to-text. Never logs API keys, raw audio, base64 payloads, or
 * full transcripts.
 *
 * v1.9.2 fixes:
 *   - Structured error codes (PROVIDER_NOT_CONFIGURED, RATE_LIMITED,
 *     PROVIDER_BAD_REQUEST) instead of bare HTTP status messages.
 *   - Bounded exponential backoff with jitter + Retry-After for 429s.
 *   - Input validation for transcription (buffer size, mime type).
 */

// ── Error codes ─────────────────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(message, code, { status, retryAfterMs } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status ?? null;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

// ── API key ─────────────────────────────────────────────────────────────────

function requireApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ProviderError(
      "OPENAI_API_KEY is not configured. Cross-platform language tools require a valid OpenAI API key.",
      "PROVIDER_NOT_CONFIGURED"
    );
  }
  return key;
}

// ── Response parsing ────────────────────────────────────────────────────────

function responseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

// ── Retry with exponential backoff + jitter ─────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

function parseRetryAfter(res) {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_DELAY_MS);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS);
  return null;
}

function jitteredDelay(attempt) {
  const base = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return base * (0.5 + Math.random() * 0.5);
}

async function fetchWithRetry(url, options, label = "request") {
  let lastRes;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastRes = await fetch(url, options);
    if (lastRes.status !== 429) return lastRes;
    if (attempt === MAX_RETRIES) break;
    const retryAfter = parseRetryAfter(lastRes);
    const delay = retryAfter ?? jitteredDelay(attempt);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new ProviderError(
    `Language provider ${label} rate-limited after ${MAX_RETRIES + 1} attempts (HTTP 429). Try again later.`,
    "RATE_LIMITED",
    { status: 429, retryAfterMs: parseRetryAfter(lastRes) }
  );
}

// ── Responses API ───────────────────────────────────────────────────────────

async function responses(input, instructions) {
  const key = requireApiKey();
  const model = process.env.OPENAI_LANGUAGE_MODEL || "gpt-4o-mini";
  const res = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, instructions, input })
  }, "responses");
  if (!res.ok) {
    throw new ProviderError(
      `Language provider request failed with HTTP ${res.status}.`,
      "PROVIDER_BAD_REQUEST",
      { status: res.status }
    );
  }
  const data = await res.json();
  return { text: responseText(data), model, provider: "openai" };
}

// ── Transcription ───────────────────────────────────────────────────────────

const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_PREFIXES = ["audio/", "video/", "application/octet-stream", "application/ogg"];

export async function transcribeAudio({ buffer, filename, mimeType, languageHint, prompt }) {
  // Input validation (Fix C: prevent 400s from reaching the provider)
  if (!buffer || buffer.length === 0) {
    throw new ProviderError("Audio buffer is empty. Provide valid audio data.", "TRANSCRIPTION_INVALID_INPUT");
  }
  if (buffer.length > TRANSCRIPTION_MAX_BYTES) {
    throw new ProviderError(
      `Audio exceeds ${TRANSCRIPTION_MAX_BYTES / 1024 / 1024}MB limit (got ${(buffer.length / 1024 / 1024).toFixed(1)}MB).`,
      "TRANSCRIPTION_INVALID_INPUT"
    );
  }
  const safeMime = String(mimeType || "application/octet-stream").toLowerCase();
  if (!ALLOWED_AUDIO_PREFIXES.some((p) => safeMime.startsWith(p))) {
    throw new ProviderError(
      `Unsupported audio MIME type: ${safeMime}. Expected audio/*, video/*, or application/octet-stream.`,
      "TRANSCRIPTION_INVALID_INPUT"
    );
  }

  const key = requireApiKey();
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([buffer], { type: safeMime }), filename || "audio.bin");
  if (languageHint) form.append("language", languageHint);
  if (prompt) form.append("prompt", prompt);

  const res = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}` },
    body: form
  }, "transcription");
  if (!res.ok) {
    throw new ProviderError(
      `Transcription failed with HTTP ${res.status}.`,
      "PROVIDER_BAD_REQUEST",
      { status: res.status }
    );
  }
  const data = await res.json();
  return { text: data.text || "", model, provider: "openai" };
}

// ── Language detection ──────────────────────────────────────────────────────

export async function detectLanguageText(text, supportedLanguages) {
  const catalog = supportedLanguages.map(x => x.code || x.value || x).join(", ");
  const instruction = `Identify the language of the user text. Return ONLY the best matching code from this allowed catalog: ${catalog}.`;
  return responses(text, instruction);
}

// ── Translation ─────────────────────────────────────────────────────────────

export async function translateText({ text, sourceLanguage, targetLanguage }) {
  return responses(
    text,
    `Translate the text from ${sourceLanguage || "auto-detected language"} to ${targetLanguage}. Preserve meaning, formatting, names, code, URLs, and identifiers. Return only the translation.`
  );
}

// ── Localization ────────────────────────────────────────────────────────────

export async function localizeText({ text, targetLanguage, locale, audience, tone }) {
  return responses(
    text,
    `Localize the text for language ${targetLanguage}${locale ? `, locale ${locale}` : ""}${audience ? `, audience ${audience}` : ""}${tone ? `, tone ${tone}` : ""}. Preserve factual meaning, code, URLs, and identifiers while adapting natural phrasing and locale conventions. Return only the localized text.`
  );
}
