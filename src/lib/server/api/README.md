# Native API transport

This directory adapts the `/api/v1` HTTP contract to shared application workflows. It owns JSON
validation, body budgets, API representations, conditional headers, and problem responses.
The endpoint handlers themselves live under the route tree.

[Server overview](../README.md) · [Contract and generation](../../../../openapi/README.md) ·
[API decisions](../../../../docs/api.md) · [Endpoint routes](../../../routes/api/v1/)

## Request and response pipeline

```mermaid
flowchart TD
    Request["API request"] -->|"hooks read Authorization only"| Session["auth.ts: bearer validation"]
    Session -->|"locals"| Route["Endpoint handler"]
    Route -->|"protected write: requireUser"| Admit["Authentication or anonymous IP<br/>admission"]
    Admit -->|"body-bearing endpoints"| Body["http.ts: media type and<br/>streamed byte budget"]
    Spec["openapi/v1.yaml"] -.->|"budgets and schemas"| Body
    Body -->|"JSON.parse then schema check"| Validate["openapi.ts: fail-fast Ajv<br/>validation"]
    Validate -->|"valid review input"| Input["review-input.ts: fields and<br/>image mapping"]
    Input -->|"FormData"| Workflow["Shared server workflow"]
    Route -->|"GET: visibility-filtered query"| Query["Collection / public read<br/>service"]
    Workflow -->|"success"| Output["reviews.ts / metadata.ts: API<br/>representation"]
    Query -->|"serialize"| Output
    Output -->|"JSON and optional ETag"| Response["HTTP response"]
    Workflow -->|"failure result"| Problem["problem.ts: stable code and<br/>field pointers"]
    Body -->|"invalid or oversized"| Problem
    Validate -->|"schema error"| Problem
    Problem -->|"application/problem+json"| Response
```

Cookie sessions never authorize API requests. Public review/detail/history/image reads use the
same visibility rules as web pages; a bearer session reveals active drafts. Mutations, user
listing, and geocoding require a bearer session. Session creation and review requests consume IP
quota before body parsing and pass a server-owned admission into shared workflows to avoid charging
twice. Endpoints without bodies bypass JSON parsing.

[http.ts](http.ts) counts streamed bytes before parsing and separates strong update preconditions
from weak cache validation. [openapi.ts](openapi.ts) loads the contract schemas.
[review-input.ts](review-input.ts) validates base64 and maps JSON into shared form input;
[reviews.ts](reviews.ts) maps stored documents into public API representations.
[metadata.ts](metadata.ts) exposes form options and limits.

## Editing with a version

```mermaid
sequenceDiagram
    participant Client as Native client
    participant Route as PUT review route
    participant Mongo as bars
    participant Workflow as editReview
    Client->>Route: Bearer token, If-Match, JSON
    Route->>Route: Require user, audit attempt, validate<br/>route slug
    Route->>Route: Require If-Match header (428 if missing)
    Route->>Route: Read bounded JSON and validate schema
    Route->>Mongo: Load active review
    Mongo-->>Route: Stored review and version
    Route->>Route: Strong tag comparison (412 if stale, weak,<br/>or wildcard)
    Route->>Workflow: Mapped input with expectedUpdatedAt
    Workflow->>Mongo: Re-read and atomically update only<br/>expected version
    alt Version changed
        Workflow-->>Route: 412 or 409, clean up new upload if needed
        Route-->>Client: Problem response, client can reload latest
    else Saved
        Route->>Mongo: Read saved review
        Route-->>Client: JSON representation and new ETag
    end
```

GET cache validation supports weak tags and wildcards. Responses vary on `Authorization`, and
authenticated cacheable representations stay private. Write responses and problems default to
`no-store`. Runtime validation covers requests; generated response types do not themselves validate
responses at runtime.

See [contract tests](contract.test.ts), [HTTP helper tests](http.test.ts),
[input tests](review-input.test.ts), and [API integration tests](../../../../tests/api.test.ts).
