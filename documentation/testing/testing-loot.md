# Loot Testing Checklist

Working checklist for the corpse-looting feature. Tick as you go; note failures inline.

`../plans/plan-loot.md` section 16 is the reference matrix; `../architecture/architecture-loot.md`
describes what the system actually does. This file is the practical order to work through it.

---

## Setup

- [x] World **restarted** (not just refreshed) since `module.json` gained `"socket": true`.
- [x] Blacksmith on a build with `api.tokens`, `api.inventory`, and `transferItems`.
- [x] A primary party is set for the world (`game.actors.party`), or Send-to-Party is expected to be off.
- [x] A non-GM player login available, owning **two** characters if possible.
- [x] `tokenConvertDeadToLoot` on.

Handy console checks:

```js
// Blacksmith surfaces present
const b = game.modules.get('coffee-pub-blacksmith').api;
[!!b.tokens?.registerInteraction, !!b.inventory?.transferItems, !!game.actors.party]

// Curator's loot manager, exposed to every user
game.modules.get('coffee-pub-curator').api.loot
```

---

## 1. Opening a corpse

- [x] NPC dies → converts after the delay → loot chat card posts.
- [x] Double-click the corpse as GM → loot window opens.
- [x] Double-click as a **player with no permission on the corpse** → window opens, Actor sheet does **not**.
- [x] Double-click an ordinary NPC the player lacks permission on → **nothing happens, no sheet**.
  ```
  *A sheet opening here is a security regression — stop and report to Blacksmith.*
  ```
- [x] Double-click the player's own character → sheet opens normally.

---

## 2. Window

- [x] Resize the window; corpse card and "Looting as" row stay pinned while rows scroll under them.
- [x] Titlebar (GM): **Character Sheet** opens the sheet.
- [x] Titlebar (GM): **Prototype Token** opens the prototype config.
- [x] GM double-clicks a quantity → edits in place; Enter commits, Escape reverts, clicking away commits.
- [x] Setting a quantity to 0 → confirms, then removes the row.
- [x] A **packed** bag has no editable quantity; empty it and the quantity becomes editable.
- [x] A player sees no editable quantities.
- [x] Footer reads `[ Done ]` left, `[ Loot to Party ] [ Loot All ]` right, sized to content.
- [x] Window stays draggable while a dialog is open.

---

## 3. Taking

- [x] Take a single-quantity item → transfers immediately, no prompt.
- [x] Take from a stack → prompt appears; **dragging the slider updates the Take/Leave numbers**.
- [x] Dialog buttons read `[ Cancel ]` left, `[ Take ]` right.
- [x] Partial take → row stays, quantity reduced.
- [x] Full take → row struck through, reads **"Looted by *name*"**, **stays in its original position**.
- [x] Take an item the recipient already holds → their stack grows, no second row.
- [x] Take currency → prompt, then the balance drops.

---

## 4. Looting as

- [x] With two owned characters, the Change button appears.
- [x] Pick the **second** character, confirm, take an item → it lands on **that** character.
- [x] Choice is remembered when the window is reopened.
- [x] With no owned character, the row says so and Take is disabled.

---

## 5. Give / Party / Distribute

- [x] Give → picker lists party characters; item lands on the chosen one.
- [x] Party → item lands in the party Group actor's inventory.
- [x] Currency Party → coins land on the party actor.
- [x] Distribute 7 gp across 3 characters → each gets 2 gp, **1 gp stays on the body**.
- [x] Distribute with less than one per member → refused, nothing moves.

---

## 6. Loot All

- [x] Loot All as a **player** completes (this is the one never confirmed working).
- [x] Loot All shows a floating spinner reading "Looting everything…" over the dimmed list, readable, and
  ```
  still visible when the list is scrolled.
  ```
- [x] Loot All over a corpse holding a **packed bag** → everything else moves, bag reported left behind.
  ```
  *Blacksmith flags this as the most likely to look fine while being wrong.*
  ```
- [x] Corpse with two identical stacks → they arrive as **one** stack.
- [x] Packed bags are **visible**, with the bag and its contents inside one dotted box.
- [x] Empty a bag row by row → its controls reappear and the bag can be taken.
- [x] **Loot All takes the bags too** — contents first, then the emptied bags, in one action.
- [x] Loot to Party moves everything to the party actor.

---

## 7. Bury

- [x] Bury an **empty** body → goes immediately, no prompt.
- [x] Bury a body **with items** as a player → GM sees a prompt with the asking character's **portrait**.
- [x] Prompt buttons read `[ Decline ]` left, `[ Approve ]` right.
- [x] Decline → token stays.
- [x] Approve → token goes, and every open loot window closes (not just the requester's).

---

## 8. Settings

- [x] `lootProximity` at 30 → looting from across the map refused with the distance named; works up close.
- [x] `lootProximity` at 0 → no distance check.
- [x] `lootAllowInCombat` off → the window **does not open** for a player, with a message; GM unaffected.
- [x] `lootSendToParty` off → party controls disappear.
- [x] `lootSendToPlayer` off → Give disappears.
- [x] `lootBuryApproval` off → burying a full body happens with no prompt.
- [x] `lootBuryWhenEmpty` on → taking the last coin removes the token and closes the windows.
- [x] `tokenConvertAfterCombat` on → body does **not** convert mid-fight; converts when combat ends.
- [x] Same, but revive the creature before combat ends → never converts.
- [x] Same, but reload the browser mid-combat → body is not lost, still converts at the end.

---

## 9. Two clients

- [x] Two players take the same last item → one wins, the other is told, totals unchanged.
- [x] Both windows refresh after either take, without reopening.
- [x] Each sees the other's portrait left of "Looting as", with a divider between.
- [x] One closes their window → their portrait disappears from the other's.
- [x] One changes who they are looting as → the portrait the other sees updates.
- [x] One reloads or disconnects without closing → their portrait still disappears.
- [x] Both see the same "Looted by" name.
- [x] A third player opening the window later sees the same looted rows.
- [x] Take the **second** of three rows, then the **first** → all three stay in original order, two struck through.

---

## 10. Report back to Blacksmith

Their consolidated list — these five specifically:

- [x] Loot All leaves a packed bag behind while taking everything else *(§6)*
- [x] Duplicate rows coalesce into one stack *(§6)*
- [x] Quantity slider does not freeze the window *(§2, §3)*
- [x] Two-button footer lays out correctly *(§2)*
- [x] **No** `dnd5eencumbered0` **console errors** looting several items onto a near-encumbered character

The last one is where a failure is most interesting to them now: both known causes are fixed, so a
reappearance means something unknown is writing twice to an Actor.

Also worth reporting: any error code the window renders as the generic *"That loot action could not be
completed."* — that means a code with no specific message.

---

## Known and expected

Not bugs; do not chase these.

- A window opened **after** an item was taken still shows the looted row (it reads the Token's ledger).
- Currency has no "looted by" — a denomination is a balance several people can draw down.
- A resized window resets to 520x560 next time it opens; position is not remembered.
- The loot chat card is an announcement only. Its Loot button was removed; double-click is the way in.
- A container holding items cannot be taken as one; empty it and the bag becomes takeable. This is
`api.inventory` v1 — a `transferContainer()` is planned. See `../plans/plan-loot.md`.
- Hovering a corpse shows the ordinary token pointer. Foundry sets that on every token, so a lootable body
looks no different; a distinct cursor would have to come from Blacksmith's claim registry.
- Burying a body mid-combat currently loses its XP. Blacksmith is fixing this at the source; Curator adds
no guard. See `TODO.md`.

