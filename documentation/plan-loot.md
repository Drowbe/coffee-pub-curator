# Curator Looting Plan

**Status:** Phase 1 in progress. Item Piles integration is already fully removed (see section 14).
Blacksmith has **shipped** `api.tokens.registerInteraction` to `master`, untagged, ahead of `api.inventory`
(contract in section 6). Curator owes them the unprivileged-client verification pass; nothing of Curator's
is waiting on Blacksmith except item transfer.
**Target:** Focused corpse looting owned by Curator
**Architecture record:** Create `architecture-loot.md` as verified behavior lands. Do not copy this plan into the architecture document unchanged.

## 1. Objective

Replace Curator's narrow Item Piles dependency with a native corpse-looting workflow.

Curator already detects death, generates loot, adds items and currency to the dead Actor, changes the token image, and restores token state after revival. The new work exposes that prepared inventory to players and safely transfers selected contents to their characters.

The result should feel like a purpose-built loot window, not a smaller clone of Item Piles.

## 2. Scope

### Included

- Mark a Curator-managed dead token as lootable after loot generation completes.
- Open a loot window by interacting with that token.
- Display the corpse's available physical items and currencies.
- Inspect an item by opening its sheet when permitted.
- Take a whole item or a selected quantity from a stack.
- Take currency.
- Take all available contents when enabled.
- Select or resolve the receiving Actor when a user owns more than one eligible Actor.
- Execute mutations authoritatively through the GM.
- Refresh all open loot windows when contents change.
- Handle an empty corpse according to a world setting.
- Remove lootability and restore Curator state when the token is revived.
- Remove Item Piles checks, flags, conversion calls, reversion calls, and user-facing dependency warnings from Curator. Completed in Phase 1; see section 14.

### Explicitly excluded

- Merchants, stores, buying, selling, pricing, or restocking.
- Generic piles dropped onto the canvas.
- Item Piles configuration compatibility.
- Sharing entitlements or per-player reserved shares.
- Trade requests or recipient approval workflows.
- Container hierarchies.
- Automatic token image replacement based on a single remaining item.
- Macros that run when a pile is opened.
- A system-agnostic inventory framework. The first implementation targets D&D 5e.

## 3. Ownership Boundary

### Curator owns

- Death and revival integration.
- Loot generation.
- Corpse state and token interaction.
- Recipient eligibility and loot policy.
- Loot window presentation.
- Take, Take All, and empty-corpse workflows.
- Curator-specific notifications, sounds, and settings.

### Blacksmith owns or should own

- Canvas token interaction claiming, including the permission relaxation that makes a corpse reachable by a
  player with no Actor permission. Confirmed and in progress.
- Window base classes and shared styling.
- Entity selection and quantity-selection controls.
- Socket infrastructure.
- Toasts and sound helpers.
- Low-level, authoritative item and currency mutation primitives, if the proposed Inventory API is accepted.

### Blacksmith must not own

- Whether a user is allowed to loot a corpse.
- Which Actors qualify as recipients.
- Interaction distance.
- Corpse lifecycle or deletion policy.
- Curator window behavior or messages.

## 4. Blacksmith Inventory API Dependency

Propose a low-level API rather than a shared Transfer/Share workflow:

```js
await blacksmith.inventory.transferItem({
    sourceActorUuid,
    targetActorUuid,
    itemId,
    quantity
});
```

The primitive should resolve fresh documents, reject a same-Actor transfer, validate quantity, create the target Item, reduce or delete the source Item, serialize requests for the same source Item, attempt rollback after partial failure, and return a structured result.

A D&D 5e currency companion should accept explicit denominations:

```js
await blacksmith.inventory.transferCurrency({
    sourceActorUuid,
    targetActorUuid,
    currency: { cp: 10, sp: 4, ep: 0, gp: 2, pp: 0 }
});
```

Curator also needs the source-less pair, `grantItem` and `grantCurrency`, for loot *generation*. Rolling a
loot table and adding random coins have no source Actor, so `transferItem` cannot express them.
`loot-utilities.js` currently owns both, and its coin path is an absolute-total read-modify-write that races.
Migrating generation onto the primitives is in scope, not a later cleanup.

