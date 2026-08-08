# Loot Testing Checklist

Working checklist for the corpse-looting feature. Tick as you go; note failures inline.

`plan-loot.md` section 16 is the reference matrix — this is the practical order to work through it.

---

## Setup

- [ ] World **restarted** (not just refreshed) since `module.json` gained `"socket": true`.
- [ ] Blacksmith on a build with `api.tokens`, `api.inventory`, and `transferItems`.
- [ ] A primary party is set for the world (`game.actors.party`), or Send-to-Party is expected to be off.
- [ ] A non-GM player login available, owning **two** characters if possible.
- [ ] `tokenConvertDeadToLoot` on.

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

- [ ] NPC dies → converts after the delay → loot chat card posts.
- [ ] Double-click the corpse as GM → loot window opens.
- [ ] Double-click as a **player with no permission on the corpse** → window opens, Actor sheet does **not**.
- [ ] Loot button on the chat card opens the window for a player.
- [ ] Double-click an ordinary NPC the player lacks permission on → **nothing happens, no sheet**.
      *A sheet opening here is a security regression — stop and report to Blacksmith.*
- [ ] Double-click the player's own character → sheet opens normally.

---

## 2. Window

- [ ] Resize the window; corpse card and "Looting as" row stay pinned while rows scroll under them.
- [ ] Titlebar (GM): **Character Sheet** opens the sheet.
- [ ] Titlebar (GM): **Prototype Token** opens the prototype config.
- [ ] Footer reads `[ Done ]` left, `[ Loot to Party ] [ Loot All ]` right, sized to content.
- [ ] Window stays draggable while a dialog is open.

---

## 3. Taking

- [ ] Take a single-quantity item → transfers immediately, no prompt.
- [ ] Take from a stack → prompt appears; **dragging the slider updates the Take/Leave numbers**.
- [ ] Dialog buttons read `[ Cancel ]` left, `[ Take ]` right.
- [ ] Partial take → row stays, quantity reduced.
- [ ] Full take → row struck through, reads **"Looted by *name*"**, **stays in its original position**.
- [ ] Take an item the recipient already holds → their stack grows, no second row.
- [ ] Take currency → prompt, then the balance drops.

---

## 4. Looting as

- [ ] With two owned characters, the Change button appears.
- [ ] Pick the **second** character, confirm, take an item → it lands on **that** character.
- [ ] Choice is remembered when the window is reopened.
- [ ] With no owned character, the row says so and Take is disabled.

---

## 5. Give / Party / Distribute

- [ ] Give → picker lists party characters; item lands on the chosen one.
- [ ] Party → item lands in the party Group actor's inventory.
- [ ] Currency Party → coins land on the party actor.
- [ ] Distribute 7 gp across 3 characters → each gets 2 gp, **1 gp stays on the body**.
- [ ] Distribute with less than one per member → refused, nothing moves.

---

## 6. Loot All

- [ ] Loot All as a **player** completes (this is the one never confirmed working).
- [ ] Loot All over a corpse holding a **packed bag** → everything else moves, bag reported left behind.
      *Blacksmith flags this as the most likely to look fine while being wrong.*
- [ ] Corpse with two identical stacks → they arrive as **one** stack.
- [ ] Loot to Party moves everything to the party actor.

---

## 7. Bury

- [ ] Bury an **empty** body → goes immediately, no prompt.
- [ ] Bury a body **with items** as a player → GM sees a prompt with the asking character's **portrait**.
- [ ] Prompt buttons read `[ Decline ]` left, `[ Approve ]` right.
- [ ] Decline → token stays.
- [ ] Approve → token goes, and every open loot window closes (not just the requester's).

---

## 8. Settings

- [ ] `lootProximity` at 30 → looting from across the map refused with the distance named; works up close.
- [ ] `lootProximity` at 0 → no distance check.
- [ ] `lootAllowInCombat` off → looting during combat refused; GM unaffected.
- [ ] `lootSendToParty` off → party controls disappear.
- [ ] `lootSendToPlayer` off → Give disappears.
- [ ] `lootBuryApproval` off → burying a full body happens with no prompt.
- [ ] `lootBuryWhenEmpty` on → taking the last coin removes the token and closes the windows.
- [ ] `tokenConvertAfterCombat` on → body does **not** convert mid-fight; converts when combat ends.
- [ ] Same, but revive the creature before combat ends → never converts.
- [ ] Same, but reload the browser mid-combat → body is not lost, still converts at the end.

---

## 9. Two clients

- [ ] Two players take the same last item → one wins, the other is told, totals unchanged.
- [ ] Both windows refresh after either take, without reopening.
- [ ] Both see the same "Looted by" name.
- [ ] A third player opening the window later sees the same looted rows.
- [ ] Take the **second** of three rows, then the **first** → all three stay in original order, two struck through.

---

## 10. Report back to Blacksmith

Their consolidated list — these five specifically:

- [ ] Loot All leaves a packed bag behind while taking everything else *(§6)*
- [ ] Duplicate rows coalesce into one stack *(§6)*
- [ ] Quantity slider does not freeze the window *(§2, §3)*
- [ ] Two-button footer lays out correctly *(§2)*
- [ ] **No `dnd5eencumbered0` console errors** looting several items onto a near-encumbered character

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
- Burying a body mid-combat currently loses its XP. Blacksmith is fixing this at the source; Curator adds
  no guard. See `TODO.md`.
