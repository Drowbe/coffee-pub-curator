# Curator Looting Plan

**Status:** Proposed  
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
- Remove Item Piles checks, flags, conversion calls, reversion calls, and user-facing dependency warnings from Curator after the replacement is verified.

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

Socket routing, authorization, interaction rules, and notifications remain in Curator.

### Integration rule

Do not build a second permanent item-transfer engine in Curator while the Blacksmith API request is active. A temporary adapter is acceptable only if it has the same contract as the proposed API and is explicitly scheduled for deletion.

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

The initial interaction should use the conventional token double-click unless live testing shows a conflict. A token context-menu entry can be added as an accessible alternative.

## 7. Recipient Resolution

Eligible recipients are D&D 5e character Actors the current user owns. The corpse Actor must never be eligible.

Suggested behavior:

- One eligible Actor: select it automatically.
- Multiple eligible Actors: remember the last valid choice and expose a Blacksmith entity-list selector.
- No eligible Actor: explain that the user has no owned character available to receive loot.
- GM: allow selection from eligible character Actors, with an option to inspect the corpse without choosing a recipient.

The recipient UUID travels with each request but is never trusted without GM-side validation.

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

- Take All, controlled by a world setting.
- Refresh only if automatic refresh proves unreliable.
- Close.

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

The first version should preserve Squire's proven simple behavior unless the Blacksmith primitive specifies more:

- Copy the source Item data to the recipient.
- Remove embedded identity before creation.
- Set the transferred quantity on the new Item.
- Reduce the source quantity or delete the source Item.
- Do not automatically merge similar target stacks in the MVP.
- Do not transfer nonphysical features, classes, subclasses, spells, or effects as loot.

Define the allowed D&D 5e item types explicitly after inspecting generated loot and live corpse inventories. Natural weapons, monster features, and spellcasting entries must not appear merely because they are embedded Items on the NPC.

## 11. Currency Rules

- Treat `cp`, `sp`, `ep`, `gp`, and `pp` as independent integer balances.
- Never allow a source balance to go negative.
- Add the transferred amount to the recipient's corresponding balance.
- Re-read both balances on the GM immediately before mutation.
- Do not perform automatic denomination conversion.
- Do not implement party splitting in the MVP.

Currency and item mutations in Take All should produce an explicit batch result. Decide during implementation whether Take All is all-or-nothing or reports partial success; document the verified behavior in `architecture-loot.md`.

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
- Never attempt `revertTokensFromItemPiles` after the migration.

Items already taken remain with their recipients. Revival must not synthesize them back onto the revived Actor.

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

Migration should occur only after native looting passes live verification.

Remove:

- Item Piles availability checks and warnings.
- `flags.item-piles` writes.
- `turnTokensIntoItemPiles` calls.
- `revertTokensFromItemPiles` calls.
- Item Piles availability data passed to Curator templates.
- Any Item Piles-specific labels or settings that no longer have meaning.

Existing worlds may contain already-converted Item Piles. Do not silently rewrite them. Document that existing piles remain owned by Item Piles, while newly prepared corpses use Curator's native state after migration.

## 15. Implementation Phases

### Phase 0 — Confirm the shared primitive

- Submit the Blacksmith inventory API request.
- Agree on item and currency contracts, structured errors, serialization, and rollback behavior.
- Add Blacksmith tests for the primitive before Curator consumes it.

### Phase 1 — State and read-only window

- Add the Curator loot state model.
- Separate loot generation from Item Piles conversion.
- Mark corpses `preparing` and `ready` at the correct points.
- Add token interaction.
- Render current allowed items and currency without mutation.
- Start `architecture-loot.md` with only verified state ownership and lifecycle behavior.

### Phase 2 — Single-item transfer

- Resolve recipients.
- Add the quantity control.
- Register the GM-authoritative socket handler.
- Transfer single Items and partial stacks through Blacksmith.
- Add structured success and failure feedback.
- Verify two clients attempting the same Item.

### Phase 3 — Currency and Take All

- Add denomination transfers.
- Add Take All Currency.
- Add Take All contents.
- Specify and test partial-failure behavior.

### Phase 4 — Synchronization and lifecycle

- Broadcast successful content changes.
- Refresh multiple open windows.
- Handle empty corpses.
- Invalidate windows on revival, token deletion, Actor deletion, scene changes, and generation changes.

### Phase 5 — Remove Item Piles

- Delete all Curator Item Piles integration.
- Verify death, loot generation, looting, empty behavior, and revival without Item Piles active.
- Update settings, README, changelog, and compatibility notes.
- Finish `architecture-loot.md` from the implemented code and link it from relevant contributor documentation.

## 16. Verification Matrix

### Generation and state

- NPC death with items and currency.
- NPC death with no generated loot.
- Repeated HP updates at zero do not generate twice.
- Revival while generation is still running.
- Revival after partial looting.

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

- Exact token gesture and context-menu fallback.
- Which D&D 5e Item types are lootable.
- Default interaction distance.
- Default empty-corpse behavior.
- Whether quantity-one Items transfer immediately or require confirmation.
- Whether Take All is atomic or may return partial success.
- Whether an active GM is mandatory for GM-originated local interaction as well as player interaction.
- Whether an empty corpse may still open for inspection.