Socket routing, authorization, interaction rules, and notifications remain in Curator.

Blacksmith's accepted design lives in `coffee-pub-blacksmith/documentation/plans/plan-inventory-api.md`.
That document is the contract. Where this plan and that one disagree, that one wins and this one is wrong.

### Integration rule

Do not build a second permanent item-transfer engine in Curator while the Blacksmith API request is active. A temporary adapter is acceptable only if it has the same contract as the proposed API and is explicitly scheduled for deletion.

**The adapter now exists and this rule is what governs it.** `loot-transfer.js` implements `transferItem`
and `transferCurrency` to the contract above — same call shape, same success shape, same error codes, same
per-Actor locking, same create-target-then-reduce-source ordering, same reset set and merge predicate. Every
entry point checks `blacksmith.inventory` first and delegates when it is present, so the local
implementation stops executing on the day Blacksmith ships without a Curator change. Retiring it is deleting
the file and re-pointing two imports.

Nothing Curator-specific may be added to it. Authorization, recipient policy, distance, and notifications
live in `manager-loot.js`. `grantItem` and `grantCurrency` are deliberately **not** adapted: loot generation
still uses `loot-utilities.js` and migrates when Blacksmith ships, per Phase 3.

## 5. Corpse State Model

Use Curator flags as the authoritative marker. Do not infer lootability merely from `hp === 0`, an image path, or the presence of inventory.

The state should record enough information to validate interaction without copying Actor inventory into flags. Candidate fields:

```js
flags[MODULE.ID].loot = {
    enabled: true,
    state: "ready",
    preparedAt: 0,
    preparedBy: "user-id",
    sourceActorUuid: "Actor...",
    generationId: "..."
}
```

Expected states:

- `preparing`: death processing and loot generation are in progress.
- `ready`: interaction and transfer are allowed.
- `empty`: no transferable contents remain.
- absent/disabled: this is not a Curator loot corpse.

The `generationId` distinguishes the current death event from stale windows or delayed socket requests. Revival clears or invalidates it.

`state === 'ready'` is read synchronously on every double-click by Blacksmith's interaction registry, twice
per gesture, and a promise returned from that read would grant the gesture unconditionally. The state model
therefore carries two hard constraints: the readiness test stays a plain flag read, and it returns the same
answer across two consecutive calls. See section 6.

## 6. Interaction Model

1. The token reaches the configured death condition.
2. Curator marks it `preparing`.
3. Curator generates items and currency and applies the loot image.
4. Curator marks it `ready` only after generation succeeds.
5. A user interacts with the token to open the loot window.
6. Curator validates visibility, distance, corpse state, and recipient eligibility.
7. The user submits a Take action.
8. The GM re-resolves every UUID and revalidates the request.
9. Blacksmith's inventory primitive performs the mutation.
10. Curator broadcasts a content-changed event and every open window refreshes.
11. When no transferable contents remain, Curator applies the configured empty-corpse behavior.

### Gesture

**Every canvas token gesture is permission-gated, so none of them is available to Curator without
Blacksmith.** Verified against Foundry v13 `_createInteractionManager` (`foundry.mjs:82565`):

| Gesture | Permission | Token requirement |
|---|---|---|
| `clickLeft` | `_canControl` | ownership (`foundry.mjs:143215`) |
| `clickLeft2` | `_canView` | LIMITED on the Actor (`foundry.mjs:143253`) |
| `clickRight` | `_canHUD` | GM or **OWNER** (`foundry.mjs:143226`) |
| `clickRight2` | `_canConfigure` | update permission |

A canvas token context menu is therefore *stricter* than double-click, not a workaround for it. An earlier
revision of this section called the context menu a zero-dependency fallback; that was wrong and is
corrected here.

#### Phase 1 entry point: the corpse chat card

Curator already posts a loot chat message on death (`tokenLootChatMessage`). Add the loot entry point there.
Chat cards carry no canvas permission gate, every player can see and click one, and it needs nothing from
Blacksmith. The card carries the Token UUID; the button calls `LootManager.open`, which re-resolves and
re-validates. This is what unblocks Phases 2 through 4.

