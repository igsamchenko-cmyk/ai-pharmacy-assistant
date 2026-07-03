/**
 * Runtime knowledge-source flag.
 *
 * v0.4 keeps the static TS knowledge modules as the default runtime source. A DB
 * -backed runtime is available behind an explicit, opt-in feature flag so it can
 * be developed and tested without changing default behavior. The flag is OFF
 * unless `KNOWLEDGE_DB_RUNTIME` is exactly the string "true".
 */
export const KNOWLEDGE_DB_RUNTIME_ENV = "KNOWLEDGE_DB_RUNTIME";

/** True only when KNOWLEDGE_DB_RUNTIME is explicitly "true". Default: false. */
export function isDbRuntimeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[KNOWLEDGE_DB_RUNTIME_ENV] === "true";
}
