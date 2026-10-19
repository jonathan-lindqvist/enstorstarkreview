# Map reads and geocoding

This directory separates stored map reads from external address lookup. It owns address matching,
Nominatim transport, persisted geocode claims/results, marker serialization, and coordination.
[review-map.ts](../review-map.ts) composes one production service per Node process.

[Server overview](../README.md) · [Browser map](../../components/README.md#map-and-visitor-preferences) ·
[Detailed map policy](../../../../docs/agents/map.md)

## Read cached markers

```mermaid
flowchart TD
    Caller["Web map / API map / refreshed<br/>editor map"] -->|"get public map"| Service["service.ts"]
    Service -->|"24-hour result; pending reads<br/>shared"| Cache["async-cache"]
    Cache -->|"miss or invalidation"| Markers["markers.ts"]
    Markers -->|"public active reviews"| Bars[("bars")]
    Markers -->|"resolved coordinates by<br/>normalized address"| Coordinates["coordinates.ts"]
    Coordinates -->|"read only"| Geocodes[("map_geocodes")]
    Markers -->|"serialized markers"| Cache
```

Marker reads never call Nominatim. Expiry rebuilds the list from persisted data, not a bulk address
refresh. Home/detail distances and review guidance reuse saved coordinates through the read-only
coordinate loader. Missing coordinates can omit a marker without making the review invalid.

## Resolve one address

```mermaid
sequenceDiagram
    participant Route as Authenticated web / API<br/>endpoint
    participant Service as service.ts
    participant Store as geocodes.ts / MongoDB
    participant Lookup as nominatim.ts
    Route->>Service: Resolve at most one public address
    alt Another geocoding call is active in this process
        Service-->>Route: No marker (HTTP 204)
    else Available
        Service->>Service: Load public reviews and deduplicate<br/>addresses
        Service->>Store: Claim eligible address with atomic pending<br/>lock
        opt Address claimed
            Service->>Lookup: Exact address search through shared<br/>throttle
            opt Zero results and supported fallback address
                Lookup->>Lookup: Throttle and search strict fallback<br/>candidates
            end
            Lookup-->>Service: Coordinates, no match, or error
            alt Resolved
                Service->>Store: Save permanent coordinates
                Service->>Service: Invalidate marker-list cache
            else No match or temporary failure
                Service->>Store: Save negative result with retryAt
            end
        end
        Service-->>Route: New marker or no marker
    end
```

[service.ts](service.ts) returns no result to concurrent geocoding callers rather than sharing the
first caller's marker. [geocodes.ts](geocodes.ts) also uses persisted address claims to prevent
duplicate work. Resolved entries are permanent; current-strategy `not_found` retries after 30 days,
`failed` after one hour. Older negative strategy versions can become eligible once earlier.

[nominatim.ts](nominatim.ts) allows at most two searches per address attempt, at least one second
apart. A transport/API error stops the attempt; only zero exact results permit the address fallback.
[address.ts](address.ts) validates the fallback's road, house number, locality, and supplied postcode.
The web endpoint additionally requires a same-origin request. Neither transport accepts visitor GPS
coordinates for geocoding; the browser uses its location only for local display/comparisons.

Check [service tests](service.test.ts), [coordinate tests](coordinates.test.ts), and
[browser map tests](../../../../tests/review-map.test.ts). Timing and retry constants live in
[policy.ts](policy.ts).
