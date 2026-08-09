# Curator Looting Plan

**Status:** Complete and verified, shipped in 13.3.0. Every phase below is done and the section 16 matrix
passed — see `../testing/testing-loot.md`.

**This document records intent and the reasoning behind decisions.** For how the system actually behaves,
read `../architecture/architecture-loot.md`; it describes the implementation and wins any disagreement with
this file.
**Target:** Focused corpse looting owned by Curator
**Architecture record:** `../architecture/architecture-loot.md`. It is written from the code, not copied from this plan.

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

- Merchants, stores, buying, selling, pricing, or restocking. Revisiting this as "shop tokens" reusing the
  same machinery is recorded in `TODO.md`; the exclusion stands until that gets a decision of its own.
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

**The rule held and the adapter is gone.** `loot-transfer.js` existed for exactly one working session while
`api.inventory` was in development, and was deleted the day Blacksmith shipped. Curator now owns no item or
currency mutation code at all. `loot-inventory.js` replaces it and is a thin accessor with no logic: it
resolves `blacksmith.inventory`, forwards the four calls, and returns `INVENTORY_UNAVAILABLE` when the API
is absent. Nothing may grow there — if a call needs wrapping, that belongs in `manager-loot.js`.

`PHYSICAL_TYPES` and `DENOMINATIONS` are read from `blacksmith.inventory` rather than copied, so Curator
cannot drift from the whitelist the primitive enforces. The local fallback lists exist only to render the
window before the API finishes loading.

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

#### The corpse chat card is an announcement, not an entry point

It briefly carried a Loot button, as the Phase 1 entry point from before Blacksmith's interaction registry
existed. **That button has been removed.** Double-click now covers the case properly, and a chat button was
actively worse once proximity and combat gating arrived: it can only report a refusal after the click, so a
player too far from the body gets a button that looks broken. Two ways in, one of which fails for reasons
the other has already accounted for, is worse than one.

Removing it also un-couples `tokenLootChatMessage`. While the card was the access path, turning the
announcement off removed the only way in for some players; it is once again a plain announcement toggle.

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

The recipient UUID travels with each request but is never trusted without GM-side validation.

Both actor pickers — Looting As and Give To — use `blacksmith.entityList` inside a `dialog.wait`, not a
select and not `dialog.choose`. Rows carry the portrait and the name only: the dialog title already says what
is being chosen, so a prompt line and a per-row type label both just repeat it. The window shows the current
recipient on its own row — small circular portrait, "Looting as", the name, and a Change button — so it reads
like the item and currency rows rather than as a caption on the corpse card. Anyone else with the same body
open appears to the left of that, separated by a divider, so it is obvious when two people are working the
same corpse. Corpse, recipient, and looter portraits share one treatment and differ only in size — the rule
is written once so restyling any of them moves all three together.

Presence is peer to peer over Curator's socket, not GM-brokered: it is display only, nothing authoritative
hangs off it, and routing it through the GM would make an absent GM look like an empty room. A window
announces on open, pings so anyone already there re-announces, and announces again when the acting character
changes. Departure is covered twice — an explicit close message, and a `userConnected` hook that drops a
client which vanished without sending one. The one-character case shows the
row without a Change button and costs no clicks.

Row action buttons are icon-only with tooltips. Take, Give, and Party sit together in a cluster, and one
labelled button beside two icons reads as though only the labelled one is a real action.

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

**A taken row is struck through and labelled "Looted by <character>", not removed.** The record is a ledger
on the Token document (`flags.<module>.loot.taken`), written by the GM as part of the same handler that
performed the transfer.

It deliberately does **not** live in window memory. A per-window snapshot was tried first and is wrong for
the case that matters: several people looting one body. It cannot name the taker, it differs per client, and
a window opened after an item was taken shows nothing. A ledger on the document is authoritative, reaches
every client through the document update, and is still complete for a window opened later.

Only a row that emptied is recorded — `sourceDeleted` on the transfer result. A partial take leaves a live
row at the reduced quantity, because it has not been looted, only reduced.

