# Application source

This directory contains the SvelteKit application: request hooks, routes, shared library code, the HTML shell, and global styles.
Start here to follow a request from the server to the browser.

[Repository overview](../README.md#architecture) · [Routes](routes/README.md) · [Library boundaries](lib/README.md) · [Detailed architecture](../docs/architecture.md)

## From request to page

```mermaid
sequenceDiagram
    participant Browser
    participant Hooks as hooks.server.ts
    participant Route as Server load or action
    participant Services as Server workflows /<br/>queries
    participant UI as Layout and page<br/>components
    Browser->>Hooks: Request with web session cookie
    Hooks->>Hooks: Validate session and populate locals
    Hooks->>Route: Resolve request
    Route->>Route: Enforce route access policy
    Route->>Services: Run query or workflow
    Services-->>Route: Data or workflow result
    Route-->>UI: Serializable page data or form errors
    UI-->>Hooks: Server-rendered HTML response
    Hooks-->>Browser: Response with security headers and saved<br/>theme
    Browser->>UI: Hydrate and attach browser interactions
    Browser->>Hooks: Later navigation or form submission
    Note over Browser,UI: Native forms still work without JavaScript
```

[hooks.server.ts](hooks.server.ts) starts the shared Mongo connection once and validates sessions.
Web routes use cookies; `/api/*` uses bearer tokens only.
Hooks supply `locals.user` and `locals.session`, but each route still decides whether the operation is authorized.
[The root layout load](routes/+layout.server.ts) supplies safe user data and visitor preferences.

## Where code runs

```mermaid
flowchart LR
    subgraph Server["Server only"]
        Hooks["hooks.server.ts"] -->|"locals"| Loads["+page.server.ts /<br/>+layout.server.ts"]
        Hooks -->|"locals"| Endpoints["+server.ts"]
        Loads -->|"queries and workflows"| Backend["lib/server and lib/db"]
        Endpoints -->|"queries and workflows"| Backend
    end
    Loads -->|"serialized data"| Components["+page.svelte / +layout.svelte"]
    Components -->|"render and hydrate"| Browser["Browser"]
    Components -->|"mounted behavior"| Client["lib/client"]
    Shared["lib/types, utils, metadata"] -.->|"shared contracts and rules"| Backend
    Shared -.->|"shared contracts and rules"| Components
```

Server files own credentials and protected I/O.
Svelte components render on the server and then run interactively in the browser; browser APIs belong in mounted handlers/helpers.
`+page.ts`, where present, is a universal load module rather than a server-only boundary.

Read [app.html](app.html) for the initial document and preference placeholders, [app.css](app.css) for shared styling, and [app.d.ts](app.d.ts) for request-local types.
The CSP is configured outside this directory in [svelte.config.js](../svelte.config.js).

Representative checks: [layout data tests](routes/layout.server.test.ts), [review action tests](routes/review-actions.test.ts), and [browser session tests](../tests/session-cookies.test.ts).
