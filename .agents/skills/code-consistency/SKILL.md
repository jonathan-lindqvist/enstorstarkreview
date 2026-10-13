---
name: code-consistency
description: Review and preserve this repository's TypeScript and Svelte coding conventions when implementing or reviewing application changes. Use for function-style consistency, naming, imports and module boundaries; avoid repository-wide rewrites unless requested.
---

# Code consistency

Read [AGENTS.md](../../../AGENTS.md) and the relevant topic guide. For behavior changes,
also follow [secure-tdd](../secure-tdd/SKILL.md); for UI follow [DESIGN.md](../../../DESIGN.md).

## Function definitions

- Match the dominant convention in the existing module. Server workflows generally use
  exported `const` arrow functions; some utility modules consistently use named declarations.
  Both are established conventions, rather than evidence of an error by themselves.
- Use named functions for substantial Svelte event handlers and lifecycle actions. Keep short
  callbacks and pure derived helpers as arrows. Extract a repeated or substantial inline handler
  when touching it; do not rewrite every template callback.
- Keep route exports as typed `const` handlers using `PageServerLoad`, `Actions` or
  `RequestHandler`; use async arrows for new handlers. Existing typed function expressions need
  normalization only when their handler is otherwise being edited.
- Never change a function form mechanically when hoisting, `this`, `arguments`, overloads or
  constructor behavior matters. Preserve semantics and test the affected behavior.

## Naming, imports and ownership

- Use descriptive camelCase functions/values, PascalCase types/components and uppercase shared
  constants. Follow existing domain vocabulary rather than inventing aliases for the same rule.
- Keep imports together at the top, group type-only imports with their domain, and follow the
  module's existing alias/relative-path convention. Remove unused imports.
- Keep browser contracts in `lib/types`, pure calculations in `lib/utils`, and database/workflow
  code in `lib/server`. Browser components must not import server modules.
- Reuse the owning helper/component for shared rules. Keep routes thin, permission checks before
  protected reads, native fields intact and disposable browser resources cleaned up.
- Let Prettier/ESLint enforce tabs, single quotes and formatting. Do not add a style dependency or
  disable rules to impose a preferred function syntax.

## Bounded review

Inspect touched modules and their immediate peers. Separate observable inconsistencies from
intentional differences between file types. Normalize touched code, then run the relevant checks
from AGENTS.md. Summarize concrete findings and any deliberate exceptions; avoid unrelated churn
or tests that assert formatting text.