**A looted row keeps its original position.** The first take also stores `order`: the item ids as they stood
before anything was removed. Rendering ranks live rows and ledger rows against that list, so a struck-through
row sits exactly where the item was rather than sliding to the bottom. Live indices cannot be used for this —
they shift every time a row is removed, so a second take would misplace the first. Anything added to the body
after that snapshot is unranked and falls to the end in its own order.

Currency is not recorded. A denomination is a balance rather than a row and can be drawn down by several
people, so "looted by" has no single answer for it.

Ledger writes are read-modify-write and requests are handled concurrently, so they are chained through a
single promise rather than issued in parallel.

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

Implemented surface. Take All and All to Party are present but disabled — see Phase 3.

| Control | Where | Sends to |
|---|---|---|
| Take | item row, currency row | the acting recipient |
| Give | item row | any party character, chosen in a dialog |
| Party | item row, currency row | the dnd5e primary party Group Actor |
| Distribute | currency header | every party character, split evenly |
| Loot All | footer, primary | the acting recipient, in one `transferItems` call |
| Loot to Party | footer | the party Group Actor, in one `transferItems` call |
| Bury | subject card | nobody; deletes the token after GM approval |
| Character Sheet, Prototype Token | titlebar, GM only | — |
| Done | footer | closes the window |

Take prompts for a quantity through Blacksmith's Quantity Split only when the stack is above one. A
single-quantity row transfers on click.

### GM quantity editing

A GM can double-click any live row's quantity to change it in place: Enter commits, Escape cancels, clicking
away commits. **Setting it to zero removes the item**, confirmed — "there are none left" and "take it off the
body" are the same statement about a stack, so it is also the removal gesture and no separate control is
needed.

This is the GM curating what is on the body, not a loot action, so it writes to the Item directly rather than
going through the GM socket handler players use. It is gated on `game.user.isGM` and only offered where the
Item actually carries a numeric quantity.

**Never on a packed container.** Zeroing one deletes it and orphans its contents, which go on pointing at a
parent id that is no longer on the body — the same corruption `transferItem` refuses. The control is hidden
*and* re-checked on commit, because contents can change between the render and the keystroke.

A packed container has no quantity worth editing, so that slot carries a **remove** control instead. It calls
dnd5e's own `Item5e#deleteDialog()`, which asks whether the contents go with the bag and handles the
recursion. Curator must not reimplement that: it would be a second answer to a question the system already
asks, and the wrong answer orphans everything inside.

Neither the quantity prompt nor the actor picker passes `modal`. `api.dialog` used to default to
`modal: true`, which called `<dialog>.showModal()` and froze the loot window behind it; the default is now
`false`. Bury's confirmation **does** stay modal, because `confirm` defaults to `modal: destructive` and
bury is destructive. Do not pass `modal: true` on the loot pickers — the window must stay draggable while
one is open.

### Footer and dialog button convention

**One primary action, rightmost. Secondary actions left.** This applies to every Curator window **and every
dialog it raises**, not only the loot window:

```
[ Done ]                              [ Loot to Party ] [ Loot All ]
[ Cancel ]                                                  [ Take ]
```

`dialog.wait` renders buttons in array order, so the cancel entry comes first in the array. The GM's bury
prompt uses `wait` rather than `confirm` for exactly this reason — `confirm` owns its own button order, and
this one reads `[ Decline ] [ Approve ]`. It passes `modal: true` deliberately: an approval a GM can miss
behind another window is worse than one that interrupts.

GM-only sheet access is a titlebar action rather than a footer button — it is inspection, not a loot action,
and the footer belongs to loot actions. `getToolHeaderActions()` supplies Character Sheet and Prototype
Token; in micro-titlebar mode the base folds both into the window's context menu automatically.

Prototype Token must be opened as `new CONFIG.Token.prototypeSheetClass({ prototype }).render(true)`.
`PrototypeToken` is a DataModel with **no `sheet` getter**, so `prototype.sheet?.render()` optional-chains
into silence — a dead button with no error.

