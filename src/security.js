/**
 * Audio security helpers for cross-platform transcription.
 *
 * Enforces HTTPS-only, blocks private/local networks, applies size limits,
 * timeouts, and an optional hostname allowlist. No raw audio or base64 is
 * ever logged.
 */
import dns from "node:dns/promises";
import net from "node:net";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function envInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const AUDIO_MAX_BYTES = envInt("POLYGLOT_AUDIO_MAX_BYTES", DEFAULT_MAX_BYTES);
export const AUDIO_TIMEOUT_MS = envInt("POLYGLOT_AUDIO_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
  );
}

function isPrivateIPv6(ip) {
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80:");
}

function assertPublicIp(ip) {
  if ((net.isIPv4(ip) && isPrivateIPv4(ip)) || (net.isIPv6(ip) && isPrivateIPv6(ip))) {
    throw new Error("Private or local network audio hosts are not allowed.");
  }
}

function allowlist() {
  return (process.env.POLYGLOT_AUDIO_HOST_ALLOWLIST || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function hostAllowed(host) {
  const list = allowlist();
  if (!list.length) return true;
  return list.some(item => host === item || host.endsWith("." + item));
}

export async function validateRemoteAudioUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("audioUrl must use HTTPS.");
  if (url.username || url.password) throw new Error("Embedded URL credentials are not allowed.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("Localhost is not allowed.");
  if (!hostAllowed(host)) throw new Error("Audio host is not in the configured allowlist.");

  if (net.isIP(host)) {
    assertPublicIp(host);
  } else {
    const records = await dns.lookup(host, { all: true });
    if (!records.length) throw new Error("Audio host could not be resolved.");
    for (const r of records) assertPublicIp(r.address);
  }
  return url;
}

export function decodeAudioBase64(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("audioBase64 must be a non-empty string.");
  const clean = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error("audioBase64 is invalid.");
  const buf = Buffer.from(clean, "base64");
  if (!buf.length) throw new Error("audioBase64 decoded to empty audio.");
  if (buf.length > AUDIO_MAX_BYTES) throw new Error("Audio exceeds maximum allowed size.");
  return buf;
}

export function sanitizeFilename(name = "audio.bin") {
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return safe || "audio.bin";
}

export async function fetchRemoteAudio(value) {
  const url = await validateRemoteAudioUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!res.ok) throw new Error(`Audio download failed with HTTP ${res.status}.`);
    const type = res.headers.get("content-type") || "";
    if (type && !/^(audio\/|video\/|application\/octet-stream)/i.test(type)) {
      throw new Error("Remote resource does not appear to be audio.");
    }
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > AUDIO_MAX_BYTES) throw new Error("Remote audio exceeds maximum allowed size.");
    const arr = new Uint8Array(await res.arrayBuffer());
    if (arr.byteLength > AUDIO_MAX_BYTES) throw new Error("Remote audio exceeds maximum allowed size.");
    return { buffer: Buffer.from(arr), contentType: type || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}