Consequence for the setting: with the card as the interaction surface, `tokenLootChatMessage` can no longer
simply suppress it. Split announcement from access, or make the card unconditional when looting is enabled.

#### Canvas gestures: `blacksmith.tokens.registerInteraction` — shipped

Implemented and on Blacksmith `master` (4ab16566), ahead of `api.inventory`. Untagged, so `module.json`
still reads 13.15.3 while the code is present in the install. Build against it now. Reference:
Blacksmith wiki, *API: Tokens* and *Architecture: Token Interactions*.

Why an API and not a hook, kept because it is the reason the shape is what it is: `Token#_onClickLeft2`
(`foundry.mjs:143318`) emits no hook, the permission predicate runs before the handler
(`foundry.mjs:81334`), and `HookManager` discards non-`pre` return values (`manager-hooks.js:94`). No hook
can participate in a decision that has already been made.

```js
const api = game.modules.get('coffee-pub-blacksmith').api;

this._lootClaim = api.tokens.registerInteraction({
    id: 'curator-loot',
    module: 'coffee-pub-curator',
    gesture: 'clickLeft2',
    priority: 2,
    matches: (tokenDocument, user) => LootManager.isLootable(tokenDocument),
    bypassPermission: true,
    handler: (token, event) => LootManager.open(token.document),
    context: 'curator-loot'
});

// teardown
api.tokens.disposeByContext('curator-loot');
```

`matches` receives the Token **document**; `handler` receives the Token **placeable**. Registration belongs
in `LootManager.initialize()`, which is currently an empty stub holding the place.

**Feature-detect before registering.** The registry is unreleased. Until Blacksmith tags a build carrying
it, `api.tokens?.registerInteraction` is absent for anyone on a released Blacksmith, and Curator's
`module.json` requires only the manifest, not a version. Guard the call and fall back silently to the chat
card; do not warn a user about a capability they never asked for.

**Contract, and what each point obliges Curator to do:**

- **Foundry gesture keys, not friendly names.** `clickLeft2`, not `doubleClick`. `api.tokens.ALLOWED_GESTURES`
  is authoritative. Only `clickLeft2` and `clickRight2` are claimable; anything else throws with a readable
  message, because the rest drive selection, dragging, and hover. The registry is gesture-keyed throughout,
  so widening it is small — but Curator must not plan around a gesture it has not justified.
- **`matches` must be synchronous, and cannot be async.** This is a correctness rule, not a style
  preference: Foundry's permission predicate is synchronous and **a promise is truthy**, so returning one
  would grant the gesture unconditionally. `LootManager.isLootable` already satisfies this — a single
  `getFlag` read — and must stay that way. Recipient eligibility, distance, and any UUID resolution belong
  in `LootManager.open` and in the GM handler, never here.
- **`isLootable` must be stable across two consecutive calls.** Foundry evaluates permission and dispatches
  the handler in two separate calls, so Blacksmith re-verifies the claim at dispatch and suppresses rather
  than falls through if it stopped matching. A double-click that does nothing on a token that looks lootable
  means `isLootable` is unstable between the two calls. Report that to Blacksmith rather than working around
  it. Concretely: never let `isLootable` depend on anything transient — selection, distance, hover state,
  time, or an in-flight request.
- **A thrown handler is a dead gesture, not a fallback.** Blacksmith deliberately does not fall through to
  Foundry's handler on error, because `bypassPermission` may already have granted the gesture and falling
  through would open the Actor sheet to a player who could not otherwise open it. Curator's handler must
  never throw and never return a rejected promise: wrap `LootManager.open` in `try/catch` **and** attach a
  `.catch()`, since `open` is async and a rejection would not surface synchronously. A failure produces a
  Curator notification, not silence.

