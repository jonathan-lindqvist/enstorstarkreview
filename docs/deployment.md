# GitHub CI and production deployment

This is the automation reference for the Hetzner VPS at `204.168.196.251`, Ubuntu 24.04,
Docker Compose, and Caddy at `https://enstorstarkreview.se`. It follows the backup and app-only
deployment procedure in the supplied PR #84 runbook. Production configuration remains in
`/opt/apps/enstorstarkreview/.env`, mode `600`; do not copy it into GitHub or print resolved Compose
configuration. Caddy and MongoDB keep their existing networks, ports, and persistent volumes.

## Required PR checks and coverage

The **CI** workflow runs on every PR targeting `main` and every push to `main`. Its three jobs run
lint, Svelte/TypeScript checking, OpenAPI lint, CI-helper regressions, all Vitest tests with coverage,
all Playwright tests, and a real backup/restore rehearsal. Browser tests use a disposable seeded
MongoDB, one Playwright worker, temporary uploads, and the existing local Discord delivery mock.
They never use production data or a real webhook.

**CI passed** succeeds only if every job succeeded. The existing **protect main** ruleset requires
this check from the GitHub Actions app (ID `15368`) and an up-to-date PR. It requires PRs, permits
only rebase merging, and has no bypass actors. The existing review-count policy is preserved.
Repository squash and merge-commit options are disabled. These GitHub settings are separate from
the workflow files and must remain enabled to prevent merging a failing PR.

Coverage measures `src/**/*.{js,ts}`, including unimported modules, excluding tests, declarations,
and test fixtures. Svelte component/browser coverage is separate from this numeric gate: all UI
tests must still pass. Keep Vitest and `@vitest/coverage-v8` versions aligned in the lockfile.

The workflow measures both revisions in separate checkouts on the same runner. A PR compares its
tested merge revision with the exact `pull_request.base.sha`; a push compares `github.sha` with
the previous `github.event.before`. Historical main without a provider is bootstrapped with the
provider matching its locked Vitest. An unavailable baseline, failed baseline tests, empty report,
invalid counts, or a mismatched provider fails the job. Each of lines, branches, functions, and
statements must preserve or improve its covered/total fraction. Comparisons use `BigInt` cross
multiplication, not rounded percentages or report-supplied percentage values. There is no fixed
initial floor or persistent coverage service. GitHub's strict up-to-date check prevents an older PR
baseline from bypassing an improvement already merged into main.

Reports and the comparison table are available in Actions; coverage artifacts are kept for 30
days. Failed Playwright runs retain traces/screenshots for 14 days. Application secrets and SSH
credentials are never available to PR jobs. Actions are pinned to full reviewed commit SHAs;
verify upstream releases before updating those pins.

Local checks, with a development/test Mongo URI:

```sh
npm ci --ignore-scripts=false
npm run test:coverage
npm run test:ci
npm run test:deploy:restore
npm run check
npm run lint
npm run api:lint
npm run test:integration
```

`test:deploy:restore` requires local Docker access. It creates uniquely named containers and
volumes, restores a review and its image, rejects a malformed Mongo archive, and removes only
its own Docker resources. It never contacts the production site. `coverage/` is generated and
excluded from Git and lint/format checks.

## One-time VPS setup

The deployment workflow uses a **dedicated CI key**. The initial setup provisioned this key in
GitHub's production environment; its public half is [deployment-ci.pub](deployment-ci.pub).
The local private key is `~/.ssh/enstorstarkreview_ci`. Use your existing access for installation:

```sh
ssh deploy@204.168.196.251 -i ~/.ssh/hetzner
cd /opt/apps/enstorstarkreview
```

Check that this checkout is clean, on `main`, and has the automation files before installing them.
Install the reviewed helpers as root-owned files outside the checkout:

```sh
sudo apt-get install -y python3
sudo install -o root -g root -m 0755 scripts/deploy/deploy.py /usr/local/sbin/enstorstarkreview-deploy
sudo install -o root -g root -m 0755 scripts/deploy/ssh-command.sh /usr/local/sbin/enstorstarkreview-ssh-command
sudo install -d -o root -g root -m 0700 /opt/backups/enstorstarkreview
chmod 600 .env
sudo docker compose config --quiet
sudo docker network inspect caddy_net >/dev/null
sudo visudo -f /etc/sudoers.d/enstorstarkreview-ci
```

