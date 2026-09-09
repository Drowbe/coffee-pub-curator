# For Players

**Audience:** a player at a table whose GM has installed Curator.

What Curator gives you, what it will stop you doing and why, and what to say to your GM when something
is greyed out. Almost all of Curator is GM tooling; this page is the part you touch.

## The only thing you need to know

**Double-click a body.** If a creature has died and your GM has Curator set up, its token becomes a body
you can open — even though you have no permission on that creature. That is the one gesture.

Everything about the window itself is in **[Looting a body](userguide-looting.md)**. This page is about
the limits around it.

## What you cannot do, and why

Your GM controls all of these. If something is disabled, one of them is the reason — and the fix is a
sentence to your GM, not a workaround.

**"I have to be closer."** There is a **Loot Proximity** setting measured in feet. Your character has to
be within it. Your GM can set it to 0 to remove the requirement entirely.

**"It says I cannot loot during combat."** There is an **Allow Looting in Combat** setting, and it is
off by default. Bodies become lootable when combat ends.

**"There is no Give button."** **Enable Give to Player** is off. That control hands an item straight to
another party member's character.

**"There is no Loot to Party button."** Either **Enable Send to Party** is off, or the world has no
primary party set. Both are GM-side.

**"Burying asks permission."** It should. A body that still holds anything asks your GM before it goes,
and they see who asked. An empty body goes immediately.

## What you will never be able to do

These are not settings — they are how the module is built.

**Edit a quantity.** Only the GM can change how much of something is on a body. You will not see the
in-place editor at all.

**Open the dead creature's character sheet.** Double-clicking a body opens the loot window and nothing
else. If a creature's actor sheet ever opens for you from a body, that is a security bug worth telling
your GM about immediately.

**Take a packed bag.** A bag with things inside it cannot change hands. Empty it row by row and the bag
itself becomes takeable — or press **Loot All**, which does both in the right order.

## Things that look wrong and are not

**A taken item stays in the list**, struck through, reading "Looted by *someone*". That is deliberate:
the party can see what came off the body and who has it.

**Coins do not say who took them.** A denomination is one balance several people draw down rather than a
thing that changes hands, so the window can only show what is left.

**Splitting coins leaves some behind.** Seven gold between three characters gives two each and leaves
one on the body. If there is not one coin each, it refuses and moves nothing rather than picking
winners.

**Someone else's take changes your list.** Several people can have the same body open. The list is live.

## If your character does not appear

The *Looting as* row names the character who receives what you take. If you own more than one, a
**Change** button lets you switch, and Curator remembers your choice.

If it says you have no character available, your user is not set as owner of any character actor. That
is a permissions setting on your user, and your GM sets it.

---

> **A note on this page.** Its claims are read off Curator's permission checks rather than seen from a
> player's client. If something here does not match what you actually see, the page is likely wrong
> rather than the module —
> [please say so](https://github.com/Drowbe/coffee-pub-curator/issues).
