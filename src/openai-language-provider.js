/**
 * OpenAI language provider adapter for cross-platform voice/language tools.
 *
 * Uses the OpenAI Responses API for language tasks and the Audio Transcriptions
 * API for speech-to-text. Never logs API keys, raw audio, base64 payloads, or
 * full transcripts.
 */

function requireApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return key;
}

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

async function responses(input, instructions) {
  const key = requireApiKey();
  const model = process.env.OPENAI_LANGUAGE_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, instructions, input })
  });
  if (!res.ok) throw new Error(`Language provider request failed with HTTP ${res.status}.`);
  const data = await res.json();
  return { text: responseText(data), model, provider: "openai" };
}

export async function transcribeAudio({ buffer, filename, mimeType, languageHint, prompt }) {
  const key = requireApiKey();
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), filename || "audio.bin");
  if (languageHint) form.append("language", languageHint);
  if (prompt) form.append("prompt", prompt);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}` },
    body: form
  });
  if (!res.ok) throw new Error(`Transcription failed with HTTP ${res.status}.`);
  const data = await res.json();
  return { text: data.text || "", model, provider: "openai" };
}

export async function detectLanguageText(text, supportedLanguages) {
  const catalog = supportedLanguages.map(x => x.code || x.value || x).join(", ");
  const instruction = `Identify the language of the user text. Return ONLY the best matching code from this allowed catalog: ${catalog}.`;
  return responses(text, instruction);
}

export async function translateText({ text, sourceLanguage, targetLanguage }) {
  return responses(
    text,
    `Translate the text from ${sourceLanguage || "auto-detected language"} to ${targetLanguage}. Preserve meaning, formatting, names, code, URLs, and identifiers. Return only the translation.`
  );
}

export async function localizeText({ text, targetLanguage, locale, audience, tone }) {
  return responses(
    text,
    `Localize the text for language ${targetLanguage}${locale ? `, locale ${locale}` : ""}${audience ? `, audience ${audience}` : ""}${tone ? `, tone ${tone}` : ""}. Preserve factual meaning, code, URLs, and identifiers while adapting natural phrasing and locale conventions. Return only the localized text.`
  );
}
