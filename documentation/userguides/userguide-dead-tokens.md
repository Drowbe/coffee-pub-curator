# Dead Tokens

**Audience:** a GM who wants a token to look dead when its owner dies.

How to make a token's art change on death, which creatures it applies to, and how it differs from
turning that body into loot. Looting is separate and comes after — see
**[Filling bodies with loot](userguide-loot-generation.md)**.

## What it does

When a creature reaches 0 hit points, Curator swaps its token image for one you nominate. Nothing else
changes: it is the same token, the same actor, in the same place. It just looks dead.

Turn it on with **Dead Tokens → Enable Dead Token Replacement**.

## Players and NPCs die differently

This trips people up, and it is deliberate.

**NPCs change at 0 HP, immediately.** They are dead when they hit zero.

**Player characters change after three failed death saves.** A downed PC is not a dead PC, and swapping
their art the moment they drop would say otherwise at the table.

They also take separate images, because they usually want different art:

- **Dead NPC Image** — the full path to the image used for NPCs and monsters.
- **Dead Player Image** — the same for player characters.

Both are paths into your own asset folders. Curator ships no artwork.

## Restricting it to some creatures

**Creature Type Filter** takes a comma-separated list — `humanoid,beast` — and applies dead art only to
those types. Leave it empty and every NPC is covered.

Use this when your dead art is a bloodstain that looks wrong under an ooze or a swarm.

## Sounds

Three, each optional, chosen from Blacksmith's sound library rather than files you supply:

- **NPC Death Sound** — an NPC hits 0.
- **Player Death Sound** — a PC fails their third save.
- **Player Stabilized Sound** — a downed PC stabilises instead.

The stabilise sound is the one people forget to set and then miss, because it is the only positive
event in the group.

## Dead is not the same as lootable

Two separate features, and you can run either alone.

| | Dead tokens | Loot conversion |
|---|---|---|
| Turned on by | **Enable Dead Token Replacement** | **Convert Dead to Loot** |
| Changes | the token's art | the token into a body players can open |
| Timing | immediate (NPC) | after **Loot Delay** |
| Players can | look at it | double-click and take things |

Running both means a creature dies, looks dead, and shortly afterwards becomes a body with things on
it. Running dead tokens alone gives you corpses that are scenery.

**If you run both, the loot art wins.** The body's image becomes **Loot Token Image** once it converts,
so the dead art is what players see during the delay.

## When nothing happens

**The token art does not change.** Check the path actually resolves — a typo in an image path fails
silently, because Foundry is asked for a file and simply does not find one. Paste the path into a file
picker to confirm.

**A PC dropped and stayed normal.** That is correct until their third failed death save.

**An NPC of one type changed and another did not.** Check **Creature Type Filter** — a non-empty filter
excludes everything it does not list.

## The settings, by name

All of these live under **Dead Tokens** in the module settings tab, and are listed with everything else
in **[Settings](userguide-settings.md)**.
