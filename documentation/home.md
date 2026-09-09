# Coffee Pub Curator

**Audience:** anyone who has installed Curator, or is deciding whether to.

What Curator does and where to read about each part of it. This page is a map, not a manual — every
heading below links to the guide that actually explains the thing.

## What Curator does

Two jobs, which sound unrelated and share more than you would think: **it finds the right picture**, and
**it handles what happens to a creature after it dies**.

**Images.** Point Curator at folders of artwork and it builds a searchable cache. Drop a token on the
canvas and it can swap in the matching image automatically. Do the same for character portraits. Place
tiles and map images from the same library, with your own defaults for size, rotation, elevation and
drop shadow.

**Death and looting.** When a creature dies its token can change to a dead version, and then to a
lootable one. Players double-click the body and take what is on it, in a window built for a table where
four people are reaching into the same corpse at once. What is on the body can be generated from your
own roll tables and coin ranges.

You can use either half without the other.

## Guides

- **[Getting started](userguides/userguide-getting-started.md)** — the first five minutes. Install it, point it at a
  folder, see something happen.
- **[Settings](userguides/userguide-settings.md)** — every setting by the name it has on screen.
- **[For the GM](userguides/userguide-gm.md)** — the workflows that are yours alone, in the order a session runs.
- **[For players](userguides/userguide-player.md)** — what a player sees, and what they cannot.

By feature:

- **[Looting a body](userguides/userguide-looting.md)** — the loot window, taking, giving, and burying.
- **[Filling bodies with loot](userguides/userguide-loot-generation.md)** — coins, roll tables, and epic drops.
- **[Dead tokens](userguides/userguide-dead-tokens.md)** — swapping a token's art when its owner dies.
- **[Token and portrait images](userguides/userguide-token-images.md)** — automatic art matching, and how it decides.
- **[Tile and map images](userguides/userguide-tile-placement.md)** — placing artwork on the canvas.
- **[The image cache](userguides/userguide-image-cache.md)** — scanning folders, and what to do when a scan is slow.

## For contributors

- **[Loot architecture](architecture/architecture-loot.md)** — how looting is built, and the rules it must not break.
- **[Image replacement architecture](architecture/architecture-imagereplacement.md)** — matching, scoring, and caching.
- **[Known issues](known-issues.md)** — what does not work yet.

## What Curator needs

**[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) 14.1.0 or newer.** Curator does
not run without it. **D&D 5e**, because looting reads the system's own quantity, currency and container
fields. **Foundry v13 or v14** — verified on v14, and v13 stays supported until it breaks.
