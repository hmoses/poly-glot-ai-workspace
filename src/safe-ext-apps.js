/**
 * Safe wrapper around @modelcontextprotocol/ext-apps/server.
 *
 * ext-apps v1.7.5 registerAppTool (internal K3) crashes with
 * "Cannot read properties of undefined (reading 'ui')" when _meta
 * is undefined in the options object. This shim ensures _meta always
 * has a safe default, preventing transport-level crashes for non-UI
 * MCP clients (Claude Desktop, Cursor, Goose, etc.).
 *
 * v1.9.2 fix for Error Class A (7 transport/UI crashes in production).
 */
import {
  registerAppTool as unsafeRegisterAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

const SAFE_META_DEFAULT = Object.freeze({
  ui: { resourceUri: "" },
});

export function registerAppTool(server, name, options, handler) {
  // Ensure _meta is always defined with at least a ui property
  if (!options._meta) {
    options = { ...options, _meta: SAFE_META_DEFAULT };
  } else if (!options._meta.ui) {
    options = { ...options, _meta: { ...options._meta, ui: { resourceUri: options._meta["ui/resourceUri"] || "" } } };
  }
  return unsafeRegisterAppTool(server, name, options, handler);
}

export { registerAppResource, RESOURCE_MIME_TYPE };
