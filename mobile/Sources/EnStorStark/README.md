# Native screens and navigation

This module owns screen composition, navigation, presentation, photo selection, and form
interaction. It observes models from `EnStorStarkModel`; it does not implement backend access rules.

[Native app setup and architecture](../../README.md) · [Model and transport guide](../EnStorStarkModel/README.md) ·
[Verification guidance](../../AGENTS.md)

## Application composition

```mermaid
flowchart TD
    App["EnStorStarkApp"] -->|"root scene"| Content["ContentView: AppModel in<br/>environment"]
    Content -->|"tab and navigation stack"| Reviews["ReviewListView"]
    Content -->|"tab"| Map["ReviewMapView"]
    Content -->|"tab"| Statistics["StatisticsView"]
    Content -->|"tab"| About["AboutView: requests and hidden<br/>login"]
    Reviews -->|"Route.review"| Detail["ReviewDetailView"]
    Map -->|"Route.review"| Detail
    Detail -->|"Route.history"| History["ReviewHistoryView"]
    Reviews -->|"create"| Form["Review presentation"]
    Detail -->|"edit with Tagged review"| Form
    Form -->|"full screen"| Wizard["iOS/ReviewWizardView and step<br/>views"]
```

[ContentView.swift](ContentView.swift) owns tabs and route destinations, injects one `AppModel`,
and validates a restored session. Reviews, map, and statistics can navigate to review details.
[EnStorStarkApp.swift](EnStorStarkApp.swift) provides the root scene.

[iOS/](iOS/) contains the screens and the wizard. Shared presentation helpers live in
[Components.swift](Components.swift); [ReviewImageProcessing.swift](ReviewImageProcessing.swift)
prepares picked photos before they become model input, and
[iOS/PhotoSources.swift](iOS/PhotoSources.swift) presents the photo picker and the camera.

## Editing and feedback

```mermaid
sequenceDiagram
    participant Screen as List or detail screen
    participant App as AppModel
    participant Form as ReviewFormModel
    participant UI as Wizard
    Screen->>App: Make form with optional review and ETag
    App->>App: Load review metadata if needed
    App-->>UI: Form model and available options
    UI->>Form: Bind fields, photo, authors, and step<br/>actions
    UI->>Form: Submit
    alt Field problem or concurrent update
        Form-->>UI: Field pointers, Swedish message, reload<br/>option
        UI->>Form: Reload latest when reviewer chooses
    else Saved
        Form-->>UI: Tagged saved review
        UI-->>Screen: Saved callback and dismiss
        Screen->>App: didSave and refresh affected lists
    end
```

The wizard splits photo, bar/beer, ratings, text, and authors into steps and submits through the
model. Screen code owns dismissal, focus, discard confirmation, and placing server errors beside
fields. New-review local recovery and API conflict handling belong to the model, not a second UI
workflow.

Use the [native verification guide](../../AGENTS.md) for simulator checks and the
[app README](../../README.md#running-ios) for build/debug routes. Check reader/reviewer navigation,
create/edit, field failures, stale edits, photo selection, and sign-out on supported native tooling.
