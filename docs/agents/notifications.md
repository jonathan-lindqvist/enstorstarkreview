# Push notifications

Rules for the push notifications the iOS and Android apps get when a review is published.
Part of the agent guidance in [AGENTS.md](../../AGENTS.md).
The endpoints and their compatibility notes live in [docs/api.md](../api.md#push-notifications).

## What is sent, and to whom

The web has no notifications; this feature is for the native apps only.
A review is announced once, when `publishReview` (`server/reviews/publish.ts`) publishes the draft.
Publication is one-way, so edits, deletions and failed or conflicting publications never send anything.
Every registered phone gets the notification except those of the credited reviewers (`author` and `coAuthors`) and of the publisher.
A phone belongs to a user only when it registered with that user's bearer token; anonymous phones always get it.

`server/push/message.ts` owns the Swedish text, built from public review data only: "Ny recension: {bar}" with the stamps and the price.
The payload carries the review slug so a tap opens the review.
The Android channel ID `new_reviews` in `server/push/fcm.ts` must match the channel the app creates.

## Sending

`server/push/announce.ts` runs in the background after a successful publication; publication never waits for it, and its failures never change the publication result.
It sends iOS phones through APNs (`apns.ts`, HTTP/2 with an ES256 provider token reused for 50 minutes) and Android phones through FCM HTTP v1 (`fcm.ts`, with an OAuth access token from a service-account assertion).
Both use at most ten requests at a time and a ten-second timeout.
Notifications expire after a day.
Tokens the services report as gone are deleted: APNs `410`, `BadDeviceToken` and `DeviceTokenNotForTopic`, and FCM `UNREGISTERED`, or `INVALID_ARGUMENT` only when the message names the registration token.
Other errors, including FCM `404` without `UNREGISTERED`, keep the device, so a configuration mistake cannot delete every registration.
Each announcement writes one `review_notification` audit event with counts, never tokens.

## Configuration

`server/push/config.ts` reads `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the `.p8` key, newlines may be escaped as `\n`), optional `APNS_BUNDLE_ID` (default `se.enstorstarkreview.app`), and `FCM_SERVICE_ACCOUNT_JSON`.
A platform without its settings is off without a warning, which is the default in development and CI; incomplete or unreadable settings turn it off with a warning that names the setting, never its value.
With both off, publication does not even read the device list.
The FCM token URL is pinned rather than taken from the service-account file.
Tests use fake transports and `fetch`; never point them at Apple or Google.

## Devices

`push_devices` stores one document per token: platform, APNs environment for iOS (`sandbox` for debug builds, `production` for TestFlight), the optional username, and timestamps.
`start_mongo()` creates a unique token index and a 60-day TTL on `updatedAt`, so phones that stop refreshing are forgotten; the apps refresh at least weekly.
The server stores iOS tokens as lowercase hex.
A registration with a valid bearer sets the username; one without a bearer removes it, so signing out detaches the phone.
Registration and removal share the `push_device_ip` quota of 60 attempts per IP and hour in `review_request_rate_limits`, charged before the body is read.
