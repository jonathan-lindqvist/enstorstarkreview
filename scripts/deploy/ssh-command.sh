#!/bin/sh
set -eu

# Install root-owned. The CI key cannot request a shell, forwarding, or arbitrary sudo.
command=${SSH_ORIGINAL_COMMAND:-}
case "$command" in
  deploy\ *) sha=${command#deploy } ;;
  *) echo 'Expected deploy COMMIT_SHA' >&2; exit 1 ;;
esac
case "$sha" in
  ''|*[!a-f0-9]*) echo 'Invalid commit SHA' >&2; exit 1 ;;
esac
test "${#sha}" -eq 40 || { echo 'Invalid commit SHA length' >&2; exit 1; }
test "$sha" != 0000000000000000000000000000000000000000 || exit 1
exec /usr/bin/sudo -n /usr/local/sbin/enstorstarkreview-deploy "$sha"
