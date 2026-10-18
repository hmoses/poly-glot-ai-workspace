# Public App Store version manifest

The native update checkers fetch `public-app-versions.json` from this repository.

The manifest must contain only **public, READY_FOR_SALE** versions: never newly uploaded, processed, or TestFlight-only builds. Update the correct platform field only after confirming Apple has released that exact version to customers. This is independent of TestFlight and Apple system updates; the checker only opens the App Store and never force-installs.

Do not reuse the archived `poly-glot-config` repository’s legacy app IDs or kill-switch settings. Preserve iOS/macOS version separation. Keep the `appStoreId` unchanged.

If the manifest is unavailable, the app must silently skip the update prompt, not block access.
