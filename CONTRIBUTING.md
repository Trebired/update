# Contributing

This package follows the standard Trebired npm package workflow:

- keep the public API generic and product-agnostic
- prefer additive changes over host-specific branching
- run `bun run typecheck`, `bun test`, and `bun run verify:pack` before publish work

The package is intended to be reusable across different products and deployment topologies, so avoid baking in service names, repository assumptions, or process-manager-specific behavior.
