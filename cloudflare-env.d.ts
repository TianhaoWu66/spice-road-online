interface D1Meta { changes?: number }
interface D1Result<T = unknown> { results: T[]; success: boolean; meta: D1Meta }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface Fetcher { fetch(request: Request): Promise<Response> }

declare module "cloudflare:workers" {
  export const env: { DB: D1Database; [key: string]: unknown };
}