**Evaluation timing, and why the earlier draft of this section is void.** Blacksmith evaluates `matches`
**per gesture**, not once per token draw. An earlier revision of this plan derived a whole redraw-staleness
requirement from the draw-time model in their design note: that `markReady` and `clear` each needed a
guaranteed re-evaluation, that the death sequence was correct only by accident of `updateTokenImage`
following `markReady`, and that Curator should request a `refreshInteraction` call. **All of that is void.**
Blacksmith changed the model deliberately, citing exactly our central case — a creature that dies
mid-session becomes lootable without redrawing, and a draw-time decision would leave that corpse
unclaimable. Nothing in Curator needs to force a redraw, and the ordering of `markReady` against the loot
image swap no longer affects interaction. The cost is that `isLootable` runs on every double-click, which
the stability and synchronicity rules above already cover.

**Mechanism, recorded because it bounds our risk.** Blacksmith patches one token instance's one gesture key
rather than wrapping `Token`'s predicates at class level. An unmatched token is untouched rather than
merely permitted-as-before, so the `bypassPermission` scoping is structural rather than disciplined.
Blacksmith also confirmed `Token#_canView` has exactly one consumer in the entire v13 client — the
`clickLeft2` entry in the permissions map. Record that as a fact about v13 today, not a guarantee to build
on; re-verify it against v14.

`LootManager.open(tokenDocument)` remains the guarded entry point that both the gesture and the chat card
call. It re-checks `isLootable` independently of the registry.

## 7. Recipient Resolution

Eligible recipients are D&D 5e character Actors the current user owns. The corpse Actor must never be eligible.

Suggested behavior:

- One eligible Actor: select it automatically.
- Multiple eligible Actors: remember the last valid choice and expose a Blacksmith entity-list selector.
- No eligible Actor: explain that the user has no owned character available to receive loot.
- GM: allow selection from eligible character Actors, with an option to inspect the corpse without choosing a recipient.

The recipient UUID travels with each request but is never trusted without GM-side validation. The window
uses a plain select rather than Blacksmith's entity-list; revisit if the list ever needs search or portraits.

### Give To, and the boundary it moves

Give To hands an item to a character the acting user does not own, with no approval from the recipient or
the GM. That is a deliberate decision and it moves two lines this plan drew elsewhere: section 2 excludes
trade and approval workflows, and the rule above restricts recipients to Actors the user owns. Both still
stand for *taking*; Give To is the single exception, and the GM handler encodes it as exactly that.

The GM accepts a recipient when the requester owns it, **or** it is a character in the primary party, **or**
it is the party Group Actor. Anything else is `RECIPIENT_NOT_ALLOWED`, so a client cannot name an arbitrary
Actor.

### Party

The party is the dnd5e primary party Group Actor (`game.actors.party`), which carries its own inventory and
currency. Party characters come from `system.playerCharacters`, falling back to every player-owned character
Actor when no primary party is configured. Where no party exists the Party and All to Party controls are
disabled with the reason stated, rather than hidden.

## 8. Loot Window

Build an Application V2 window on Blacksmith's shared window base.

### Header

- Corpse name and image.
- Current recipient, with a selector when applicable.
- Optional GM-only Open Actor Sheet action.
- Close action supplied by the window base.

### Item list

Each row should show:

- Item image.
- Item name.
- Available quantity when the Item has a numeric quantity.
- Take button.

Clicking the name or image may open the Item sheet when inspection is enabled. A stack transfer opens Blacksmith's Quantity Split control. A single-quantity Item transfers immediately or after a lightweight confirmation, based on live usability testing.

The window must render from current Actor data. It must not hold a snapshot as the mutation authority.

### Currency

- Show only supported denominations with nonzero values.
- Support taking a denomination amount.
- Consider a Take All Currency action.
- Do not include equal-party splitting in the first implementation.

### Actions

Implemented surface:

| Control | Where | Sends to |
|---|---|---|
| Take | item row, currency row | the acting recipient |
| Give | item row | any party character, chosen in a dialog |
| Party | item row, currency row | the dnd5e primary party Group Actor |
| Distribute | currency header | every party character, split evenly |
| Take All | footer | the acting recipient |
| All to Party | footer | the party Group Actor |
| Bury | subject card | nobody; deletes the token after GM approval |
| Sheet (GM), Close | footer | — |

Take prompts for a quantity through Blacksmith's Quantity Split only when the stack is above one. A
single-quantity row transfers on click.

Disable actions while that window has a request in flight. This is user feedback, not the concurrency guarantee.

