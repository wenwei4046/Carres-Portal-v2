-- 0353 · AN OPERATOR SCREEN SPEAKS ONE LANGUAGE
--
-- Owner ruling 2026-08-15 (Chai): remove the Chinese from
-- `AutoCount Archive (旧账)`. It reached the screen through Edit → Order
-- context, where the dealer picker prints `dealers.name` verbatim.
--
-- ⭐ THE STRING WAS NEVER IN THE CODE. Every English-only sweep this repo has
-- run passed over it because it is a DATA row, and the screen was telling the
-- truth about what the row says. So the fix belongs to the row, not to a
-- display-layer special case — masking one value in code would leave the next
-- one to be found by eye.
--
-- `dealers` is CONFIGURATION, not a transaction: `CLAUDE.md` §6 says the
-- transactions start clean at go-live and the configuration is what survives,
-- so this row will still be here and must already be right.
--
-- The rename is a DISPLAY LABEL only. The id, the channel, every order
-- attributed to it and every FK are untouched, and the previous value is
-- recorded above, so this is reversible by inspection.
--
-- Idempotent, and asserts NO row count (`CLAUDE.md` §5.8): a database where
-- the row was already renamed, or never existed, applies this as a no-op.

update dealers
   set name = 'AutoCount Archive'
 where name = 'AutoCount Archive (旧账)';
