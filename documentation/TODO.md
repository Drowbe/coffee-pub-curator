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


## Burying a body destroys its XP (cross-module, unresolved)

Confirmed 2026-08-08 against the code, not suspected.

Foundry removes a Combatant when its Token is deleted (`TokenDocument#_onDelete` calls `deleteCombatants`).
Blacksmith's `XpManager` computes the award on the `deleteCombat` hook from `combat.combatants`
(`xp-manager.js:337`, `getCombatMonsters`). So the roster is read **at combat end, from current state**: a
body buried during the encounter is not in it, and its XP is silently gone. Nothing errors and nothing warns.

Two paths reach it, and the automatic one is worse:

- **Manual Bury** during combat. At least a GM approves it, so there is a moment to intervene.
- **`lootBuryWhenEmpty`** auto-buries a fully-looted body. No dialog, no GM involvement — a player empties a
  corpse mid-fight and the XP disappears. This is the sharper case and the one to fix first.

**The right fix is Blacksmith's, and it is the one already proposed: derive XP from history rather than from
current state.** Record defeated combatants as they are defeated, or snapshot the roster at combat start, so
the award does not depend on the token still existing when the encounter ends. That also fixes every other
cause of a mid-combat token deletion, of which Curator is only one.

Curator-side mitigations, none implemented, in increasing order of restriction:

1. Warn in the bury approval dialog when the token is a combatant in the active combat. Cheap, keeps GM
   agency, does nothing for the automatic path.
2. Suppress `lootBuryWhenEmpty` while its token is in an active combat, and sweep at `deleteCombat`. Closes
   the silent path and matches the deferral `tokenConvertAfterCombat` already uses.
3. Refuse bury outright during combat. Safest, most restrictive, and arguably not Curator's call to make.

Sequencing note if a deferred bury is ever added: it must run **after** Blacksmith's XP hook, which is
`deleteCombat` at priority 3. Curator's existing `deleteCombat` handler converts held bodies and deletes
nothing, so there is no ordering hazard today — a bury sweep would introduce one.

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