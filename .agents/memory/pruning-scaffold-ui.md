---
name: Pruning scaffold UI components & deps
description: Safe technique for removing unused shadcn/ui components and their npm deps from an artifact.
---

# Pruning unused scaffold UI (shadcn/ui) and dependencies

The React scaffold ships ~45 shadcn/ui components in `components/ui`, most unused.
Removing them safely requires **transitive-closure** analysis, not just a raw
reference count — a component can look "used" while its only importers are
themselves unused (e.g. `label` ← only `form`/`field`; `toggle` ← only
`toggle-group`; `dialog` ← only `command`; `sheet` ← only `sidebar`).

**How to apply:**
1. For each `components/ui/*.tsx`, count references excluding its own file.
2. Zero-ref files are dead. For 1–2 ref files, check *who* imports them; if all
   importers are themselves dead, the file is transitively dead too.
3. Delete the dead closure, then `pnpm --filter <artifact> run typecheck`.
4. Prune npm deps that were only used by deleted files (radix packages, cmdk,
   embla, vaul, recharts, react-day-picker, react-hook-form, etc.). Verify each
   with a src-wide grep before removal; keep ones still imported (e.g.
   `@radix-ui/react-slot` powers `button`).
5. Typecheck again and restart the workflow — Vite auto re-optimizes deps.

**Why:** naive ref-count deletion breaks the build when a kept component
transitively imports a "0-ref" leaf; the closure approach avoids that. Keeping the
dep list in sync with the file list prevents dead weight in the lockfile.
