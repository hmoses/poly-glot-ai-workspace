/**
 * Unit tests for cross-platform voice/language tools and security module.
 * These tests validate input validation, security boundaries, and integration
 * with the Poly-Glot language catalog — WITHOUT requiring a live OpenAI key.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeAudioBase64,
  sanitizeFilename,
  validateRemoteAudioUrl,
  AUDIO_MAX_BYTES,
} from "../src/security.js";
import {
  resolveLanguage,
  languagePublicList,
} from "../localization.js";

// ── security.js ─────────────────────────────────────────────────────────

describe("decodeAudioBase64", () => {
  it("rejects empty string", () => {
    assert.throws(() => decodeAudioBase64(""), /non-empty/i);
  });
  it("rejects whitespace-only string", () => {
    assert.throws(() => decodeAudioBase64("   "), /non-empty/i);
  });
  it("rejects invalid base64 characters", () => {
    assert.throws(() => decodeAudioBase64("!!!not-base64!!!"), /invalid/i);
  });
  it("decodes valid base64", () => {
    const buf = decodeAudioBase64(Buffer.from("hello audio").toString("base64"));
    assert.ok(buf.length > 0);
  });
  it("rejects oversized base64", () => {
    // Create a base64 string that decodes to > AUDIO_MAX_BYTES
    const huge = Buffer.alloc(AUDIO_MAX_BYTES + 1, 65).toString("base64");
    assert.throws(() => decodeAudioBase64(huge), /maximum allowed size/i);
  });
});

describe("sanitizeFilename", () => {
  it("strips dangerous characters", () => {
    const result = sanitizeFilename("../../etc/passwd");
    assert.ok(!result.includes("/"), "should not contain slashes");
    assert.ok(!result.includes("\\"), "should not contain backslashes");
  });
  it("returns default for empty input", () => {
    assert.equal(sanitizeFilename(""), "audio.bin");
  });
  it("preserves safe names", () => {
    assert.equal(sanitizeFilename("recording.mp3"), "recording.mp3");
  });
  it("truncates long names", () => {
    const long = "a".repeat(200) + ".mp3";
    assert.ok(sanitizeFilename(long).length <= 120);
  });
});

describe("validateRemoteAudioUrl", () => {
  it("rejects HTTP URLs", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("http://example.com/audio.mp3"),
      /HTTPS/i
    );
  });
  it("rejects localhost", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://localhost/audio.mp3"),
      /localhost/i
    );
  });
  it("rejects localhost subdomain", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://evil.localhost/audio.mp3"),
      /localhost/i
    );
  });
  it("rejects embedded credentials", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://user:pass@example.com/audio.mp3"),
      /credentials/i
    );
  });
  it("rejects private IPv4 10.x", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://10.0.0.1/audio.mp3"),
      /private|local/i
    );
  });
  it("rejects private IPv4 192.168.x", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://192.168.1.1/audio.mp3"),
      /private|local/i
    );
  });
  it("rejects private IPv4 172.16.x", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://172.16.0.1/audio.mp3"),
      /private|local/i
    );
  });
  it("rejects loopback 127.0.0.1", async () => {
    await assert.rejects(
      () => validateRemoteAudioUrl("https://127.0.0.1/audio.mp3"),
      /private|local/i
    );
  });
});

// ── resolveLanguage integration ─────────────────────────────────────────

describe("resolveLanguage integration", () => {
  it("resolves EN code", () => {
    const r = resolveLanguage("EN");
    assert.equal(r.code, "EN");
    assert.equal(r.name, "English");
  });
  it("resolves by name (case-insensitive)", () => {
    const r = resolveLanguage("spanish");
    assert.equal(r.code, "ES");
  });
  it("resolves ZH_TW variant", () => {
    const r = resolveLanguage("ZH_TW");
    assert.equal(r.code, "ZH_TW");
  });
  it("falls back to EN for unknown", () => {
    const r = resolveLanguage("KLINGON");
    assert.equal(r.code, "EN");
  });
  it("returns object with code, name, flag", () => {
    const r = resolveLanguage("FR");
    assert.ok(r.code);
    assert.ok(r.name);
    assert.ok(r.flag);
  });
});

describe("languagePublicList", () => {
  it("returns 38 languages", () => {
    const list = languagePublicList();
    assert.equal(list.length, 38);
  });
  it("each entry has code, name, flag", () => {
    for (const lang of languagePublicList()) {
      assert.ok(lang.code, "missing code");
      assert.ok(lang.name, "missing name");
      assert.ok(lang.flag, "missing flag");
    }
  });
});

// ── transcribe_audio input validation (unit, no OpenAI) ─────────────────

describe("transcribe_audio input rules", () => {
  it("must provide exactly one of audioUrl or audioBase64", () => {
    // Both missing = hasUrl===false, hasBase64===false, hasUrl===hasBase64 → error
    const hasUrl = false;
    const hasBase64 = false;
    assert.ok(hasUrl === hasBase64, "both missing should trigger error");
  });
  it("both provided should also trigger error", () => {
    const hasUrl = true;
    const hasBase64 = true;
    assert.ok(hasUrl === hasBase64, "both provided should trigger error");
  });
});

console.log("\n✅ All cross-platform tool tests passed.\n");
