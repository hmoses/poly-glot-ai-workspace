#!/bin/bash
# macOS LaunchAgent fallback for App Store Connect -> publicly released versions.
# Uses a disposable dedicated checkout; never resets the developer's working tree.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export GIT_TERMINAL_PROMPT=0
REPO='https://github.com/hmoses/poly-glot-ai-workspace.git'
WORKTREE="$HOME/.cache/polyglot-public-release-sync"
CONFIG="$HOME/.config/polyglot/asc-release-sync.json"
GIT="$(command -v git)"
NODE="$(command -v node)"
if [ ! -s "$CONFIG" ]; then echo "ASC release sync config missing" >&2;exit 1;fi
mkdir -p "$(dirname "$WORKTREE")"
if [ ! -d "$WORKTREE/.git" ]; then
  if [ -e "$WORKTREE" ]; then echo "Dedicated checkout path blocked" >&2;exit 1;fi
  "$GIT" clone --depth=1 "$REPO" "$WORKTREE" >/dev/null 2>&1
fi
REMOTE="$("$GIT" -C "$WORKTREE" remote get-url origin)"
case "$REMOTE" in
  "$REPO"|git@github.com:hmoses/poly-glot-ai-workspace.git) ;;
  *) echo "Unexpected remote in dedicated checkout" >&2;exit 1;;
esac
"$GIT" -C "$WORKTREE" fetch origin main --depth=1 --quiet
# The path is exclusively owned by this synchronizer, not a development checkout.
"$GIT" -C "$WORKTREE" reset --hard origin/main >/dev/null
"$NODE" --test "$WORKTREE/scripts/test-public-app-versions.mjs" >/dev/null
"$NODE" "$WORKTREE/scripts/sync-public-app-versions.mjs"
if "$GIT" -C "$WORKTREE" diff --quiet -- public-app-versions.json;then
  echo "No new public App Store releases"
  exit 0
fi
"$GIT" -C "$WORKTREE" add public-app-versions.json
"$GIT" -C "$WORKTREE" -c user.name='Poly-Glot release synchronizer' \
  -c user.email='polyglot-release-sync@users.noreply.github.com' \
  commit -m 'chore: sync Apple public App Store versions' >/dev/null
"$GIT" -C "$WORKTREE" push origin HEAD:main
echo "Published Apple-verified public app version changes"