`.blacksmith-window-btn-primary` carried `width: 300px` until 2026-08-08, which stretched the primary action
across a flex footer. Fixed in the shared class; Curator's local override has been removed. Do not
reintroduce a width reset — if a footer button looks wrong, it is a shared-class problem.

### Announcing a burial

A body leaving the canvas goes to **every** client, not just the requester's. Anyone with the window open
watches it close, and an unexplained disappearance is worse than a notice. All three paths announce: an
approved bury, a bury with approval turned off, and the automatic `lootBuryWhenEmpty` sweep — the last most
of all, since nobody clicked anything.

The GM broadcasts it after the delete succeeds, so the message only ever follows a burial that happened. The
requester's window deliberately stays quiet on success; it would otherwise show two messages for one action.

### Sizing and pinning

The window is resizable, opens at 520x560, and is bounded only by the viewport. It carries an **explicit**
height rather than `auto`: a resizable window needs a height to be dragged from, and `auto` combined with a
max-height cap would let the cap silently refuse the drag.

The corpse card and the Looting-as row are pinned to the top of the scrolling body as one sticky wrapper,
not as two stacked sticky sections — stacking them would require the first one's height hard-coded as the
second one's `top` offset, which breaks the moment either changes. The wrapper owns the content's top
padding so nothing shows above it once the list is scrolled.

Position and size are not remembered between openings (`rememberPosition: false`), so the window always
opens near where it is raised. Revisit if a resized window resetting each time proves annoying in play.

### Loot All and packed containers

Loot All runs **several passes**, not one. Blacksmith validates a batch against the state at the start of
the call, so a bag emptied by that very batch is still packed as far as that call is concerned and stays
behind — which is what a single-pass Loot All did, leaving a row of empty sacks. Each pass takes everything
that is not currently a packed container, and the next pass picks up the bags the previous one emptied.

The loop is bounded at four passes and stops as soon as a pass moves nothing, so a permanently failing row
cannot spin. Nested bags therefore resolve, and a genuinely stuck one is reported as left behind rather than
retried forever.

### Why a packed container cannot be taken

This is `api.inventory`'s v1 boundary, not a Curator choice, and it is worth recording so nobody tries to
route around it. dnd5e stores containment on the **child** as `system.container`, holding the parent's id.
Moving the bag alone would leave its contents on the corpse pointing at an id that no longer exists there.
Moving bag and contents together needs `Item5e.createWithContents` with `keepId: true`, and breaks the
contract the primitive rests on: the return shape is singular, quantity splitting is meaningless, and
rollback becomes N deletes plus N restores plus reporting which of those also failed.

Blacksmith deferred it to a future `transferContainer()` rather than a flag on `transferItem`. Until that
exists, the workaround is the one the UI states: take the contents, then take the empty bag.

### Rendering failures

Most codes describe a state that will not change, so they get one sentence and no retry. Three do not:

- **`LOCK_TIMEOUT`** is the only code worth offering a retry on, because it is the only one that resolves on
  its own. Everything else describes a settled state.
- **`CONTAINER_HAS_CONTENTS`** carries `contentCount`, so the message names it — "Unpack 7 items first"
  rather than a flat refusal. A null count means Blacksmith could not determine it and refused to be safe,
  so the message must not invent a number.
- **`SOURCE_UPDATE_FAILED` and `ROLLBACK_FAILED`** carry `targetItemId`, `merged`, `quantity`, and both
  observed quantities. These are logged in full and surfaced, never swallowed: they are what makes a broken
  state repairable by hand.

`ok: true, merged: false` is **success**, not partial failure — the item arrived as its own row instead of
joining a stack. Only an explicit `partial` flag on a batch result means something was left behind.

Disable actions while that window has a request in flight. This is user feedback, not the concurrency
guarantee.

### Progress

Loot All is the case that needs it: a socket round trip to the GM, then up to four batch passes. A spinner
panel floats over the dimmed list naming what is running — "Looting everything", "Splitting the coin",
"Waiting for the GM". Single-row actions additionally spin on their own row.

