# TODO

## Curator API (via Blacksmith)

- [ ] **Blacksmith:** Implement module API registration so optional modules (Curator, Scribe, etc.) can register an API object and have it exposed as `BlacksmithAPI.curator`, etc. Same timing as hooks/menubar. See spec in chat (requirements for Blacksmith developer).
- [ ] **Curator:** Implement and expose API; register with Blacksmith when mechanism exists:
  - `updateTokenImages()` – update all token images on current canvas
  - `updatePortraitImages()` – update all portrait images on current canvas
  - `updateTokenImage(tokenOrTokenDocument)` – replace image for a single token
  - `updatePortraitImage(actorOrTokenOrTokenDocument)` – replace portrait for a single actor
  - `openTokenWindow(opts?)` – open token window; `opts: { token?, tokenDocument? }` to pre-select
  - `openPortraitWindow(opts?)` – open portrait window; `opts: { actor?, token?, tokenDocument? }` to pre-select
- [ ] **Curator:** Normalize API inputs: accept canvas `Token`, `TokenDocument`, or `Actor`; derive as needed for processing and for "selected" context in windows.


## Burying a body destroys its XP (fix owned by Blacksmith)

Confirmed 2026-08-08 against the code, not suspected. Blacksmith took the fix the same day.

Foundry removes a Combatant when its Token is deleted (`TokenDocument#_onDelete` calls `deleteCombatants`).
Blacksmith's `XpManager` computes the award on the `deleteCombat` hook from `combat.combatants`
(`xp-manager.js:337`, `getCombatMonsters`). So the roster is read **at combat end, from current state**: a
body buried during the encounter is not in it, and its XP is silently gone. Nothing errors and nothing warns.

Two paths reach it, and the automatic one is worse:

- **Manual Bury** during combat. At least a GM approves it, so there is a moment to intervene.
- **`lootBuryWhenEmpty`** auto-buries a fully-looted body. No dialog, no GM involvement — a player empties a
  corpse mid-fight and the XP disappears. This is the sharper case and the one to fix first.

**Blacksmith is fixing this, and that closes it.** The fix is the one proposed: derive the award from
history rather than from the roster at combat end. It covers every cause of a mid-combat token deletion, of
which Curator is only one — a GM deleting a token by hand hits the same hole, and no Curator-side guard would
have helped there.

XP was the outlier, not the pattern. `stats-combat.js` already accumulates as combat happens — hits, misses,
and expired turns are pushed into `currentStats` at the moment they occur (`_boundedPush`, e.g. `:1613`), so
it never depended on the roster surviving. `XpManager` reading `combat.combatants` at the end was the one
place doing it the fragile way, and the history-based model it needs already exists in the same codebase.

**Curator should implement none of the three mitigations previously listed here** (warn in the bury dialog,
suppress `lootBuryWhenEmpty` during combat, refuse bury during combat). Every one was justified by the XP
loss and nothing else. Combat stats are unaffected. What remains is that a token can vanish from the canvas
and the tracker mid-fight — surprising, but it is a GM opt-in setting that is off by default, and it is taste
rather than correctness.

There is also an active reason **not** to guard it right now: a Curator-side block on mid-combat deletion
would prevent the exact scenario Blacksmith needs in order to test their fix.

Worth confirming with Blacksmith: whether the fix covers the roster generally or only the XP award, and
whether anything else of theirs still reads `combat.combatants` at combat end.

Sequencing note retained in case a deferred bury is ever added for other reasons: it would need to run
**after** Blacksmith's `deleteCombat` handlers. Curator's existing one converts held bodies and deletes
nothing, so there is no ordering hazard today.

## Async writes must re-check the document still exists

Reported by Blacksmith 2026-08-08; four instances found and fixed in Curator the same day. Recorded as a
pattern because it has now bitten two modules, in code neither team was thinking about at the time.

`_onTokenCreated` runs a settle delay and a matching pass before it writes. A token deleted inside that
window leaves every later write aimed at a document that is gone —
`undefined id [...] does not exist in the EmbeddedCollection`. It surfaced as an **uncaught** rejection
because both `update()` calls were wrapped in try/catch but the `setFlag()` that stored the original
portrait was not, so it was the only one that could escape.

Two rules for anything on this path:

- Re-check with `_tokenStillExists` / `_actorStillExists` **after every await**, not once at entry. A guard
  at the top of an async function proves nothing about the state ten awaits later.
- An unlinked token's Actor is synthetic and dies with its token, so `actor.setFlag` on one goes at the
  token's embedded document and fails the same way. Checking the Actor is not enough; check its token.

A try/catch around each write is the backstop, not the fix — swallowing the error would still mean doing
pointless work and logging noise. A caught version is not a fixed version: Blacksmith's own instance
(`token-movement.js:1090`, a follower moved step by step against a reference captured before the pathfinding
await) fails loudly rather than silently, and still keeps moving a token that no longer exists while
reporting "error moving X" instead of "X is gone".

**Why it stayed hidden.** Blacksmith's harness creates and deletes a token within a few hundred milliseconds
— a timing no human produces by hand. A suite that churns documents quickly will surface await-races that
ordinary play conceals for months. Treat "only reproducible under the harness" as a reason to fix, not a
reason to discount.