Add this exact sudoers rule, then validate it with `sudo visudo -cf /etc/sudoers.d/enstorstarkreview-ci`:

```sudoers
deploy ALL=(root) NOPASSWD: /usr/local/sbin/enstorstarkreview-deploy *
```

The helper accepts exactly one lowercase 40-character, nonzero SHA; it verifies the expected Git
origin and requires that SHA to equal freshly fetched `origin/main`. The key's forced command
does not allow a shell, other sudo commands, port forwarding, or arbitrary arguments. Do not grant
the CI key general Docker or shell access. Git operations run as `deploy`, while backup and
container operations run as root. Only protected main code is built.

For a new installation or key rotation, generate a CI key on your trusted local machine and keep
its private half out of this repository. Skip this for the already provisioned key:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/enstorstarkreview_ci -C enstorstarkreview-github-actions -N ''
```

On the server, append the provisioned **public** key to `/home/deploy/.ssh/authorized_keys` without
replacing existing personal keys:

```sh
printf 'restrict,command="/usr/local/sbin/enstorstarkreview-ssh-command" %s\n' \
  "$(cat docs/deployment-ci.pub)" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

The resulting line has this format:

```text
restrict,command="/usr/local/sbin/enstorstarkreview-ssh-command" ssh-ed25519 PUBLIC_KEY enstorstarkreview-github-actions
```

The `.ssh` directory must be mode `700`, and `authorized_keys` mode `600`, owned by `deploy`.
Changes to the deployment helpers require reinstalling these reviewed root-owned copies; the
workflow cannot replace them automatically from the app checkout.

## GitHub environment and secrets

The initial setup configured the **production** environment with only the `main` branch allowed
and required reviewers disabled so deployment is automatic. For recreation, configure these
environment variables:

| Variable      | Value             |
| ------------- | ----------------- |
| `DEPLOY_HOST` | `204.168.196.251` |
| `DEPLOY_USER` | `deploy`          |
| `DEPLOY_PORT` | `22`              |

The initial setup also configured these environment secrets. Rotate them when changing the CI
key or the verified VPS host key:

| Secret               | Source                                            |
| -------------------- | ------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | The private `~/.ssh/enstorstarkreview_ci` key     |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH host-key entry for `204.168.196.251` |

For example, with authenticated GitHub CLI:

```sh
gh secret set DEPLOY_SSH_KEY --repo jonathan-lindqvist/enstorstarkreview --env production < ~/.ssh/enstorstarkreview_ci
gh secret set DEPLOY_KNOWN_HOSTS --repo jonathan-lindqvist/enstorstarkreview --env production < /path/to/verified-known-hosts
```

