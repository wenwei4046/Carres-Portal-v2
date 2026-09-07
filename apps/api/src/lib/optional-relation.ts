/**
 * A relation the deployed schema may not carry yet.
 *
 * The arrival-source objects (Transfer, Customer/failed-delivery return,
 * Return from repair, Supplier replacement) are approved Inbound truth whose
 * tables are still an unnumbered draft. Reading them must therefore mean
 * "this source kind has no records", never "the whole register failed" — a
 * page that refuses to open teaches the operator nothing, while an empty
 * source kind is the literal truth until those tables land.
 *
 * The degrade is narrow ON PURPOSE. A missing TABLE or COLUMN is a schema
 * fact; a permission denial, an RLS refusal or any other error is a real
 * failure and still travels, so a broken authority read can never be dressed
 * up as an empty success (the rule `warehouse-inbound.test.ts` already holds
 * the route to). Nothing is cached, so the moment the relation exists every
 * read returns its rows with no deploy, flag or restart.
 */

/** PostgREST/Postgres codes for "that table/column is not in this schema". */
const MISSING_SCHEMA_CODES = new Set([
  "42P01", // undefined_table
  "42703", // undefined_column
  "PGRST200", // requested relationship not found in the schema cache
  "PGRST204", // column not found in the schema cache
  "PGRST205", // table not found in the schema cache
]);

export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && MISSING_SCHEMA_CODES.has(e.code)) return true;
  /* Some PostgREST builds report the schema-cache miss with a null code and
     only the sentence. Match it narrowly rather than on any "not found". */
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the") ||
    message.includes("schema cache")
  );
}

/**
 * Run a read whose relation may be absent. An absent relation yields
 * `fallback`; every other error is rethrown unchanged.
 */
export async function readOptionalRelation<T>(
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingRelationError(error)) return fallback;
    throw error;
  }
}
