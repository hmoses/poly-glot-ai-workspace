/**
 * Cross-platform voice and language tools for Poly-Glot MCP.
 *
 * These four tools extend the canonical server for non-Apple clients that
 * cannot use Apple Speech / native localization. They reuse the existing
 * Poly-Glot language catalog, analytics, and error tracking.
 *
 * Apple-native behavior is fully preserved — these tools are additive only.
 */
import { z } from "zod";
import { decodeAudioBase64, fetchRemoteAudio, sanitizeFilename } from "./security.js";
import {
  transcribeAudio,
  detectLanguageText,
  translateText as providerTranslate,
  localizeText as providerLocalize,
} from "./openai-language-provider.js";

function contentJson(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * Register the four cross-platform tools on an existing McpServer instance.
 *
 * `deps` must supply the project's own helpers so we never duplicate the
 * language catalog or analytics pipeline:
 *   - languagePublicList()          → [{ code, name, flag }, …]
 *   - resolveLanguage(code|name)    → { code, name, flag }
 *   - languageContext(target)       → string (audience/context hint)
 *   - track(toolName, metadata)     → void
 *   - trackError(toolName, error)   → void
 */
export function registerCrossPlatformTools(server, deps = {}) {
  const {
    languagePublicList = () => [],
    resolveLanguage = (x) => ({ code: x, name: x, flag: "" }),
    languageContext = () => "",
    track = async () => {},
    trackError = async () => {},
    getEntitlement = async () => ({ state: "not_started", isPro: false, trialActive: false, canUseFree: true }),
    entitlementContext = (extra) => extra || {},
    entitlementSummary = (e) => e,
  } = deps;

  // Gate: cross-platform tools cost OpenAI credits per call, so require Pro
  // or active trial. Returns a locked response if not entitled.
  async function requireEntitlement(toolName, extra) {
    const entitlement = await getEntitlement(entitlementContext(extra));
    if (entitlement.isPro || entitlement.trialActive) return { allowed: true, entitlement };
    return {
      allowed: false,
      entitlement,
      lockedResult: {
        content: [{
          type: "text",
          text: JSON.stringify({
            view: "locked",
            tool: toolName,
            message: entitlement.state === "expired"
              ? "Your 3-day trial has ended. A Pro subscription is required to use cross-platform language tools."
              : "A Pro subscription or active trial is required to use cross-platform language tools.",
            entitlement: entitlementSummary(entitlement),
          }, null, 2),
        }],
        isError: true,
      },
    };
  }

  // Helper: resolveLanguage returns { code, name, flag }. Extract the code
  // string for provider calls and JSON responses.
  const resolveCode = (value) => {
    const resolved = resolveLanguage(value);
    return typeof resolved === "string" ? resolved : resolved?.code || String(value);
  };
  const resolveName = (value) => {
    const resolved = resolveLanguage(value);
    return typeof resolved === "string" ? resolved : resolved?.name || String(value);
  };

  // ── transcribe_audio ──────────────────────────────────────────────────
  server.registerTool("transcribe_audio", {
    title: "Transcribe audio",
    description:
      "Convert audio to transcript text for Poly-Glot workflows. Use for supplied speech recordings, not for translating text. " +
      "Provide exactly one source: a publicly reachable HTTPS audioUrl or base64-encoded audioBase64 (without a data-URL prefix). " +
      "For base64 audio, supply mimeType and filename when known; languageHint can improve recognition. " +
      "Set detectLanguage=true to identify the resulting text's language. Requires an active trial or Pro. " +
      "Returns JSON containing transcript text, optional detectedLanguage, provider, and model. " +
      "Audio is submitted to a transcription provider; do not send material without permission.",
    inputSchema: {
      audioUrl: z.string().url().optional().describe("Public HTTPS URL of an audio recording to transcribe. Use this OR audioBase64, never both; private or local URLs are not supported."),
      audioBase64: z.string().optional().describe("Base64-encoded audio bytes, without a data: prefix. Alternative to audioUrl; provide exactly one audio source."),
      filename: z.string().optional().describe("Original audio filename with extension, such as meeting.m4a, to help determine the format."),
      mimeType: z.string().optional().describe("Audio MIME type, such as audio/mpeg, audio/mp4, or audio/wav. Recommended for base64 input."),
      languageHint: z.string().optional().describe("Optional language hint for speech recognition, such as en, es, or fr. Leave blank if unknown."),
      prompt: z.string().optional().describe("Optional recognition context, such as expected names or specialist vocabulary; not the text to transcribe."),
      detectLanguage: z.boolean().optional().describe("When true, also infer a supported Poly-Glot language from the resulting transcript; defaults to false."),
    },
  }, async (args, extra) => {
    try {
      const gate = await requireEntitlement("transcribe_audio", extra);
      if (!gate.allowed) return gate.lockedResult;

      const hasUrl = Boolean(args.audioUrl);
      const hasBase64 = Boolean(args.audioBase64);
      if (hasUrl === hasBase64) throw new Error("Provide exactly one of audioUrl or audioBase64.");

      let buffer, mimeType = args.mimeType || "application/octet-stream";
      if (hasUrl) {
        const remote = await fetchRemoteAudio(args.audioUrl);
        buffer = remote.buffer;
        mimeType = args.mimeType || remote.contentType;
      } else {
        buffer = decodeAudioBase64(args.audioBase64);
      }

      const result = await transcribeAudio({
        buffer,
        filename: sanitizeFilename(args.filename || "audio.bin"),
        mimeType,
        languageHint: args.languageHint,
        prompt: args.prompt,
      });

      let detectedLanguage = null;
      if (args.detectLanguage && result.text) {
        const detected = await detectLanguageText(result.text, languagePublicList());
        detectedLanguage = resolveCode(detected.text.trim());
      }
      await track("transcribe_audio", { bytes: buffer.length, provider: result.provider, model: result.model });
      return contentJson({ text: result.text, detectedLanguage, provider: result.provider, model: result.model });
    } catch (error) {
      await trackError("transcribe_audio", error);
      throw error;
    }
  });

  // ── detect_language ───────────────────────────────────────────────────
  server.registerTool("detect_language", {
    title: "Detect language",
    description:
      "Identify the primary language of a nonempty text snippet and map it to one of Poly-Glot's 38 supported language codes. " +
      "Use when the source language is unknown before choosing an interface, output language, or translation workflow. " +
      "Provide natural-language text in the text parameter (for example, '¿Dónde está la estación?'). " +
      "Returns JSON with language, provider, and model. Does not translate or alter the input text. " +
      "Requires an active 3-day trial or Pro subscription; very short, mixed-language, or ambiguous snippets may be misclassified.",
    inputSchema: { text: z.string().min(1).describe("Nonempty sample of text whose predominant language should be detected. Prefer a phrase or sentence, e.g. 'Bonjour, comment allez-vous ?'; this is source content, not an instruction.") },
  }, async ({ text }, extra) => {
    try {
      const gate = await requireEntitlement("detect_language", extra);
      if (!gate.allowed) return gate.lockedResult;

      const result = await detectLanguageText(text, languagePublicList());
      const resolved = resolveLanguage(result.text.trim());
      const language = typeof resolved === "string" ? resolved : resolved?.code || result.text.trim();
      await track("detect_language", { language });
      return contentJson({ language, provider: result.provider, model: result.model });
    } catch (error) {
      await trackError("detect_language", error);
      throw error;
    }
  });

  // ── translate_text ────────────────────────────────────────────────────
  server.registerTool("translate_text", {
    title: "Translate text",
    description:
      "Translate supplied text into one of Poly-Glot's 38 supported languages while aiming to preserve meaning, names, formatting, code, and URLs. " +
      "Use for translation rather than cultural adaptation; use localize_text when audience, tone, or regional conventions must change. " +
      "Specify required targetLanguage (language name or code, e.g. 'es'); set sourceLanguage to 'auto' to detect the source automatically. " +
      "Returns JSON containing translated text, targetLanguage, provider, and model; quality can vary with idiom and context. " +
      "Requires an active trial or Pro; text is processed by the configured translation provider.",
    inputSchema: {
      text: z.string().min(1).describe("Nonempty original text to translate, including any formatting to preserve."),
      sourceLanguage: z.string().optional().default("auto").describe("Original language name or code, such as 'en' or 'English'; 'auto' (default) asks the provider to detect it."),
      targetLanguage: z.string().min(1).describe("Required desired output language name or code among the 38 supported, e.g. 'Spanish' or 'es'."),
    },
  }, async ({ text, sourceLanguage, targetLanguage }, extra) => {
    try {
      const gate = await requireEntitlement("translate_text", extra);
      if (!gate.allowed) return gate.lockedResult;

      const target = resolveName(targetLanguage);
      const targetCode = resolveCode(targetLanguage);
      const result = await providerTranslate({ text, sourceLanguage, targetLanguage: target });
      await track("translate_text", { targetLanguage: targetCode });
      return contentJson({ text: result.text, targetLanguage: targetCode, provider: result.provider, model: result.model });
    } catch (error) {
      await trackError("translate_text", error);
      throw error;
    }
  });

  // ── localize_text ─────────────────────────────────────────────────────
  server.registerTool("localize_text", {
    title: "Localize text",
    description:
      "Adapt supplied text for a target language and audience, including culturally appropriate phrasing, tone, and regional conventions rather than literal translation. " +
      "Use for localized product UI, marketing copy, documentation, or customer communications; use translate_text for a closer translation. " +
      "Set required targetLanguage and optionally locale (e.g. 'es-MX'), audience, and tone. " +
      "Returns JSON containing localized text, targetLanguage, locale, provider, and model. " +
      "Requires an active trial or Pro. Review sensitive, legal, and technical output with a qualified local reviewer.",
    inputSchema: {
      text: z.string().min(1).describe("Original nonempty copy to adapt for the target culture, region, and audience."),
      targetLanguage: z.string().min(1).describe("Required output language name or code, e.g. 'Arabic' or 'ar'."),
      locale: z.string().optional().describe("Optional regional locale, such as 'es-MX', 'fr-CA', or 'en-GB'; affects regional spelling and conventions."),
      audience: z.string().optional().describe("Intended readers or customers, e.g. 'first-time mobile app users' or 'enterprise developers'."),
      tone: z.string().optional().describe("Desired writing style, such as 'friendly', 'formal', or 'concise'."),
    },
  }, async ({ text, targetLanguage, locale, audience, tone }, extra) => {
    try {
      const gate = await requireEntitlement("localize_text", extra);
      if (!gate.allowed) return gate.lockedResult;

      const target = resolveName(targetLanguage);
      const targetCode = resolveCode(targetLanguage);
      const context = languageContext?.(targetLanguage) || "";
      const result = await providerLocalize({
        text,
        targetLanguage: target,
        locale,
        audience: audience || context,
        tone,
      });
      await track("localize_text", { targetLanguage: targetCode, locale: locale || null });
      return contentJson({ text: result.text, targetLanguage: targetCode, locale: locale || null, provider: result.provider, model: result.model });
    } catch (error) {
      await trackError("localize_text", error);
      throw error;
    }
  });
}