The panel hangs off a zero-height sticky rail so it stays put however far the list is scrolled without
competing for `top: 0` with the pinned header. Its colours come from the surface and text tokens: a first
attempt used `--blacksmith-tool-background` as a `color`, and that token is a **gradient**, which is invalid
for colour — it fell back to dark text on a dark bar and rendered as a black void. Never use it as a colour.

**There is no per-item progress, and there should not be.** `transferItems` is one call for the whole batch,
at most two writes per Actor, so nothing observable happens between the first row and the last. Reporting
row-by-row progress would mean looping `transferItem`, which is the thing Blacksmith asked consumers not to
do. An honest "this is running" beats a fake progress bar.

The busy state is set around the **request only**, not around the whole action. A quantity prompt or a
recipient picker comes first, and showing a spinner while the user is still deciding would be a lie.

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
- A container and its contents render **inside one dotted box**. The bag keeps the ordinary row surface and
  its contents sit plain inside the box, so the surface difference alone carries the hierarchy — no indent,
  no connectors, no divider. Indentation with connector dashes was tried first and read as broken rows
  rather than as containment; a divider under the bag was tried second and was redundant once the surfaces
  differed. Presentation only:
  every row keeps its own controls and the API is still never asked to move a packed bag. A looted content
  row stays in its group, which is why the ledger records `containerId`.
- The row markup is a partial (`partial-loot-row.hbs`) used at two different context depths. Every flag it
  needs is resolved in `getData` rather than looked up with `../`, which would mean different things in each
  place.
- **A packed container is shown, not hidden.** It renders with its content count and no Take controls,
  reading "Empty it first". An earlier version omitted it entirely, which made the body read as though the
  bag was never on it while Loot All correctly left it behind — the display and the behavior disagreed.
  Emptying it makes the bag takeable, since it is then an empty container, and its controls reappear on the
  next render with no special case.
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

Deleting a token during combat used to destroy its XP award, because Foundry removes the Combatant with the
Token and Blacksmith read the roster from `combat.combatants` at combat end. **Blacksmith is fixing that at
the source**, deriving the award from history. Curator adds no guard of its own: every mitigation considered
was justified by the XP loss alone, and a Curator-side block would only cover Curator while masking the
general case. See `TODO.md`.

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

A **Looting** section sits under Loot Configuration. All world scope — these are policy, not preference:

| Setting | Default | Effect |
|---|---|---|
| `lootBuryApproval` | on | A body still holding items or coins needs GM sign-off before burial. An empty one is buried without asking. |
| `lootBuryWhenEmpty` | off | The token leaves the canvas once the last item and coin are gone. |
| `lootProximity` | 0 | Feet a character must be within to loot. 0 means no distance requirement. |
| `lootAllowInCombat` | off | Whether a body can be looted while a combat is running. |
| `tokenConvertAfterCombat` | off | Holds conversion until the encounter ends (registered with the conversion settings, not this section). |
| `lootSendToParty` | on | Shows the party controls. |
| `lootSendToPlayer` | on | Shows Give To. |

**A setting that hides a control must also refuse the request.** `lootSendToParty` and `lootSendToPlayer`
are re-checked in `_validateRecipient`, and combat and proximity are re-checked on the GM against current
token positions. Hiding a button only removes it from the honest path; the GM handler is what makes the
policy real.

`tokenConvertAfterCombat` and `lootAllowInCombat` overlap but are not the same lever, and both are worth
having. The first delays a body *becoming* lootable, so nothing is marked ready mid-encounter and the loot
image does not appear until the fight is over. The second blocks the loot *action* against a body that is
already ready. A GM who only wants the second still sees corpses convert during the fight.

A body held for the encounter carries `lootAwaitingCombatEnd` on the Token — on the document rather than in
memory, so a reload mid-combat does not lose it. `deleteCombat` sweeps the scene, re-checks that each one is
still at zero HP, and converts. Revival before the encounter ends clears the flag, so a creature brought
back is never converted.

Proximity measures centre-to-centre from the corpse to the nearest token the requesting user owns, at
request time — not at window-open time, because either token may have moved. The GM is exempt from both
combat and proximity.

It measures against the **corpse's own scene grid**, not `canvas.grid`. The check runs on the GM, who may be
viewing a different scene than the player doing the looting, and `canvas.grid` would then be the wrong grid.

