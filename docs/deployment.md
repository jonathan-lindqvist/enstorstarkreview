# GitHub CI and production deployment

Activation is pending local review. Publishing these workflows enables automatic deployment after
successful main CI, so finish server setup and review the changes before publishing.

The public repository contains reusable deployment code and a fictional configuration example.
Connection details belong in GitHub environment secrets; server directories, account names,
container names, and health URLs belong in a private configuration file on the VPS. Application
credentials stay in the VPS's protected `.env`; never copy them into GitHub or print resolved Compose
configuration. The workflow builds on the VPS and replaces only the app container.

## Required PR checks and coverage

The **CI** workflow runs on every PR targeting `main` and every push to `main`. Its three jobs run
lint, Svelte/TypeScript checking, OpenAPI lint, CI-helper regressions, all Vitest tests with coverage,
all Playwright tests, and a real backup/restore rehearsal. Browser tests use a disposable seeded
MongoDB, one Playwright worker, temporary uploads, and the existing local Discord delivery mock.
They never use production data or a real webhook.

**CI passed** succeeds only if every job succeeded. At activation, update the existing **protect main**
ruleset to require this check from the GitHub Actions app (ID `15368`) and an up-to-date PR. Require
PRs, permit only rebase merging, remove bypass actors, and preserve the existing review-count,
deletion, and force-push policies. Disable repository squash and merge-commit options. These GitHub
settings are separate from the workflow files and must remain enabled to prevent merging a failing PR.

Coverage measures `src/**/*.{js,ts}`, including unimported modules, excluding tests, declarations,
and test fixtures. All UI tests must also pass. Keep Vitest and `@vitest/coverage-v8` versions aligned
in the lockfile.

The workflow measures both revisions in separate checkouts on the same runner. A PR compares its
tested merge revision with the exact `pull_request.base.sha`; a push compares `github.sha` with
the previous `github.event.before`. Historical main without a provider is bootstrapped with the
provider matching its locked Vitest. An unavailable baseline, failed baseline tests, empty report,
invalid counts, or a mismatched provider fails the job. Each of lines, branches, functions, and
statements must preserve or improve its covered/total fraction. Comparisons use `BigInt` cross
multiplication, without rounding. There is no fixed initial floor or persistent coverage service.
GitHub's strict up-to-date check prevents an older PR baseline from bypassing an improvement
already merged into main.

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
volumes, restores a review and its image, rejects a malformed Mongo archive, and exercises actual
Compose app replacement, duplicate-request skipping, backup-failure cooldown, and retained-image rollback. A small Node
fixture container verifies orchestration while Playwright verifies application/HTTP behavior.
The rehearsal checks that Mongo's container and both volumes/data survive replacement and
rollback, and removes only its own Docker resources. It never contacts the production site.
`coverage/` is generated and excluded from Git and lint/format checks.

## Private server configuration

The installed helper reads only `/etc/enstorstarkreview/deploy.json`. The SSH caller cannot supply
another configuration path or override its values through environment variables. This JSON file
must be a regular, root-owned file with mode `600` in a protected root-owned directory; symlinks,
unsafe permissions, missing/extra fields, malformed values, and files over 16 KiB abort before
deployment. Keep the directory mode `700`.

[deployment-config.example.json](deployment-config.example.json) contains fictional values. Copy
it outside the checkout and replace every value with the existing VPS settings:

| Field             | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `app_dir`         | Absolute path of the existing clean production checkout            |
| `backup_dir`      | Absolute path of a separate, root-only backup directory            |
| `git_user`        | Existing non-root owner of the checkout and its Git credentials    |
| `repository`      | Expected GitHub `owner/repository`                                 |
| `site_url`        | Canonical HTTPS origin for `/`, `/about`, and `/feed.xml` checks   |
| `www_url`         | HTTPS root URL that must redirect to `site_url` plus `/`           |
| `app_container`   | Existing app container name                                        |
| `mongo_container` | Existing Mongo container name, also checked against Compose        |
| `caddy_network`   | Existing external reverse-proxy network name                       |
| `image_mount`     | Absolute uploaded-image mount destination inside the app container |
| `database`        | Existing application database name                                 |

The CI SSH account and `git_user` have separate roles. The SSH account can invoke only the
restricted helper. Git runs as the existing checkout owner, while backups and Docker run as root.
There is no need to give the CI account ownership of the app, Docker access, or a GitHub key.
Do not change existing database, volume, container, or network names to match the example.

## Deployment and failure handling

**Deploy production** runs only after a successful **CI** run for a push to this repository's
`main`. PR runs, failures, cancellations, another branch, or a run belonging to another repository
cannot deploy. A separate fork receives none of the original repository's environment secrets.
The workflow passes the triggering run's `head_sha` through the restricted SSH command. It does
not replace this SHA with a later commit. GitHub serializes deployments without cancelling an
active one; a nonblocking server `flock` rejects overlapping manual runs.

Under that lock, the helper admits at most one request every five minutes before fetching Git
or inspecting Docker. Admission is persisted in the private, fixed-size
`.deployment-request.json` file in the backup directory, so restarting the helper or requesting
another SHA cannot reset the cooldown. Failed, superseded, and already-running requests consume
an admission; rejected requests do not extend the timer. Unsafe, corrupt, or unwritable state
fails closed for operator investigation. The SSH caller cannot change this state or policy.

