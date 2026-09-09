# Looting a Body

**Audience:** anyone at the table — this is the window players use.

How to open a body, take what is on it, hand things to someone else, and clear it away. Filling bodies
in the first place is **[Filling bodies with loot](userguide-loot-generation.md)**; this guide is about the
window.

## Opening a body

**Double-click the corpse.** That is the whole gesture, and it works for players who have no permission
on the dead creature's actor — which is the point. A player double-clicking an ordinary NPC they do not
own still gets nothing, exactly as before.

A body has to have been prepared first: the creature died, and Curator converted its token. If
double-clicking does nothing, the token is not a prepared body.

## The window

Three parts, and the top two stay put while the list scrolls:

- **The corpse card** — whose body it is.
- **Looting as** — the character who will receive whatever you take.
- **The list** — everything on the body.

At the bottom: **Done** on the left, **Loot to Party** and **Loot All** on the right.

If other people have the same body open, you will see them. Looting is built for four players reaching
into one corpse at once, so the list updates as they take things.

## Taking something

**Click the item.** If there is only one, it moves immediately. If it is a stack, you get a prompt with
a slider — drag it and the Take and Leave numbers move together, so you can take three arrows out of
twenty and leave the rest.

Once a row is fully taken it does not vanish. It stays where it was, struck through, reading **"Looted
by *name*"** — so the party can see what came off the body and who has it. Coins are the exception:
currency is one balance several people draw down, so it shows what is left but not who took the rest.

If you take something the receiving character already carries, it joins their existing stack rather
than making a second row.

## Looting as someone else

If you own more than one character, a **Change** button appears next to *Looting as*. Pick a different
character and everything you take from then on lands on them. The choice is remembered next time you
open a body.

If you own no character at all, the row says so and taking is disabled.

## Giving it to somebody else

Three buttons do different things and are easy to confuse:

- **Give** — pick one party member; the item goes to them.
- **Loot to Party** — everything on the body goes to the party's shared inventory.
- **Distribute** (on currency) — splits coins evenly between party members.

**Distribute leaves a remainder on the body.** Seven gold across three characters gives each of them
two and leaves one where it was. If there is less than one coin per member it refuses and moves
nothing, rather than deciding who misses out.

## Loot All

Takes everything, in one action, to the character in *Looting as*. It shows a spinner while it works.

**Bags are handled properly**: contents first, then the emptied bag. A packed bag cannot move while it
has things in it — that is a limit in the underlying transfer, not a rule Curator invented — so Loot
All empties it and then takes it.

If you take a bag row by row instead, its own controls come back once it is empty and you can take it.

## Burying a body

**Bury** clears the token from the scene.

- An **empty** body goes immediately.
- A body that **still has things on it** asks the GM first. They see who is asking, with that
  character's portrait, and can **Approve** or **Decline**.

When a body is buried, every open loot window for it closes — not just the window of whoever asked.

**Do not bury during combat if you want the XP.** Foundry removes the combatant along with the token,
and the experience is totalled from the combat roster at the end. Bury afterwards. This is being fixed
upstream; see [Known issues](../known-issues.md).

## Things that are not bugs

- A packed bag has no editable quantity until it is empty.
- Coins show no "looted by" name.
- The window forgets its size when you close it.