The checks live in `document-liveness.js` as `isTokenAlive` / `isActorAlive`, one definition rather than a
copy per caller. A sweep of Curator on 2026-08-08 found three more instances of the same shape, all fixed:

- The delayed loot conversion re-found its token after the timer, then wrote the loot image using the
  reference captured *before* the delay. The re-find was there; the write ignored it.
- `_convertTokenToLoot` marked a body ready after loot generation had awaited, without re-checking.
- `_processBury` deleted a token after a GM approval dialog that stays open for as long as the GM leaves it.

## Do not fork Blacksmith code

Two forks found and deleted 2026-08-08, both reported by Blacksmith, both carrying bugs the hub had already
fixed. This is the same shape as Regent's forked window base, which they already track.

- **`ui-context-menu.js`** — 276 lines, same filename and class name as Blacksmith's, used by the token
  image replacement and tile image windows. Missing four fixes: dismissal bound in the bubble phase (a
  consumer calling `stopPropagation` trapped the menu open), Escape closing the application instead of the
  menu, a 150ms arming delay that swallowed genuine outside clicks, and no height cap so a long menu ran off
  screen unreachable. A diff confirmed the fork contained **nothing** the shared version lacked — the only
  lines unique to it were the four defects.
- **`manager-hooks.js`** — 520 lines, 86% identical to Blacksmith's. Missing the `renderChatMessage` →
  `renderChatMessageHTML` remap, general `pre*` cancellation (only `preUpdateToken` worked), and context on
  the callback record, which meant every Curator hook reported as context "default" in Blacksmith's stats
  tooling.

Both are now thin accessors that forward to the shared implementation and cannot drift. The files were kept
rather than removed outright so the filename someone would search for explains why the fork is gone.

**The rule.** A copy taken before a fix keeps the problem the hub has solved and can never pick up anything
that lands later. You find those bugs yourself, eventually, one confusing report at a time. If Curator needs
behaviour a shared component lacks, send it to Blacksmith as a change to theirs — do not fork.

**How to spot one.** Compare filenames against `coffee-pub-blacksmith/scripts/`; a shared name is the tell.
`const.js` and `settings.js` share names legitimately, since their content is per-module. Anything else
warrants a diff.

## Shop Tokens (idea, not scheduled)

Mark a token as a **shop** ahead of time and reuse the corpse-looting machinery with different rules. Recorded
2026-08-08 as a direction to evaluate, not an accepted feature.

Note this deliberately revisits an explicit exclusion. `plan-loot.md` section 2 rules out "merchants, stores,
buying, selling, pricing, or restocking" — that was a scoping decision to keep corpse looting shippable, not
a judgement that shops are wrong. Revisiting it needs a fresh decision, not an assumption that the exclusion
lapsed.

What carries over largely unchanged:

- The flag-driven state model on the Token, with `generationId` for staleness. A shop is a different `kind`
  on the same shape.
- The whole GM-authoritative socket path: request, re-resolve every UUID, revalidate, mutate, broadcast.
  Authorization is the expensive part and none of it is corpse-specific.
- `blacksmith.inventory` for every mutation, including the batch forms.
- The window shell, the row layout, the quantity and entity-list pickers, and the failure-code rendering.
- Proximity, combat gating, and the recipient policy.

What does not carry over, and is where the real work is:

- **Money flows both ways.** Looting is a one-way transfer with no cost. A purchase is two coupled transfers
  that must both succeed or both roll back, and `transferCurrency` plus `transferItem` are separate
  primitives with separate locks. This is the hard part and probably wants a Blacksmith primitive rather
  than Curator orchestrating two calls.
- **Stock is not inventory.** A corpse holds what it holds. A shop needs prices, and a decision about
  whether stock is finite, restocking, or infinite — none of which the Actor's item list expresses.
- **Selling** means accepting items from a player, which inverts the trust model: the GM handler currently
  only ever validates that a player may *receive*.
- **The ledger is wrong for a shop.** "Looted by" as an append-only record of what left the body is exactly
  the wrong shape for stock that can be replenished.
- **Interaction gating.** `isLootable` is a corpse-state read. A shop is presumably always interactive,
  which changes what the token claim matches on.

**Why this is tracked here.** Not because it belongs to Curator. With Blacksmith owning the mutation engine,
a shop has no dependency on this module at all — it needs `api.inventory`, the socket path, and the window
base, all of which are Blacksmith's or reproducible from them. It is filed here because corpse looting is the
closest working model of the thing, so this is where the transferable parts and the gaps are legible. Expect
it to move once it is scoped; do not treat its location as a decision.

Still to settle: whether prices live on items, on the token, or in a table; and whether the two-sided
transfer becomes a Blacksmith primitive before anyone attempts the workflow on top of it.

## Curator UI

- Decide how Curator should handle asset defaults that currently point into Blacksmith paths. Confirm whether those assets should stay shared, be duplicated into Curator, or be redirected through a Blacksmith-provided asset API/constant layer.
- Migrate the neutral chat-card theme from internal `default` / `theme-default` naming to `tan` / `theme-tan` for consistency with the other color themes. This needs a deliberate migration plan because saved world settings, existing templates/selectors, and dependent Coffee Pub modules may still rely on the current IDs/classes.