## 9. Authorization and Concurrency

All player-initiated mutations must run on the authoritative GM client through Blacksmith's socket API.

The GM handler must:

- Confirm the requesting user still exists and is active enough for the request.
- Resolve the scene, token, source Actor, recipient Actor, and source Item from UUIDs/IDs.
- Confirm the token still carries the matching `ready` loot flag and `generationId`.
- Confirm the requester may observe/interact with the token.
- Recalculate distance using current token positions.
- Confirm the requester owns the recipient Actor, except for an explicit GM bypass.
- Confirm the requested quantity is a positive integer and remains available.
- Invoke the shared mutation primitive.
- Return a structured result to the requester.
- Broadcast a refresh only after a successful mutation.

Concurrent requests against the same source Item or currency denomination must be serialized on the authoritative client. UI button disabling alone is insufficient.

## 10. Item Rules

Mutation semantics belong to `api.inventory`, not to this plan. An earlier draft of this section restated
its own copy rules and specified no stack merging; that is superseded. Curator must not carry a second,
competing description of how an Item moves.

What Curator owns here is which Items are *offered*:

- Allowed D&D 5e types are `weapon`, `equipment`, `consumable`, `tool`, `loot`, and `container`. This matches
  the primitive's `ITEM_NOT_TRANSFERABLE` whitelist. Natural weapons, monster features, classes,
  subclasses, spells, and effects must never appear merely because they are embedded Items on the NPC.
- The corpse is presented flattened: container contents are listed as individual rows and a container that
  still holds contents is not offered. The primitive rejects it with `CONTAINER_HAS_CONTENTS`, and
  flattening is better looting UX independently.
- Stacking on arrival defaults to `merge`. Curator passes no `stack` override and no `ignoreFlags`; it
  writes no transient flags to Items.

Behavior verified in play goes to `architecture-loot.md`. Behavior the primitive defines stays in
Blacksmith's documentation and is referenced, not copied.

## 11. Currency Rules

- Treat `cp`, `sp`, `ep`, `gp`, and `pp` as independent integer balances.
- Never allow a source balance to go negative.
- Add the transferred amount to the recipient's corresponding balance.
- Re-read both balances on the GM immediately before mutation.
- Do not perform automatic denomination conversion.

Distribute splits every denomination evenly across the party using integer division. **The remainder stays
on the corpse** — no conversion, no favouring whoever is first in the list, and the corpse simply is not
empty yet. Distributing 7 gp across 3 characters gives each 2 gp and leaves 1 gp to be taken.
`NOT_ENOUGH_TO_SPLIT` comes back when no denomination divides at least once. This supersedes the earlier
"no party splitting in the MVP" line.

Take All reports partial success and must return an explicit per-line batch result. It cannot be atomic:
the inventory primitive locks per Actor UUID and exposes no batch call, so Take All is N sequential calls
and any of them may fail independently. The window must show which lines moved and which did not.

## 12. Empty and Revival Behavior

World setting candidates for an empty corpse:

- Keep the empty corpse and show an Empty state.
- Disable interaction but leave the token.
- Delete the token.

Choose one safe default during implementation. Deleting a token must occur only after authoritative confirmation that no transferable items or currency remain.

On revival:

- Invalidate the active `generationId` immediately.
- Close or invalidate open loot windows.
- Clear loot flags.
- Restore the token image through Curator's existing restoration path.

Items already taken remain with their recipients. Revival must not synthesize them back onto the revived Actor.

### Repeat death

`token-image-utilities.js` sets a separate `blnLootAdded` flag when generation runs, and `LootManager.clear`
does not remove it. A token that dies, is revived, and dies again is therefore marked `ready` with no fresh
loot, and if the first corpse was looted the second is empty. This is currently unintentional rather than
decided. Choose one and record it in `architecture-loot.md`:

- Generation is once per token, ever. Then a re-killed token must be marked `empty`, not `ready`, when it
  carries `blnLootAdded` and holds no transferable contents.
- Generation is once per death. Then revival must clear `blnLootAdded` alongside the loot flag.

Do not leave the current behavior undocumented in either case.

## 13. Settings

Keep the settings small and domain-specific:

