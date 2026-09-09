# Filling Bodies with Loot

**Audience:** a GM deciding what the party finds on a corpse.

How a body gets its contents: the coin ranges, the four roll tables, and when it all happens. Taking
things off the body afterwards is **[Looting a body](userguide-looting.md)**.

## Turn it on

**Loot Tokens → Convert Dead to Loot.** Defeated NPCs become bodies players can double-click.

Two settings decide *when*:

- **Loot Delay** — seconds between death and conversion. This is the pause where the creature is still
  a corpse rather than a container.
- **Convert After Combat** — hold every conversion until the encounter ends. Bodies that drop mid-fight
  become lootable all at once when combat finishes.

**Convert After Combat is worth turning on** if your table stops to loot mid-fight and you would rather
they did not.

**Loot Chat Message** announces each body in chat. **Loot Conversion Sound** plays when one appears, and
**Loot Token Image** is the art the body uses once converted.

## Coins

**Add Coins** turns currency generation on, and then five settings cap each denomination:

**Max Platinum / Gold / Electrum / Silver / Copper Amount.**

Each is a **ceiling, not an amount** — the actual coins are rolled up to that number, so a goblin with
Max Gold 5 carries somewhere between none and five gold, not five.

Set the denominations you do not want to **0**. A world where nobody uses electrum should have Max
Electrum at 0, or every corpse will carry coins nobody wants to count.

## The four tables

Curator rolls on roll tables **you nominate**, from any installed compendium. It ships none — these are
your tables, or a compendium you already have.

| Table | Setting | Meant for |
|---|---|---|
| General Loot | **General Loot Compendium Table** | Everyday oddments |
| Adventuring Supplies | **Adventuring Supplies Compendium Table** | Rope, rations, torches |
| Treasure | **Treasure Compendium Table** | Things worth money |
| Epic Loot | **Epic Loot Compendium Table** | The rare good thing |

The first three each take two numbers:

- **Amount** — how many times to roll on that table.
- **Max Quantity** — the ceiling on how many of a single drawn item appear.

So General Amount 2 with General Max Quantity 3 rolls twice and can produce up to three of each result.

### Epic loot works differently

Epic has no Amount. It has **Epic Loot Odds** — a percentage chance the table is rolled at all.

**0 means never.** Set it low; the point of the table is that it usually does not fire. If every corpse
produces an epic drop, this number is the reason.

## What a body ends up with

Coins, plus a roll on each of the three ordinary tables, plus an epic roll if the odds came up. Any of
those you have not configured simply contributes nothing.

**A body with nothing on it is not broken.** If you have turned conversion on but nominated no tables
and no coins, every body will be empty and correct.

## Adding something by hand

Open the body's actor sheet — the **Character Sheet** button in the loot window's titlebar — and drag
the item on. Curator adds no separate "put this on the corpse" control, because the sheet already is
one.

## When it goes wrong

**Every body is empty.** No tables nominated, or Add Coins off with no tables. Check both.

**A table setting is blank that you know you set.** The nominated table was renamed or deleted in its
compendium. Re-pick it.

**Bodies are far too rich.** Amount is how many *rolls*, and Max Quantity multiplies each result — two
settings that stack. Try Amount 1 first.

**Epic drops constantly.** **Epic Loot Odds** is a percentage. 50 means half of all corpses.

**Nothing converts at all.** Check **Convert Dead to Loot** is on, and that **Convert After Combat** is
not holding everything until an encounter you never formally ended.