Both gates also run client-side in `LootManager.open`, so a refusal arrives as a message instead of a window
that opens and then fails on every action. `checkAccess` is shared by both paths so they cannot drift; the
GM-side call is the guard, the client-side call is the explanation.

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
- [x] Run the unprivileged-client verification pass and report back. Confirmed: the bypass works and stays
      scoped to Curator's claim.
- [x] Blacksmith ships `api.inventory`, then `transferItems`. Curator uses all four primitives.
- [x] Blacksmith tests the primitives before Curator consumes them.

### Phase 1 — State and read-only window

- [x] Add the Curator loot state model.
- [x] Separate loot generation from Item Piles conversion.
- [x] Mark corpses `preparing` and `ready` around the current conversion path.
- [x] Remove all Item Piles integration (pulled forward from Phase 5; see section 14).
- [x] Render current allowed items and currency without mutation.
- [x] Start `architecture-loot.md` with only implemented state ownership and lifecycle behavior.
- [x] Curator renders its own `card-loot.hbs` rather than Blacksmith's shared loot-drop block, so it owns
      its own message. Announcement only — the Loot button it briefly carried has been removed; see
      section 6.
- [x] `tokenLootChatMessage` is a plain announcement toggle again.
- [x] Decide and record the repeat-death behaviour from section 12. Once per token, ever.

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
- [x] Run the section 16 interaction block against a non-GM login and report results to Blacksmith.

### Phase 2 — Single-item transfer

- [x] Resolve recipients, with a remembered choice and a header selector when there is more than one.
- [x] Add the quantity control, prompting only for stacks above one.
- [x] Register the GM-authoritative handler. **Deviation from the original line:** it uses Curator's own
      `game.socket` channel rather than Blacksmith's socket API, because Curator already ran a raw channel
      for `showImage` and two transports in one module is worse than one. `module.json` now declares
      `"socket": true`, which that existing path silently needed and did not have.
- [x] Transfer single Items and partial stacks through `blacksmith.inventory.transferItem`.
- [x] Structured failure feedback keyed on the primitive's error codes, including the three that need more
      than a sentence — see below.
- [x] Verify two clients attempting the same Item — the case Blacksmith's harness cannot reach, since their
      lock is per-client and consumers route through one GM handler.

### Phase 3 — Currency, Take All, and generation migration

- [x] Denomination transfers through `transferCurrency`.
- [x] Take All contents and currency, reporting per-line partial success.
- [x] Distribute currency evenly across the party, remainder left on the body.
- [x] Give To, Party, and All to Party.
- [x] Bury, scoped to Curator corpses and gated on GM approval.
- [x] Test partial-failure behaviour, including a packed bag inside a Loot All batch.
- [x] Migrate loot generation in `loot-utilities.js`. `_addRandomCoins` uses `grantCurrency` with deltas,
      retiring the absolute-total write that raced.
- [x] `_rollLootTable` accumulates every result across every roll and makes **one** `grantItems` call.
      Granting per result was a defect: it cost a write each and produced a separate row per duplicate, so a
      table rolled three times for the same item gave three rows instead of one stack. Batched, Blacksmith
      coalesces duplicates and the whole roll costs at most two writes.
- [x] **Loot All and Loot to Party use `blacksmith.inventory.transferItems`.** Never a loop over
      `transferItem`: the batch form costs at most two writes per Actor however many rows move, validates
      per item, and coalesces duplicate rows into one stack. Results are index-aligned, so a packed
      container fails on its own entry with `CONTAINER_HAS_CONTENTS` while every other row still moves.
      Currency is a second call because it is a different primitive. Both buttons disable themselves when
      `transferItems` is absent, so an older Blacksmith degrades rather than erroring.

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

The working checklist lives in `../testing/testing-loot.md`, ordered for actually running through. This section stays
the reference: what must hold and why, independent of the order anyone tests it in.

### Generation and state

- With Convert After Combat on, a creature dying mid-encounter does not convert until combat ends: no loot
  image, no lootable flag, no chat card.
