import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicHttpsUrl, sanitizeError } from "../src/byom.js";

const rejected = [
  "http://example.com/v1", "https://localhost/v1", "https://127.0.0.1/v1",
  "https://10.0.0.1/v1", "https://172.16.0.1/v1", "https://192.168.1.1/v1",
  "https://169.254.169.254/latest/meta-data/", "https://[::1]/v1",
  "https://[fc00::1]/v1", "https://user:pass@example.com/v1",
  "https://metadata.google.internal/computeMetadata/v1/"
];
for (const url of rejected) {
  test("BYOM rejects unsafe endpoint: " + url, async () => {
    await assert.rejects(validatePublicHttpsUrl(url));
  });
}
test("BYOM errors redact credentials", () => {
  const secret = "example-secret-not-real";
  assert.equal(sanitizeError(new Error("failed: " + secret), [secret]).includes(secret), false);
});
