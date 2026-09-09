# For the GM

**Audience:** the GM running a session with Curator installed.

The controls that are yours alone, in the order a session actually uses them. Setup happens once and is
covered in the feature guides; this is what you do while people are at the table.

## Before the session

**Check your loot tables are still attached.** Curator draws from roll tables you nominate, and a table
deleted or renamed elsewhere leaves the setting pointing at nothing. See
**[Filling bodies with loot](userguide-loot-generation.md)**.

**Scan if you have added artwork.** New folders are not noticed on their own. Open the replacement
window and run an incremental scan — it only looks at what changed. See
**[The image cache](userguide-image-cache.md)**.

## During combat

**Nothing to do.** Dead tokens convert on their own after the delay you set, and a chat card announces
each body.

**Looting is blocked during combat by default.** That is the **Allow Looting in Combat** setting. If
your table prefers to loot as they go, turn it on — but see the warning about burying, below.

## After combat: the bodies

**Everything on a body is yours to change.** Double-click a quantity in the loot window and edit it in
place — Enter commits, Escape reverts, clicking away commits. Set a quantity to 0 and it asks, then
removes the row. Players never see this editor.

**A packed bag has no editable quantity** until it is empty. That is the transfer limit, not a
permission.

**Two titlebar buttons are GM-only:** **Character Sheet** opens the dead creature's sheet, and
**Prototype Token** opens its prototype config. Both are the way back to the actor, since double-click
now belongs to looting.

### Adding something to a body

Drag it onto the body's actor sheet — reachable from the titlebar. Curator does not add a "put
something on this corpse" control, because the sheet already is one.

## Burying

**A body with things on it asks you first.** You get a prompt naming the character who asked, with
their portrait, and **Decline** / **Approve**. Approving clears the token and closes every open loot
window for that body, not just the asker's.

**Empty bodies go without asking**, and if **Bury Emptied Bodies** is on they go automatically as soon
as the last coin leaves.

**Do not approve a burial during combat if the XP matters.** Foundry removes the combatant with the
token, and experience is totalled from the roster at the end — so burying mid-combat loses that
creature's share for everyone. Wait until combat ends. This is being fixed in Blacksmith rather than
patched here, because a guard in Curator would only cover bodies buried through Curator and would hide
the general case.

## Images, mid-session

**A token dropped on the canvas can be replaced automatically** if you have that turned on. When the
guess is wrong — and it will be wrong for tokens named after a role rather than a creature, like "Guard
Captain" — open the replacement window with the token selected and pick from the ranked list by hand.

**Replace Canvas Tokens** does every token on the scene at once. Useful after importing a map full of
generic art; alarming if you have hand-picked images already, because it will replace those too.

## The switches you will actually reach for

| Setting | Why you would touch it mid-session |
|---|---|
| **Allow Looting in Combat** | The party wants to loot as they go. |
| **Loot Proximity** | A body is somewhere nobody can stand; set to 0 to drop the requirement. |
| **GM Approves Burying a Full Body** | You trust the table and want the prompts gone. |
| **Bury Emptied Bodies** | Corpses are cluttering the scene. |
| **Convert dead tokens to loot** | You want a specific death to leave no body. |

All of them, with their exact on-screen names, are in **[Settings](userguide-settings.md)**.

## When something looks wrong

Press **F12** and reproduce it. Curator logs its own failures with the module name in front, and the
difference between "Curator refused" and "Foundry threw" is usually visible in one line. Anything red
belongs in a [bug report](https://github.com/Drowbe/coffee-pub-curator/issues).

Check **[Known issues](../known-issues.md)** first — several of the odder behaviours are documented there and
are deliberate.