- The same creature revived before the encounter ends is never converted, and the holding flag is cleared.
- Reloading the browser mid-combat does not lose a held body.
- Ending combat converts every held body on the scene, and leaves any that were revived alone.

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
- Double-click is the only entry point; the chat card announces and nothing more.

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

### Reported back to Blacksmith

The four they asked Curator to confirm, because the loot window is the first real consumer:

- A row emptied by a full take vanishes from the window.
- A partial take leaves the row showing the reduced quantity.
- Taking an item the looter already holds grows that stack rather than adding a second row.
- Any code the window cannot sensibly render.
- Two players taking the same last item from one corpse. Blacksmith's harness cannot cover this — the lock
  is per-client and consumers route through one GM handler — so it is Curator's to run.

Both previously-known issues are fixed upstream and neither is expected noise any more:

- Squire moved its `isNew` stamp to `preCreateItem` so it rides the original write, and calls
  `registerTransientFlag`. Merging is no longer timing-dependent.
- Blacksmith serialises dnd5e's encumbrance recompute per Actor (`enableEncumbranceGuard`, world setting,
  on by default). `The _id [dnd5eencumbered0] already exists` should no longer appear.

**A reappearance of either is now a report, not a workaround.** Both root causes are addressed, so it would
mean something unknown is writing twice to an Actor, and Blacksmith wants to see it. Do not add a guard here.

The guard does not remove the reason to batch. `transferItems` and `grantItems` are used because fewer
writes is better on its own merits; the guard only means correctness no longer depends on remembering them.

### Batch transfer

Blacksmith's consolidated list, after three fixes landed under Curator. Their ranking: the encumbrance check
is where a failure is most interesting now, and the packed-bag case is the one most likely to be wrong in a
way that looks fine.

1. Loot All over a corpse holding a packed bag: every other row moves, and the bag comes back
   `CONTAINER_HAS_CONTENTS` with its `itemId` and count rather than failing the whole call.
2. A corpse holding two identical stacks arrives as one coalesced stack, not two rows.
3. The quantity slider no longer freezes the window — drag the window while it is open.
4. A two-button footer lays out correctly with no local width reset. That is the case the shared class's
   fixed 300px was breaking.
5. No `dnd5eencumbered0` errors looting several items onto a near-encumbered character.

Also:

- Loot All where the recipient already holds one of the items: that stack grows rather than gaining a row.
- Loot All and Loot to Party are disabled against a Blacksmith without `transferItems`.

### Several people looting one body

- Two players take the same last item at once: one succeeds, the other is told somebody took it first.
  Nothing is duplicated and no total changes.
- Both players' windows refresh after either take, without either reopening.
- The item shows "Looted by" the character that actually received it, on both clients.
- A third player opening the window afterwards sees the same looted rows with the same names.
- A partial take by one player leaves a live row at the reduced quantity for the other, not a looted row.
- Taking the second of three rows, then the first, leaves all three in their original order with two struck
  through — the case that catches position tracking based on live indices.
- Revival clears the ledger along with the rest of the loot flag.

### Settings enforcement

- With `lootProximity` at 30, looting from across the map is refused with the distance in the message, and
  works after moving closer. Zero disables the check.
- With `lootAllowInCombat` off, looting during an active combat is refused; the GM is unaffected.
- With `lootSendToParty` off, the party controls disappear **and** a crafted request naming the party Actor
  is refused.
- With `lootSendToPlayer` off, Give To disappears **and** a crafted request naming another player's
  character is refused.
- With `lootBuryApproval` off, burying a full body happens immediately with no GM prompt.
- With `lootBuryWhenEmpty` on, taking the last coin removes the token and closes every open window.

### Embedded controls

- Drag the quantity slider: the Take and Leave captions track it.
- Pick the second character in Looting As, confirm, and take an item: it lands on the character that was
  picked, not the first in the list.
- The loot window stays draggable while a dialog is open.

### Sharing, party, and disposal

