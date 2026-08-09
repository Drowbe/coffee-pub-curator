# Loot Architecture

How corpse looting actually works, as implemented. `../plans/plan-loot.md` records intent and the reasoning
behind decisions; this document describes the system that exists. Where they disagree, this one is right and
the plan is stale.

## Ownership

**Curator owns** death and revival integration, loot generation, corpse state, interaction policy, recipient
eligibility, authorization, the loot window, and every user-facing message.

**Blacksmith owns** every document mutation (`api.inventory`), the token interaction claim that makes a
corpse clickable (`api.tokens`), the window shell, the entity list, the quantity split, dialogs, and toasts.

**Curator owns no inventory mutation code.** A temporary adapter existed for one working session while
`api.inventory` was in development and was deleted the day it shipped. Do not reintroduce one.

## Files

| File | Responsibility |
|---|---|
| `manager-loot.js` | Corpse state, interaction claim, recipient policy, GM-authoritative socket handler, presence, bury |
| `window-loot.js` | The loot window: rendering, action wiring, failure messages, GM quantity editing |
| `loot-inventory.js` | Thin accessor for `blacksmith.inventory`. No logic. |
| `loot-utilities.js` | Loot generation — rolls tables, adds coin |
| `document-liveness.js` | `isTokenAlive` / `isActorAlive`, for writes that happen after an await |
| `token-image-utilities.js` | Death and revival detection, conversion timing, image state |
| `templates/window-loot.hbs` | Window body |
| `templates/partial-loot-row.hbs` | One row, used standalone and inside a container group |
| `templates/card-loot.hbs` | The chat announcement |
| `styles/window-loot.css` | Window and dialog styling |

## State

The Token document carries `flags.coffee-pub-curator.loot`:

```js
{
    enabled: true,
    state: 'preparing' | 'ready' | 'empty',
    preparedAt, preparedBy,
    sourceActorUuid,
    generationId,
    order: ['itemId', ...],     // row order before anything was taken
    taken: [{ itemId, name, img, type, typeLabel, containerId, by }, ...]
}
```

- **`preparing`** — death detected, generation running.
- **`ready`** — things can be taken.
- **`empty`** — nothing left. The window still opens while `taken` has entries, because the record of who
  took what is the reason anyone reopens a picked-clean body. Empty with no ledger is not offered at all.

`isLootable()` means "can take from"; `canOpen()` means "can look at". They are different questions and the
distinction is what makes the empty state useful rather than an error case.

A separate `blnLootAdded` flag marks that generation has run. **It deliberately survives revival.**

## Lifecycle

1. HP reaches zero. If `tokenConvertAfterCombat` is on and a combat is running, the body is flagged
   `lootAwaitingCombatEnd` and nothing else happens until `deleteCombat`. The flag is on the document, not in
   memory, so a reload mid-combat does not strand it.
2. Otherwise a timer runs for `tokenConvertDelay` seconds.
3. `markPreparing` stamps a fresh `generationId`.
4. Loot generates — **once per token, ever**. A revived creature does not grow a replacement for what was
   taken from it, and clearing the marker on revival would make kill → loot → heal → kill an infinite loot
   faucet, which ordinary combat healing reaches without anyone trying to exploit it.
5. `markReady` settles the body into `ready` or `empty` depending on what is actually on it.
6. The sound and chat announcement fire **only** on a first death that settled `ready`. A re-death announces
   nothing, because nothing new dropped.
7. Revival clears the whole loot flag — state, `order`, and ledger together — and restores the token image.
   `blnLootAdded` stays.

## Interaction

Double-click is claimed through `blacksmith.tokens.registerInteraction` with `gesture: 'clickLeft2'`.

Foundry emits no token double-click hook, and its permission predicate runs *before* the handler, so a
corpse is unreachable for a player without LIMITED on the Actor unless the predicate itself is relaxed. Only
Blacksmith can do that, which is why this is an API and not a hook.

Three contract rules Curator must hold:

- `matches` is **synchronous**. Foundry's predicate is synchronous and a promise is truthy, so an async
  matcher would grant every double-click unconditionally.
- `matches` must return the same answer twice in a row. Blacksmith checks permission and dispatch
  separately; anything transient produces a dead gesture.
- The handler must never throw or return a rejected promise. Blacksmith does not fall through to Foundry
  once permission is relaxed, so a throwing handler is a dead gesture, not a fallback.

