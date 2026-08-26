/**
 * Test stand-in for the `server-only` package.
 *
 * The real package throws unless imported from a react-server environment,
 * which a Vitest node process is not. The Next.js build still enforces the
 * boundary for real — this stub only exists so unit tests can import the
 * services behind it.
 */
export {};
