# Browser-facing components

This directory owns reusable Svelte presentation and interaction. Pages supply serialized data and
form results; components use shared types/utilities and browser helpers, while routes own saving.

[Library boundaries](../README.md) · [Browser helpers](../client/README.md) ·
[Design guidance](../../../DESIGN.md) · [Review workflows](../server/reviews/README.md)

## Review entry and display

```mermaid
flowchart TD
    Pages["Create / edit pages"] -->|"values, options, errors"| Form["ReviewForm"]
    Beta["Unlinked beta create page"] -->|"same create action"| Wizard["ReviewWizard"]
    Form -->|"controls"| Fields["review-form: beer, ratings,<br/>authors, attributes, image"]
    Wizard -->|"steps"| Steps["review-wizard: photo, bar,<br/>beer, ratings, text, authors"]
    Form -->|"context"| Guidance["PriceComparisonChart /<br/>NearbyReviewGuidance"]
    Wizard -->|"context"| Guidance
    Form -->|"multipart POST"| Save["Route action"]
    Wizard -->|"multipart POST"| Save
    Steps -->|"author-step card preview"| Cards["Card / review detail"]
    Cards -->|"photo and focus"| Image["ReviewImage"]
    Image -->|"upgrade visible preview"| Loader["client/review-image-loading"]
    Cards -->|"review text"| Text["ReviewDescription"]
```

[ReviewForm.svelte](ReviewForm.svelte) composes [review-form/](review-form/) controls and manages
submission state/error focus. The image picker owns its temporary object URLs and revokes them
on replacement or teardown. [ReviewWizard.svelte](ReviewWizard.svelte) uses
[review-wizard/](review-wizard/) steps and [shared step rules](../review-wizard.ts); hidden steps
remain in the form, and all steps appear without scripts. The component supports edit mode, but
no web route currently uses that mode.

[ReviewImage.svelte](ReviewImage.svelte) starts with server-provided previews for stored photos.
The browser helper replaces a preview only after the original decodes. Preview loading still works
without JavaScript. Forms submit to SvelteKit actions, not `/api/v1`.

## Map and visitor preferences

```mermaid
flowchart TD
    Page["Map page"] -->|"markers and editor status"| Map["ReviewMap"]
    Map -->|"initialize and dispose"| GL["MapLibre map and worker"]
    Map -->|"synchronize markers"| Markers["review-map/markers.ts"]
    Map -->|"location presentation"| Location["review-map/location.ts"]
    Location -->|"watch and dispose"| Tracking["client/user-location.ts"]
    Settings["Settings and AnalyticsBanner"] -->|"cookies and notifications"| Preferences["preferences.ts / theme.ts"]
    Preferences -.->|"enable, stop, or restyle"| Tracking
    Preferences -.->|"theme changes"| Map
    Map -->|"signed-in geocoding request"| Route["/karta/next-marker"]
    GL -->|"styles and tiles"| Tiles["OpenFreeMap"]
```

[ReviewMap.svelte](ReviewMap.svelte) owns map initialization, worker setup, selection, and teardown.
[review-map/](review-map/) owns marker synchronization and location presentation. Location helpers
clear resources on teardown and preference changes; coordinates never go to the application server.
The [map guide](../../../docs/agents/map.md) owns camera and geocoding policy.

Other components cover navigation, publication badges, attributes/search, statistics, and consent.
For behavior verification, see [wizard integration tests](../../../tests/review-wizard.test.ts),
[map tests](../../../tests/review-map.test.ts), and
[progressive image tests](../../../tests/progressive-images.test.ts).
