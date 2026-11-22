# Repository lint rules

Run `npm run lint:code` for ESLint and repository checks, or `npm run lint` to include formatting and Markdown checks.
CI uses the same code lint command.
Diagnostics identify the file, line, rule, and owning helper or corrective change.

<!-- prettier-ignore -->
| Rule | How to fix a finding |
| --- | --- |
| `enstorstark/no-server-import-in-shared` | Move shared contracts to `$lib/types` and pass server data through a server load or endpoint. |
| `enstorstark/use-location-helper` | Use `watchUserLocation` from `$lib/client/user-location` and call its disposer. |
| `enstorstark/require-api-handler` | Use `export const GET = apiHandler(...)` for API v1 methods, with `apiHandler` imported from `$lib/server/api/http`. |
| `enstorstark/use-api-json-body` | Use `readJsonBody(request, schema)` after the route's authentication or admission check. |
| `enstorstark/review-collection-boundary` | Read reviews through `$lib/server/reviews/queries`, which applies visibility, and write through the shared review workflows. Only the query and write adapters import the raw collection. |
| `mobile/model-boundary` | Keep presentation imports in the app target on iOS or the UI package on Android. Pass data and callbacks across the boundary. |
| `mobile/price-value-parity` | Update the literal volume, rating thresholds, and fallback in all three PriceValue implementations together. |
| `ci/pin-action` | Pin remote actions and reusable workflows to reviewed full commit SHAs and Docker actions to digests. |
| `ci/checkout-credentials` | Set `with.persist-credentials: false` on each checkout step. |
| `ci/no-direct-shell-expression` | Give the expression a step `env` entry and reference the quoted variable in `run`. |

The source checks recognize direct references and common import aliases.
Runtime tests cover authorization, admission order, and visibility inside the query and write adapters.
When a rule needs an exception, use a single-line directive naming the rule and explain why the call is safe or intentional.

Keep new rules close to an established convention and include fixtures for both violations and valid neighboring code in [scripts/lint](../../scripts/lint/).
The tests run with `npm run test:ci`.