- Give To hands an item to a character the giver does not own, and it arrives.
- A crafted request naming an Actor outside the party is rejected with `RECIPIENT_NOT_ALLOWED`.
- Party controls are disabled, with a stated reason, in a world with no primary party.
- Distribute across 3 characters with 7 gp: each gets 2, 1 gp stays on the body.
- Distribute with less than one per member returns `NOT_ENOUGH_TO_SPLIT` and moves nothing.
- Bury as a non-GM prompts the GM with the asking character's portrait and name, and Decline leaves the
  token in place.
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

## 17. Blacksmith API Usage

Curator's loot feature must consume shared controls rather than reimplement them. Current state:

| API | Used for |
|---|---|
| `inventory` | every item and currency mutation, plus loot generation |
| `tokens` | the `clickLeft2` corpse claim |
| `entityList` | recipient and Give-to pickers |
| `quantitySplit` | the how-many prompt |
| `dialog` | quantity, actor picking, bury confirmation |
| `toast` | all notifications, via `notifications.js` |
| `chatCards` | the card HTML/CSS contract for the loot card |
| window base | the loot window shell |

Deliberately not used:

- **`sockets`** — Curator runs its own `game.socket` channel. It already had one for `showImage`, and two
  transports in one module is worse than one. Revisit if Curator ever needs SocketLib's guarantees.
- **`registerWindow` / `openWindow`** — the registry exists so a toolbar or macro can open a window without
  importing its class. The loot window cannot open without a specific corpse, so an id-only opener would
  have nothing to open. Revisit if a "loot nearest corpse" tool is ever wanted.
- **`registerTransientFlag`** — `api.inventory` exposes it so a module can declare item flags that must not
  block a stack merge. Curator writes no flags to Items, so it has nothing to declare. Revisit only if that
  changes.

`getToolHeaderActions()` **is** used, for the GM's Character Sheet and Prototype Token entries. Bury stays in
the subject card rather than the titlebar because it must state a reason when unavailable, which a titlebar
icon cannot.

Both embedded controls — `entityList` and `quantitySplit` — must be attached **after their markup is in the
document**, never to a detached wrapper. Attaching early was tried and does not work, whatever the dialog's
move-not-copy semantics suggest.

`dialog.wait` exposes no render hook, so the pattern is: start the dialog without awaiting it, poll a few
animation frames for the input by `name`, `attach` to its `.application` ancestor, then await the dialog.

**The failure is silent and expensive.** An unbound control still renders and still reports a value through
the form, so a quantity slider looks alive while its captions never move, and an entity list hands back the
*initial* selection instead of what the user picked — meaning loot silently goes to the wrong character.
Both button callbacks therefore fall back to reading the submitted form when binding did not succeed, and
the failure is logged.

## 18. Architecture Documentation Rule

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

## 19. Open Decisions

Still open:

- Whether `clickRight2` is worth claiming as a secondary gesture. Do not request it without a use case.
- Whether `transferContainer()` is worth requesting from Blacksmith. Multi-pass Loot All handles containers,
  so this is comfort rather than capability — but "take six things, then the bag, twice" is real tedium.

Closed:

- **Repeat-death loot.** Generation is once per token, ever. A revived creature does not grow a replacement
  for what was taken, and clearing the marker on revival would make kill → loot → heal → kill an infinite
  loot faucet — which ordinary combat healing reaches without anyone trying to exploit it. A re-killed body
  offers whatever is left and announces nothing, because nothing new dropped.
- **Empty-corpse behaviour.** An emptied body stays on the canvas and stops being lootable. It still opens
  while it has a ledger, because the record of who took what is the reason to reopen a picked-clean corpse.
  Empty with no ledger is not offered. `lootBuryWhenEmpty` optionally removes the token instead.
- **Whether an empty corpse opens for inspection.** Yes, when there is something to read. Section 5.
- **Default interaction distance.** Zero — no requirement. A refusal nobody configured is confusing, and the
  setting is there for GMs who want it.
- **Quantity-one Items.** Transfer on click, no confirmation. The prompt appears only above one.
- **Active GM requirement.** Mandatory for players, who cannot write to a corpse they do not own. A GM acting
  locally short-circuits the socket and needs nobody.

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