Verify the server host-key fingerprint through an already trusted SSH session or Hetzner console:
`sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Obtain the matching known-hosts entry from
your trusted local file, or verify an `ssh-keyscan` result against that fingerprint before saving
it. The workflow enforces strict host-key checking and never trusts a fresh network scan.
The only GitHub deployment credentials are this dedicated key and the host-key entry. Mongo
credentials and the Discord webhook remain exclusively on the VPS.

## Deployment and failure handling

**Deploy production** runs only after a successful **CI** run for a push to this repository's
`main`. A successful PR run, fork, failure, cancellation, or another branch cannot deploy. It
passes the triggering run's `head_sha`, rather than the latest default-branch checkout, through
the restricted SSH command. Production deployments are serialized without cancelling an active
one; a nonblocking server `flock` also protects against overlapping manual runs.

The helper checks the clean checkout, protected `.env`, expected Git origin, existing app,
healthy MongoDB, Caddy network, real image-volume mount, and backup disk space. It backs up
`enstorstark` using credentials already inside the Mongo container, written to a temporary
mode-600 tools configuration rather than exposed in command arguments. Image backup uses the
existing app image's `tar`, with the actual volume mounted read-only and no network access.

The site stays online during backups. These are live logical backups, **not an atomic database
and image snapshot**; concurrent writes can produce differences between them. A tar error caused
by a changing file fails backup and aborts deployment rather than accepting a questionable archive.

Each private backup directory contains:

- `mongo.archive.gz` and `images.tar.gz`;
- the previous Compose definition;
- `manifest.json`, with checksums, timestamp, previous image/commit, target SHA, and actual volume;
- `COMPLETE`, created only after both archives validate;
- `DEPLOYED.json` after successful deployment, or a rollback override after failed startup.

Validation includes nonempty files, gzip integrity, a Mongo restore dry run, and a tar listing.
No checkout update or container replacement happens if backup fails. Incomplete directories are
kept for diagnosis and must not be mistaken for completed backups.

After backup the helper fast-forwards to the tested SHA, quietly validates Compose, builds only
the app with `--no-cache`, and adds the tested SHA as an OCI image label. It retains the old image
under a unique rollback tag, recreates only the app with `--no-deps --no-build`, and verifies app
revision/state, Mongo health, HTTP 200 for `/`, `/about`, `/feed.xml`, and the expected `www`
redirect. Newer merges detected before replacement cause an older run to skip deployment.

A build failure leaves the running app intact. A replacement or health failure automatically
recreates the previous app using its retained image and saved Compose definition, then checks
recovery and fails the workflow. A failed rollback is reported explicitly for operator recovery.
Database and image restoration is never automatic; a code rollback must not erase newer writes.
The checkout can remain on the failed target SHA after rollback; the retained image and backup
manifest identify the previous running app. The next backup reads the running image's revision
label and the container's Compose-file label, so another rollback still uses the actual running
definition. Retained backup snapshots also preserve the running definition when a failed build
advanced the checkout without replacing the app. Images predating revision labels use the checkout SHA as an explicitly marked fallback
in the manifest. No destructive migrations are automated by this flow.

Command stderr and resolved production configuration are not forwarded to GitHub, because they
can contain credentials. Inspect failures locally on the VPS using the step reported in Actions.
No automated smoke test submits a review request or sends a Discord message.

## Backup retention, offsite copy, and recovery

There is no automatic backup deletion or image pruning. Monitor free space with
`df -h /opt/backups/enstorstarkreview` and backup usage with
`sudo du -sh /opt/backups/enstorstarkreview`. Insufficient estimated space aborts deployment.

Copy complete backup sets off the VPS after deployment, using a private encrypted destination.
Archives include password hashes, sessions, and private reviews. They must not be uploaded as
GitHub Actions artifacts. Because backup directories are root-only, stage a selected archive
through a protected operator-owned location when using `scp`, then remove that staged copy.
Verify manifest SHA-256 hashes after transfer. Manually remove older complete sets and associated
rollback image tags only after confirming offsite copies and retaining a known-good recovery set.

For manual app recovery, use the selected backup's previous Compose file and retained image.
Keep the existing project name and production `.env` explicitly:

```sh
sudo docker compose --project-directory /opt/apps/enstorstarkreview \
  --env-file /opt/apps/enstorstarkreview/.env --project-name PROJECT_FROM_MANIFEST \
  --file /opt/backups/enstorstarkreview/BACKUP/compose.previous.yml \
  --file /opt/backups/enstorstarkreview/BACKUP/rollback.json \
  up -d --no-deps --no-build --force-recreate app
```

If recovery is needed before a rollback file exists, create a root-only override with the
`previous_image` from the manifest as `services.app.image`. Validate public responses again.

For database/image recovery, first rehearse on disposable MongoDB and image volumes, as
`npm run test:deploy:restore` does. A production restore requires a deliberate maintenance window:
stop application writes, verify archive checksums, restore Mongo using the container's protected
credentials and `mongorestore --archive --gzip`, and extract images into the volume named in the
manifest, preserving numeric ownership. Reconcile any writes after the backup before replacing
data. Never restore blindly into live production, recreate Mongo as part of an app deployment,
run `docker compose down -v`, or delete an existing persistent volume.

## First activation

Merge the automation PR only after all three jobs and **CI passed** succeed. Install the reviewed
server helpers and restricted public key, configure both production secrets, then monitor the
next successful main push (or rerun that main CI run) and its deployment. Confirm backups and the
running OCI revision on the VPS. Required checks plus the rebase-only ruleset block a failing PR;
the deployment workflow additionally checks the event is a successful main push before accessing
SSH secrets. The backup/rollback regression suite covers rejection without protected side effects.