Cooldown and lock rejections return exit code `75`. The workflow retries only these temporary
rejections once per minute for at most ten minutes, always using the same tested SHA. Backup,
build, rollback, and SSH transport failures fail immediately. This can delay closely spaced
merges; rerun the workflow if temporary rejection exhausts its retry budget.

The helper checks the private configuration, clean checkout, protected `.env`, expected Git
origin, existing app, healthy MongoDB, proxy network, real image-volume mount, and backup space.
It requires the target SHA to equal freshly fetched `origin/main`. If the running app's OCI
revision label already matches the target, successful app/Mongo/HTTP health checks skip backups,
builds, checkout changes, and container replacement. An unhealthy matching revision fails for
operator recovery; a matching checkout alone never proves which image is running. Older images
without revision labels still receive the first deployment normally. It backs up the configured
application database using credentials already inside the Mongo container, written to a temporary
mode-600 tools configuration rather than exposed in command arguments. Image backup uses the
existing app image's `tar`, with the actual volume mounted read-only and no network access.

The site stays online during backups. Mongo and images are backed up separately; concurrent
writes can produce differences between them. A tar error caused by a changing file fails backup
and aborts deployment.

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
the app with `--no-cache` and the Dockerfile's non-secret placeholder Mongo URI, and adds the SHA
as an OCI image label. It retains the old image under a unique rollback tag, recreates only the
app with `--no-deps --no-build`, and verifies app revision/state, Mongo health, HTTP 200 for `/`,
`/about`, `/feed.xml`, and the expected `www` redirect. Each HTTP request has a five-second timeout;
the retry loop allows two minutes. Newer merges detected before replacement cause an older run
to skip deployment.

A build failure leaves the running app intact. A replacement or health failure automatically
recreates the previous app using its retained image and saved Compose definition, then checks
recovery, including the previous immutable image ID, and fails the workflow. A failed rollback
is reported explicitly for operator recovery. Database and image restoration is manual so a
code rollback does not erase newer writes.

The checkout can remain on the failed target SHA after rollback. The next backup reads the
running image's revision label and the container's Compose-file label, so another rollback still
uses the running definition. Retained backups also preserve that definition after a failed build.
Images predating revision labels use the checkout SHA as an explicitly marked manifest fallback.
There are no automated destructive migrations.

Command stderr and resolved production configuration are not forwarded to GitHub because they
can contain credentials. Inspect failures locally using the step reported in Actions. Health
checks do not submit a review request or send an external notification.

These limits bound deployment work; a stolen SSH key still needs revocation. Remove its public
key from the protected authorized-keys file and replace the production environment's CI key.
Installing an updated helper is a separate operator step: local source changes do not update
the root-owned VPS copy. The private configuration, forced command, and sudo rule stay the same.

## Backup retention, offsite copy, and recovery

There is no automatic backup deletion or image pruning. Monitor free space and backup usage
locally with `df -h <BACKUP_DIRECTORY>` and `sudo du -sh <BACKUP_DIRECTORY>`. Insufficient estimated
space aborts deployment.

Copy complete backup sets off the VPS to a private encrypted destination. Archives include
password hashes, sessions, and private reviews; never upload them as GitHub Actions artifacts.
Because backups are root-only, stage a selected set through a protected operator-owned location
for transfer, then remove that staged copy. Verify the manifest's SHA-256 hashes after transfer.
Manually remove older complete sets and associated rollback tags only after confirming offsite
copies and retaining a known-good recovery set.

For manual app recovery, select a complete backup and use its Compose file and retained image.
Substitute the private paths and project from its manifest. Keep the existing project and `.env`:

```sh
sudo docker compose --project-directory <APP_DIRECTORY> \
  --env-file <APP_DIRECTORY>/.env --project-name <PROJECT_FROM_MANIFEST> \
  --file <BACKUP_SET>/compose.previous.yml \
  --file <BACKUP_SET>/rollback.json \
  up -d --no-deps --no-build --force-recreate app
```

If the rollback override does not exist, create a root-only JSON override setting
`services.app.image` to the manifest's `previous_image`. Quietly validate Compose, then verify
app/Mongo health and the public HTTP responses after recovery.

Rehearse database/image recovery on disposable volumes first, as `npm run test:deploy:restore`
does. For production recovery:

1. Schedule a maintenance window, stop application writes, and take a fresh safety backup.
2. Select a complete backup and verify all manifest SHA-256 hashes locally. Confirm the intended
   database and image volume from the private configuration and manifest.
3. Restore Mongo using protected container credentials and `mongorestore --archive --gzip`.
   Match the namespace to the configured database; do not put passwords in command arguments.
4. Extract `images.tar.gz` into the manifest's existing image volume, preserving numeric ownership.
5. Reconcile writes made after the backup, restart only the app, and verify the health checks and
   restored reviews/images before allowing writes again.

Never restore blindly into live production, recreate Mongo during an app deployment, use
`docker compose down -v`, or delete an existing persistent volume.

## First activation

Review the local diff, finish the private VPS configuration and helper installation, and configure
the five production environment secrets before publishing the automation PR. Configure the
required GitHub rules and merge only after all jobs and **CI passed** succeed. Monitor the first
successful main CI and deployment; confirm completed backups and the running OCI revision locally
on the VPS. Verify that failed checks block merging and that PR runs cannot enter deployment.

Workflow checks and disposable rehearsals do not prove that a particular VPS or GitHub ruleset
has been configured correctly. The first production deployment and external merge enforcement
must be checked during activation by the operator.
