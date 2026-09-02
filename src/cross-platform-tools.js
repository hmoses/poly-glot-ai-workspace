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
  } = deps;

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
      "Transcribe supplied audio for cross-platform Poly-Glot workflows. " +
      "Provide exactly one of audioUrl (HTTPS only) or audioBase64.",
    inputSchema: {
      audioUrl: z.string().url().optional(),
      audioBase64: z.string().optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      languageHint: z.string().optional(),
      prompt: z.string().optional(),
      detectLanguage: z.boolean().optional(),
    },
  }, async (args) => {
    try {
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
      "Detect the language of supplied text and map it to a supported Poly-Glot language.",
    inputSchema: { text: z.string().min(1) },
  }, async ({ text }) => {
    try {
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
      "Translate text into a supported Poly-Glot language. Preserves meaning, formatting, names, code, and URLs.",
    inputSchema: {
      text: z.string().min(1),
      sourceLanguage: z.string().optional().default("auto"),
      targetLanguage: z.string().min(1),
    },
  }, async ({ text, sourceLanguage, targetLanguage }) => {
    try {
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
      "Localize text for a target language, locale, audience, and tone — not merely literal translation.",
    inputSchema: {
      text: z.string().min(1),
      targetLanguage: z.string().min(1),
      locale: z.string().optional(),
      audience: z.string().optional(),
      tone: z.string().optional(),
    },
  }, async ({ text, targetLanguage, locale, audience, tone }) => {
    try {
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
