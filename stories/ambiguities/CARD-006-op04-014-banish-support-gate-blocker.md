# CARD-006 OP04-014 Banish Support Gate Blocker

CARD-006 captured OP04-014 as a real Poneglyph-backed candidate for the
already implemented Banish combat keyword. Its checked-in payload has complete
Banish-only printed behavior, no trigger text, no official FAQ entries, and no
variant errata.

The card is not promoted to supported gameplay in this story. The current
engine battle metadata gate rejects real combat cards that carry printed effect
text without a supported effect definition, and Banish keyword behavior must not
add an effect definition or custom handler under CARD-006. Supporting this real
fixture honestly needs a later support-gate story that allows exact reviewed
keyword reminder text, without broadening into new keyword behavior.

Until then, OP04-014 stays in the real manifest fixture as unsupported and must
fail closed in ranked deck/loadout validation and engine-core runtime tests.
