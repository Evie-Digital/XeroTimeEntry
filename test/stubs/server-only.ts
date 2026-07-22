// test/stubs/server-only.ts — empty stand-in for the `server-only` package.
//
// The real package throws when imported outside a React Server Components
// environment — that's its whole job (a build-time poison-pill against client
// imports of server modules like lib/xero/session.ts). Vitest runs in jsdom
// with no RSC bundler, so tests alias `server-only` to this no-op module
// instead (see resolve.alias in vitest.config.ts).
export {};