- Enable corpse looting.
- Interaction distance in grid units; zero may mean unlimited if that convention is documented clearly.
- Allow item inspection.
- Enable Take All.
- Empty-corpse behavior.
- Optional loot interaction sound.

Do not recreate Item Piles' per-token configuration interface. Curator flags describe runtime state; world settings describe policy.

## 14. Migration Away from Item Piles

**Done, and done early. This was a deliberate decision, not a sequencing mistake.**

An earlier draft of this section required migration to wait for verified native looting, and section 15
placed removal in Phase 5. Both were overtaken. Item Piles was removed in full during Phase 1, and
`grep -rn "item-piles" scripts/` returns nothing: no availability checks or warnings, no `flags.item-piles`
writes, no `turnTokensIntoItemPiles` or `revertTokensFromItemPiles` calls, no availability data passed to
templates, no dependency labels in settings.

The reason is that Item Piles caused more problems for corpse looting than it solved, and Curator goes live
after native looting works. Nobody is stranded by the gap, so carrying a broken integration through four
more phases bought nothing and would have kept its assumptions alive in the replacement.

The accepted cost is that `main` is temporarily a state where corpses are marked `ready` and cannot be
looted, until the Phase 1 context-menu entry and the Phase 2 transfer path land. Do not ship a build from
that state.

Existing worlds may contain already-converted Item Piles. Do not silently rewrite them. Existing piles
remain owned by Item Piles; newly prepared corpses use Curator's native state.

## 15. Implementation Phases

### Phase 0 — Confirm the shared primitives

Blacksmith is building the interaction registry **first**, then `api.inventory` with `grantItem` as its
first deliverable. Neither blocks Phase 1.

- [x] Submit the Blacksmith inventory API request. Accepted; design lives in Blacksmith's
      `plans/plan-inventory-api.md` and covers `transferItem`, `transferCurrency`, `grantItem`, and
      `grantCurrency` with structured error codes, per-Actor locking, and rollback.
- [x] Submit the token-interaction API request. Approved.
- [x] Blacksmith ships `api.tokens.registerInteraction` (master 4ab16566, untagged). Contract in section 6.
- [ ] **Run the unprivileged-client verification pass and report back.** Owed to Blacksmith, and gating
      their release of the feature. It cannot be run from a GM account, because a GM passes every predicate.
      See the interaction block in section 16.
- [ ] Blacksmith ships `api.inventory`, `grantItem` first. Curator has no transfer path until this lands.
- [ ] Blacksmith tests the primitives before Curator consumes them.

### Phase 1 — State and read-only window

- [x] Add the Curator loot state model.
- [x] Separate loot generation from Item Piles conversion.
- [x] Mark corpses `preparing` and `ready` around the current conversion path.
- [x] Remove all Item Piles integration (pulled forward from Phase 5; see section 14).
- [x] Render current allowed items and currency without mutation.
- [x] Start `architecture-loot.md` with only implemented state ownership and lifecycle behavior.
- [x] **Add the loot button to the corpse chat card.** Curator now renders its own `card-loot.hbs` rather
      than Blacksmith's shared loot-drop block, because the card is an access surface and not only an
      announcement. Canvas gestures are all permission-gated and are not an alternative; see section 6.
- [x] Resolve what `tokenLootChatMessage` controls once the card carries the entry point. It still gates
      the card; the setting hint now states that turning it off removes the permission-free access path.
- [ ] Decide and record the repeat-death behavior from section 12.

### Phase 1b — Canvas double-click

Unblocked. The registry is in the install. The chat card remains the entry point for anyone on a released
Blacksmith and for players who cannot interact with the token at all, so this adds a gesture rather than
replacing a surface.

- [x] Register `clickLeft2` in `LootManager.initialize()` per the contract in section 6.
- [x] Feature-detect `api.tokens?.registerInteraction` and degrade silently to the chat card.
- [x] Dispose via `disposeByContext('curator-loot')` in `LootManager.teardown()`.
- [x] Wrap the handler so it can neither throw nor return a rejected promise. `openSafely` catches
      synchronously **and** attaches `.catch()`, since `open` is async.
