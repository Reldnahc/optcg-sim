# CARD-006 OP04-014 Banish Support Gate Blocker

CARD-006 captured OP04-014 as a real Poneglyph-backed candidate for the
already implemented Banish combat keyword. Its checked-in payload has complete
Banish-only printed behavior, no trigger text, no official FAQ entries, and no
variant errata.

Resolved by ENG-040. The current engine support gates now classify
parenthetical explanatory notes under `02-engine-mechanics.s045` without
mutating printed text, source hashes, behavior hashes, or display-facing
manifest data. OP04-014 is promoted only through already implemented Banish
keyword behavior and does not add an effect definition or custom handler.

OP04-014 should remain supportable only while its remaining non-parenthetical
printed effect text is the exact supported Banish keyword body and its
`printedKeywords` metadata includes `banish`. Unsupported extra text or missing
keyword metadata must still fail closed.
