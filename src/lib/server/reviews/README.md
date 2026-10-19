# Review workflows

This directory sequences review writes and owns focused rules for forms, authorship, persistence,
history, and serialization. Routes authorize the caller and map workflow results to HTTP.

[Server overview](../README.md) · [Route entrypoints](../../../routes/README.md) ·
[Review policies](../../../../docs/agents/reviews.md)

## Rules and production wiring

```mermaid
flowchart LR
    Web["Web form actions"] -->|"FormData and editor context"| Workflows["create / edit / publish /<br/>delete"]
    API["API transport adapters"] -->|"mapped input and editor<br/>context"| Workflows
    Workflows -->|"validation and derived fields"| Rules["form, authorship, persistence,<br/>history"]
    Workflows -->|"call injected operations"| Contracts["Small dependency contracts"]
    Production["production.ts"] -.->|"implements contracts"| Contracts
    Production -->|"collections"| DB["bars and users"]
    Production -->|"files and events"| SideEffects["Image processing / audit"]
    Production -->|"successful public changes"| Caches["Public cache invalidation"]
```

[production.ts](production.ts) supplies complete create/edit/publish/delete dependency objects,
including operation-specific database callbacks. [write-dependencies.ts](write-dependencies.ts)
defines the create/edit seams; publish/delete define their own contracts. Tests substitute those
operations without HTTP, a live database, or image storage. Routes may still query collections
directly for page loads.

## Create and edit

```mermaid
sequenceDiagram
    participant Route as Authorized route / API<br/>adapter
    participant Write as createDraftReview /<br/>editReview
    participant Deps as Production dependencies
    Route->>Write: FormData, editor identity, optional<br/>expected version
    opt Edit
        Write->>Deps: Load active review and check ID, route<br/>slug, expected version
    end
    Write->>Write: Validate form and build editable<br/>persistence fields
    Write->>Deps: Validate author choices and check slug<br/>collision
    Write->>Deps: Process required create image / optional<br/>replacement
    Write->>Write: Prepare timestamps and edit history
    Write->>Deps: Insert draft or atomically update read<br/>version
    alt Storage failure or concurrent edit
        Write->>Deps: Clean up only the new upload and audit<br/>failure
        Write-->>Route: Field problem or conflict result
    else Saved
        opt Existing review was public
            Write->>Deps: Invalidate map and statistics caches
        end
        Write->>Deps: Audit success
        Write-->>Route: Saved slug
    end
```

[create.ts](create.ts) requires a photo and always inserts a draft. [edit.ts](edit.ts) preserves
publication status, permits retaining the existing photo, and records field changes. Validation
or collision failures return before image processing; a unique slug index also catches races.

API updates require a current strong `If-Match` tag and pass its version into the workflow.
Both transports use an atomic `updatedAt` condition; a lost race returns `409 concurrent_update`
and cleans up any new image. Web forms currently do not submit their originally displayed version,
so a form opened before an already-completed edit can overwrite that edit. See the
[API sequence](../api/README.md#editing-with-a-version) for the exact request order.

## Publication and deletion

```mermaid
stateDiagram-v2
    [*] --> Draft: create
    Draft --> Published: publish with atomic version check
    Draft --> Deleted: soft delete
    Published --> Deleted: soft delete
    LegacyPublic --> Deleted: soft delete
    note right of LegacyPublic
        Existing records with no publicationStatus
        are treated as public.
    end note
    note right of Deleted
        Keep document, image, and history.
        Hide from every reader; no restore route.
    end note
```

Edits preserve the current publication state, including legacy missing status. There is no
unpublish operation. [publish.ts](publish.ts) calls the atomic publication helper,
records the publisher in history, and preserves credited authors. [delete.ts](delete.ts) calls
the atomic soft-delete helper. Both invalidate public caches after success. Unknown publication
states are excluded from public filters, and deleted records are excluded for all callers.
Any signed-in reviewer may collaborate on another review; author selection does not grant access.

Useful seams and checks: [workflow-result.ts](workflow-result.ts),
[workflows.test.ts](workflows.test.ts), [delete.test.ts](delete.test.ts),
[persistence tests](persistence.test.ts), and [browser draft tests](../../../../tests/draft-reviews.test.ts).