- [x] Expose `LootManager` on `module.api.loot` for every user, not only the GM, so the section 16 checks
      are runnable from a player console.
- [ ] **Run the section 16 interaction block against a non-GM login and report results to Blacksmith.**

### Phase 2 — Single-item transfer

- [x] Resolve recipients, with a remembered choice and a header selector when there is more than one.
- [x] Add the quantity control, prompting only for stacks above one.
- [x] Register the GM-authoritative handler. **Deviation from the original line:** it uses Curator's own
      `game.socket` channel rather than Blacksmith's socket API, because Curator already ran a raw channel
      for `showImage` and two transports in one module is worse than one. `module.json` now declares
      `"socket": true`, which that existing path silently needed and did not have.
- [x] Transfer single Items and partial stacks through the `transferItem` contract.
- [x] Structured failure feedback keyed on the primitive's error codes.
- [ ] Verify two clients attempting the same Item.

### Phase 3 — Currency, Take All, and generation migration

- [x] Denomination transfers through `transferCurrency`.
- [x] Take All contents and currency, reporting per-line partial success.
- [x] Distribute currency evenly across the party, remainder left on the body.
- [x] Give To, Party, and All to Party.
- [x] Bury, scoped to Curator corpses and gated on GM approval.
- [ ] Test partial-failure behavior against a real half-failure.
- [ ] Migrate loot generation in `loot-utilities.js` onto `grantItem` and `grantCurrency` once Blacksmith
      ships them, retiring the absolute-total currency write that races today.

### Phase 4 — Synchronization and lifecycle

- Broadcast successful content changes.
- Refresh multiple open windows.
- Handle empty corpses.
- Invalidate windows on revival, token deletion, Actor deletion, scene changes, and generation changes.

### Phase 5 — Verification and release

- Verify death, loot generation, looting, empty behavior, and revival end to end.
- Work the full section 16 matrix.
- Update settings, README, changelog, and compatibility notes.
- Finish `architecture-loot.md` from the implemented code and link it from relevant contributor documentation.

## 16. Verification Matrix

### Generation and state

- NPC death with items and currency.
- NPC death with no generated loot.
- Repeated HP updates at zero do not generate twice.
- Revival while generation is still running.
- Revival after partial looting.

### Interaction and permission bypass

**Owed to Blacksmith and gating their release.** Must be run from a non-GM login; a GM passes every
predicate and proves nothing.

Blacksmith has already confirmed on a player session that a non-GM double-clicking a matched NPC runs the
claim's handler and does not open the Actor sheet. The bypass itself works. What they could not test is
**scoping**: their test claim matched every NPC, so blanket relaxation and per-token relaxation were
indistinguishable. Curator's `isLootable` is the first predicate that says no to something, which is why
this pass is ours to run.

`module.api.loot` is exposed to every user for exactly this, so the checks need no file edits:

1. Non-GM with no permission on the corpse Actor: double-click opens the Curator loot window, no sheet.
   Regression check — already confirmed generically, still worth one click with the real predicate.
2. **Same player, an NPC token that is not lootable and that they lack permission on: double-click does
   nothing.** This is the whole ask. If a sheet opens, the relaxation is leaking past Curator's claim; stop
   and tell Blacksmith immediately, because they will pull the feature rather than patch around it.
   Everything else here failing is a bug; this one is a security regression.
3. Same player, their own character token: sheet opens normally.
4. `game.modules.get('coffee-pub-blacksmith').api.tokens.disposeByContext('curator-loot')` while a corpse is
   on screen: that player's double-click reverts to doing nothing, with no redraw required.
5. Deliberate handler failure, from the player console:
   `game.modules.get('coffee-pub-curator').api.loot.open = () => { throw new Error('verify'); }`
   Double-click must open nothing — specifically not the Actor sheet. Blacksmith suppresses rather than
   falls through, because permission has already been granted by that point. Reload to undo.

Curator-side additions:

- Creature dies mid-session with the corpse already on screen and no redraw: double-click works. This is the
  case Blacksmith moved to per-gesture evaluation to cover.
