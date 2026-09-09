# Getting Started

**Audience:** a GM who has just installed Curator and wants to see it do something.

The first five minutes. What Curator needs, how to turn on one half of it, and what changes on screen.
Each feature has its own guide; this page gets you to the point where there is something to read about.

## What you need

**Coffee Pub Blacksmith 14.1.0 or newer.** Curator does not run without it — Foundry will refuse to
enable Curator rather than let it half-work. Install both from their manifest URLs and enable both in
your world's module settings.

**D&D 5e**, because looting reads the system's own quantity, currency and container fields.
**Foundry v13 or v14.**

Nothing appears on screen the moment you enable Curator. It adds no bar and no button until you point
it at something.

## Curator is two halves — pick one

They share a settings tab and almost nothing else, and either works without the other.

**Images** — find the right picture for a token, a portrait, or a tile, from folders of artwork you
already own.

**Death and looting** — change a token's art when its owner dies, fill the body with loot, and let
players take it.

If you are not sure which you came for, do the images half first. It pays off in one scan.

## Five minutes: images

1. Open **Configure Settings → Module Settings → Coffee Pub Curator**.
2. Find **Token Image Folders** and put in a path to a folder of token art you own — something like
   `modules/your-token-pack/tokens`. Curator does not ship artwork; it indexes yours.
3. Open the **Curator** button in the Blacksmith menubar and press **Replace Token**.
4. The window will tell you there is no cache. Let it scan.
5. When the scan finishes, select a token on the canvas and open the same window. You will see ranked
   matches from your folders. Click one to apply it.

That is the whole loop. Automatic replacement on token drop, portraits, and tiles are all the same
machinery pointed at different things — see **[Token and portrait images](userguide-token-images.md)** and
**[Tile and map images](userguide-tile-placement.md)**.

**If the scan is slow**, it is almost certainly the number of *folders* rather than the number of
images. **[The image cache](userguide-image-cache.md)** explains why and what to do.

## Five minutes: looting

1. In the same settings tab, turn on **Convert dead tokens to loot**.
2. Put an NPC token on a scene and reduce it to 0 hit points.
3. Wait for the conversion delay. The token art changes, and a chat card announces the body.
4. **Double-click the body.** The loot window opens.

At this point the body is probably empty, which is correct — nothing generates loot until you tell it
what to generate. **[Filling bodies with loot](userguide-loot-generation.md)** covers coins and roll
tables. **[Looting a body](userguide-looting.md)** covers the window itself.

**Try it as a player before you trust it.** Log in as a non-GM, double-click the same body, and confirm
the loot window opens *and the actor sheet does not*. That is the single most important thing to verify
in this module, and it is covered in **[For players](userguide-player.md)**.

## Where to go next

- **[Settings](userguide-settings.md)** — all of them, by the name on screen. There are a lot.
- **[For the GM](userguide-gm.md)** — the controls only you get, in the order a session uses them.
- **[Known issues](../known-issues.md)** — read this before filing a bug.