The chat card is an announcement only. It briefly carried a Loot button, from before the registry existed;
that was removed once proximity and combat gating arrived, because a chat button can only report a refusal
after the click.

## Authorization

Every player mutation runs on one GM. `_isAnsweringGM()` picks the lowest-id active GM, so two connected GMs
cannot both mutate — which is also what makes Blacksmith's per-client lock sufficient.

The GM re-resolves every UUID and revalidates:

- The token still carries a matching `ready` flag and `generationId`.
- Combat gating and proximity, measured against **the corpse's own scene grid**, centre to centre, at
  request time. Not `canvas.grid` — the GM may be viewing a different scene than the player looting.
- The recipient is owned by the requester, is a party character, or is the party Group Actor. Anything else
  is `RECIPIENT_NOT_ALLOWED`.
- `lootSendToParty` / `lootSendToPlayer` are re-checked here, not only in the UI.

Both gates also run client-side in `LootManager.open` so a refusal arrives as a message rather than a window
that opens and then fails on every action. `checkAccess` is shared by both paths. **The client call is the
explanation; the GM call is the guard.**

Curator uses its own `game.socket` channel rather than Blacksmith's socket API — it already ran one for
`showImage`, and two transports in one module is worse than one. `module.json` declares `"socket": true`,
which that path silently needed and lacked.

## Transfers

All through `blacksmith.inventory`. `transferItem` for one row, `transferItems` for batches, `grantItems`
and `grantCurrency` for generation.

**Loot All runs multiple passes.** A batch validates against the state at the start of the call, so a bag
emptied by that very batch is still packed as far as that call is concerned and stays behind. Each pass takes
everything that is not currently a packed container; the next picks up what the previous emptied. Bounded at
four passes, stopping as soon as a pass moves nothing.

**A packed container cannot be moved at all.** dnd5e stores containment on the child as `system.container`
holding the parent's id, so moving the bag alone orphans its contents. `api.inventory` v1 refuses it with
`CONTAINER_HAS_CONTENTS`; `transferContainer()` is planned. The window shows the bag with its contents nested
in one dotted box and "Empty it first".

Take All reports **partial success** per line. It cannot be atomic: the primitive locks per Actor and there
is no all-or-nothing batch.

## The ledger

`taken` is written by the GM in the same handler that performed the transfer, and only for a row that
actually emptied (`sourceDeleted`). A partial take leaves a live row at the reduced quantity.

It lives on the Token document rather than in window memory deliberately. A per-window snapshot was tried
first and is wrong for the case that matters — several people looting one body: it cannot name the taker,
differs per client, and shows nothing to a window opened after the fact.

`order` is captured on the first take: the item ids as they stood before anything was removed. Rows rank
against that fixed list, so a looted row holds its original position. Live indices cannot be used — they
shift every time a row is removed.

Ledger writes are chained through one promise, since they are read-modify-write and requests are handled
concurrently.

## Presence

Who else has the body open is peer to peer over the same channel, not GM-brokered: it is display only, and
routing it through the GM would make an absent GM look like an empty room. A window announces on open, pings
so anyone already there re-announces, and announces again when the acting character changes. Departure is
covered twice — an explicit close message and a `userConnected` hook for a client that vanished.

## Async writes

Anything writing to a Token, or to an Actor belonging to one, **after an await** must re-check it still
exists. A guard at the top of an async function proves nothing ten awaits later. `document-liveness.js` holds
the checks.

A check before scheduling a timer is not a check: it has to be **inside** the callback, because the delay is
the window in which the document can be deleted.

An unlinked token's Actor is synthetic and dies with its token, so a flag write to it lands on the token's
embedded document — checking the Actor never catches that. Foundry reports the failure as
`undefined id [...] does not exist in the EmbeddedCollection`, which reads as a collection problem rather
than a lifetime one. A try/catch is the backstop, not the fix.

## Known limitations

- A packed container cannot be taken; empty it first. Pending `transferContainer()`.
- Currency has no "looted by" — a denomination is a balance several people can draw down.
- Burying a body during combat loses its XP award, because Foundry removes the Combatant with the Token and
  Blacksmith reads the roster at combat end. Being fixed at source in Blacksmith; Curator adds no guard,
  since one would only cover Curator and would mask the general case.
- A resized window resets to 520x560 next time it opens; position is not remembered.
