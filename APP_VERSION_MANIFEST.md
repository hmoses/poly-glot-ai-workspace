# Apple-verified public update manifest

The app checks `public-app-versions.json` when it launches or resumes (subject
to the in-app six-hour check interval). This manifest is **not** a list of
processed TestFlight builds, attached ASC drafts or versions waiting for review.

## Automatic synchronization

The release-state synchronizer is
`scripts/sync-public-app-versions.mjs`. It signs a short-lived App Store
Connect API JWT locally or in a secure GitHub Actions job, reads
`/v1/apps/6804499285/appStoreVersions`, and advances each platform's
version independently **only** when Apple reports `READY_FOR_SALE`.

Two runners have been prepared:

- GitHub Actions: `.github/workflows/sync-public-app-store-versions.yml`
  checks every three hours or when manually dispatched. It requires repository
  secrets `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY`, and write
  permission on the repository. GitHub billing / Actions restrictions can
  prevent this runner from starting.
- macOS LaunchAgent: `ai.polyglot.public-app-store-release-sync` invokes
  `~/Library/Scripts/polyglot-public-app-store-release-sync.sh` at login and
  every three hours **while the Mac is awake, on the network, and authenticated
  to GitHub**. It uses the private local signing key configured at
  `~/.config/polyglot/asc-release-sync.json` and a disposable checkout
  under `~/.cache/polyglot-public-release-sync`. It never rewrites developer
  source checkouts. This runner is independent of GitHub Actions.

Neither runner submits/reviews/releases a binary, modifies Apple metadata, or
promotes an ASC draft. Network/API errors fail closed without changing the
manifest. Publishing is monotonic, preventing inadvertent platform downgrades.
A validated change is committed to the MCP repository and becomes readable by
the native apps after GitHub's raw-content cache refresh.

## Native prompt scope

- An installed app version **that already contains the update checker** may
  offer Update / Later even when the user disabled automatic App Store updates.
  Update opens the verified platform's official App Store URL. Apple controls
  download and installation.
- **Older already-installed binaries** cannot acquire a new JavaScript/native
  update checker remotely if they never shipped it. Users must update through
  the App Store, Apple system updates or TestFlight.
- TestFlight build availability, beta notifications and installation are
  managed by Apple's TestFlight app. App Store published-version checks must
  not send beta testers to a mismatched public App Store build.
- The app checks at most once per six hours, snoozes Later for 24 hours, and
  retries when the public manifest is unreachable.

## Operational verification

```sh
node --test scripts/test-public-app-versions.mjs
node scripts/sync-public-app-versions.mjs --dry-run
```

The expected dry-run result as of 2026-10-18 is iOS `1.1.8`, macOS `3.6`.
ASC's iOS `1.1.9` and macOS `3.8` drafts are intentionally excluded
until Apple makes each publicly available.

Never put App Store Connect API signing keys or JWTs in committed files,
an in-app bundle, public site JavaScript or logs.