- Handler throws: the gesture does nothing, a Curator notification appears, no sheet opens.
- Revived NPC: double-click no longer opens the loot window and does not open a sheet for an unprivileged
  player.
- A double-click that does nothing on a token that looks lootable: treat as an `isLootable` stability
  failure across Blacksmith's two evaluation calls and report it rather than working around it.
- Released-Blacksmith install without the registry: registration is skipped silently and the chat card still
  works.
- Chat-card entry point works for a player who cannot interact with the token at all.

### Permissions and recipients

- Player with one owned character.
- Player with multiple owned characters.
- Player with no owned character.
- GM interaction.
- Non-owner attempts to name another player's Actor as recipient.
- Hidden or inaccessible corpse.
- In-range and out-of-range interaction.

### Items

- Quantity-one Item.
- Partial stack.
- Whole stack.
- Source Item deleted while the window is open.
- Quantity changed while the window is open.
- Unsupported embedded Item type is excluded.
- Same source and target Actor is rejected.

### Currency

- Partial denomination transfer.
- Whole denomination transfer.
- Concurrent requests for the same denomination.
- Recipient with missing or zero currency fields.

### Sharing, party, and disposal

- Give To hands an item to a character the giver does not own, and it arrives.
- A crafted request naming an Actor outside the party is rejected with `RECIPIENT_NOT_ALLOWED`.
- Party controls are disabled, with a stated reason, in a world with no primary party.
- Distribute across 3 characters with 7 gp: each gets 2, 1 gp stays on the body.
- Distribute with less than one per member returns `NOT_ENOUGH_TO_SPLIT` and moves nothing.
- Take All against a body holding a container with contents: everything else moves, the container is
  reported as left behind.
- Bury as a non-GM prompts the GM, and declining leaves the token in place.
- A crafted bury request naming a non-corpse token is rejected with `NOT_A_CORPSE`.
- Bury closes the loot window on every client, not only the requester's.

### Concurrency and failure

- Two players request the last Item simultaneously.
- Two browser windows submit from the same user.
- Target creation failure.
- Source update failure after target creation and rollback result.
- GM disconnect or no active GM.

### Lifecycle

- Multiple open windows refresh after a successful take.
- Empty corpse follows the configured behavior.
- Revival invalidates stale requests.
- Token deletion closes or invalidates the window.
- Scene change releases hooks and window references.

## 17. Architecture Documentation Rule

`architecture-loot.md` should describe only behavior verified against implemented code. Add sections incrementally as phases land:

- Ownership and boundaries.
- State machine and flags.
- Death and revival sequence.
- Window composition.
- Socket and authorization flow.
- Blacksmith inventory API contract.
- Item and currency mutation rules.
- Synchronization and invalidation.
- Settings and extension points.
- Known limitations.

The plan records intent and unresolved choices. The architecture document records the system that actually exists.

## 18. Open Decisions

Still open:

- Default interaction distance.
- Default empty-corpse behavior.
- Whether quantity-one Items transfer immediately or require confirmation.
- Whether an active GM is mandatory for GM-originated local interaction as well as player interaction.
- Whether an empty corpse may still open for inspection.
- Repeat-death loot behavior (section 12). Must be closed in Phase 1.
- Whether `clickRight2` is worth claiming as a secondary gesture. Do not request it without a use case.

Closed:

- **Token gesture.** Canvas double-click via `blacksmith.tokens.registerInteraction` with
  `gesture: 'clickLeft2'`; shipped, not proposed. The corpse chat card stays as the permission-free surface
  and the fallback for installs without the registry. A context menu is not an alternative — `_canHUD`
  requires OWNER. Section 6.
- **Claim staleness.** Not a problem. Blacksmith evaluates per gesture, not per draw, so no Curator-side
  redraw guarantee is needed. Section 6.
- **Lootable Item types.** `weapon`, `equipment`, `consumable`, `tool`, `loot`, `container`, matching the
  primitive's whitelist. Section 10.
- **Take All atomicity.** Partial success. The primitive locks per Actor UUID and exposes no batch call, so
  Take All is N sequential calls and cannot be atomic. It must report per-line results. Section 11.
- **Item Piles removal timing.** Removed during Phase 1. Section 14.
