# Settings

**Audience:** anyone looking for one particular switch, or working out what a setting they just found
actually does.

Every Curator setting by the name it carries on screen, in the order the settings tab shows them. This
is a reference — the feature guides explain *why* you would set these, and are linked from each
section.

All of Curator's settings are **world-scoped**: one answer for the whole world, set by the GM.

**Where:** Configure Settings → Module Settings → **Coffee Pub Curator**.

---

## Dead Tokens

Changing a token's art when its owner dies. See **[Dead tokens](userguide-dead-tokens.md)**.

| Setting | What it does |
|---|---|
| **Enable Dead Token Replacement** | Master switch for this whole section. Off by default. |
| **Creature Type Filter** | Comma-separated creature types that get dead art — `humanoid,beast`. Empty means every NPC. |
| **Dead NPC Image** | Path to the image used for NPCs and monsters. Applied immediately at 0 HP. |
| **Dead Player Image** | Path to the image used for player characters. Applied after **three failed death saves**, not at 0 HP. |
| **NPC Death Sound** | Played when an NPC dies. Chosen from Blacksmith's library. |
| **Player Death Sound** | Played when a PC fails their third death save. |
| **Player Stabilized Sound** | Played when a downed PC stabilises instead of dying. The only positive one, and the one people forget to set. |

---

## Loot Tokens

Turning bodies into things players can open, and deciding what is on them. See
**[Filling bodies with loot](userguide-loot-generation.md)** and **[Looting a body](userguide-looting.md)**.

### Configuration

| Setting | What it does |
|---|---|
| **Convert Dead to Loot** | Master switch. Defeated NPCs become bodies players double-click. |
| **Loot Delay** | Seconds between death and conversion. |
| **Convert After Combat** | Hold every conversion until the encounter ends, so nothing is lootable mid-fight. |
| **Loot Token Image** | The art a body uses once it has converted. Replaces the dead-token art. |
| **Loot Conversion Sound** | Played when a body becomes lootable. |
| **Loot Chat Message** | Announce each body in chat. |

### Looting

How players interact with a prepared corpse. Every one of these is a common "why can't I…" — see
**[For players](userguide-player.md)**.

| Setting | What it does |
|---|---|
| **Loot Proximity** | How close a character must stand, in feet. **0 removes the requirement.** |
| **Allow Looting in Combat** | Off by default; bodies become lootable when combat ends. |
| **Enable Send to Party** | Shows the controls that send loot to the party inventory. **Needs a primary party set for the world.** |
| **Enable Give to Player** | Shows the control that hands an item to another party member. |
| **GM Approves Burying a Full Body** | Ask before burying a body that still holds anything. Empty bodies never ask. |
| **Bury Emptied Bodies** | Remove the token automatically once the last item and coin are gone. |

### Coins

Each maximum is a **ceiling, not an amount** — coins are rolled up to it. Set a denomination to `0` if
your world does not use it.

| Setting | What it does |
|---|---|
| **Add Coins** | Master switch for currency generation. |
| **Max Platinum Amount** | Most platinum a body can carry. |
| **Max Gold Amount** | Most gold. |
| **Max Electrum Amount** | Most electrum. Set to 0 unless your table actually uses it. |
| **Max Silver Amount** | Most silver. |
| **Max Copper Amount** | Most copper. |

### Loot tables

Four tables, each a RollTable you nominate from any installed compendium. Curator ships none.

**Amount** is how many times to roll. **Max Quantity** is the ceiling on how many of one drawn item
appear. The two multiply, which is how bodies end up far richer than intended.

| Setting | What it does |
|---|---|
| **General Loot Compendium Table** | Everyday oddments. |
| **General Amount** | How many rolls on it. |
| **General Max Quantity** | Most of any single result. |
| **Adventuring Supplies Compendium Table** | Rope, rations, torches. |
| **Adventuring Supplies Amount** | How many rolls. |
| **Adventuring Supplies Max Quantity** | Most of any single result. |
| **Treasure Compendium Table** | Things worth money. |
| **Treasure Amount** | How many rolls. |
| **Treasure Max Quantity** | Most of any single result. |
| **Epic Loot Compendium Table** | The rare good thing. |
| **Epic Loot Odds** | **Percentage chance the epic table is rolled at all.** 0 means never. This has no Amount — the odds are the control. |

---

## Token and Portrait Image Replacement

Finding the right art for a token or a portrait. See
**[Token and portrait images](userguide-token-images.md)**.

**Tokens and portraits are configured separately throughout** — separate folders, separate caches,
separate switches. Setting up one does nothing for the other.

### General

| Setting | What it does |
|---|---|
| **Show in CoffeePub Toolbar** | Put the replacement buttons on Curator's own menubar bar. |
| **Show in FoundryVTT Toolbar** | Put them on Foundry's token toolbar instead, or as well. |
| **Category Style** | Category filters as buttons or as tabs. **Requires a reload.** |
| **Tag Sort Mode** | The order tags appear in the browser. |

### Data Weighting

What the match score is made of. Raise the signals your library actually supports: filenames named
after creatures make the name weights matter, folders sorted by type make Creature Type matter.

| Setting | What it does |
|---|---|
| **Actor Name** | Weight given to the actor's name. |
| **Token Name** | Weight given to the token's own name, which often differs. |
| **Represented Actor** | Weight given to the actor a token represents. |
| **Creature Type** | Weight given to type — humanoid, beast, undead. |
| **Creature Subtype** | Weight given to subtype. |
| **Equipment** | Weight given to what the creature carries. |
| **Size** | Weight given to token size. |
| **Tags** | Weight given to tags derived from filenames and folders. |

### Token Replacement

| Setting | What it does |
|---|---|
| **Enable Token Replacement** | Master switch for token art. |
| **Update Dropped Token Images** | Replace art the moment a token lands on the canvas. |
| **Matching Threshold** | How good a match must be. **Lower is fuzzier, higher is stricter.** If nothing ever matches, this is why. |
| **Fuzzy Search** | Off means exact string matches only. |
| **Token Image Variability** | When several images tie for best, pick at random. **Turn on for anything you place in numbers**, or eight goblins share one picture. |
| **Update Monsters** | Include monsters in automatic replacement. |
| **Update NPCs** | Include NPCs. |
| **Update Vehicles** | Include vehicles. |
| **Update Actors** | Include player-type actors. |
| **Skip Linked Tokens** | Leave linked tokens alone. **Worth keeping on** — a linked token shares its actor, so replacing its art changes every copy and the actor too. |

### Token Image Folders

| Setting | What it does |
|---|---|
| **Number of Image Folders** | How many folder slots to offer. **Requires a reload** to add or remove them. |
| **Ignored Folders** | Never scanned. `_gsdata_, .DS_Store`. The only filter that makes a scan *faster*. |
| **Deprioritized Words** | Still indexed, ranked lower. Useful for variants you want available but not preferred. |
| **Ignored Words** | Filenames matching are skipped entirely. Supports `*`. |
| **Ignored Tag Patterns** | Tags matching are dropped. `00*`, `*X*` for dimensions. |
| **Auto-Filter Garbage Tags** | Discard tags that are obviously dimensions, variant codes or bare numbers. |
| **Monster Mapping** | Maps creature names to folders or terms, for libraries whose names do not match your actors'. |
| **Drop Shadow on Replaced Tokens** | Give replaced tokens a soft shadow. Off by default, since art that already has one would get two. |

### Portrait Replacement

The same set, applied to actor portraits.

| Setting | What it does |
|---|---|
| **Replace Portraits** | Master switch for portrait art. |
| **Update Dropped Portraits** | Update an actor's portrait when its token is dropped. |
| **Matching Threshold** | As above, for portraits. |
| **Fuzzy Search** | As above. |
| **Portrait Image Variability** | As above. |
| **Update Monsters / NPCs / Vehicles / Actors** | Which actor kinds are touched. |
| **Skip Linked Tokens** | As above. |
| **Number of Image Folders** | Portrait folder slots. **Requires a reload.** |

---

## Tile and Map Image Placement

Placing artwork on the canvas. See **[Tile and map images](userguide-tile-placement.md)**.

### Default Tile Parameters

Applied to every tile you place, so you are not asked seven questions each time.

| Setting | What it does |
|---|---|
| **Default Asset Grid Size (px)** | **The one that matters.** The pixel size of one grid square *in your source artwork*. Tiles are scaled so it matches your scene. Wrong here means everything arrives at the wrong scale. |
| **Default Rotation** | Degrees, 0–359. |
| **Default Opacity** | 0.1 nearly invisible, 1.0 opaque. |
| **Default Elevation** | What the tile sits above. |
| **Lock by Default** | Placed tiles cannot be dragged by accident. **Worth turning on.** |
| **Hidden by Default** | Players do not see a tile until you reveal it. Suits reveal-as-you-go maps. |
| **Drop Shadow on Placed Tiles** | A soft shadow, so art sits on the map rather than flat against it. |

### Search and Display

| Setting | What it does |
|---|---|
| **Fuzzy Search** | Near matches count. Off means exact strings only. |
| **Tag Sort Mode** | Order of tags in the browser. |
| **Category Style** | Buttons or tabs. **Requires a reload.** |
| **Display Cache Status** | Show cache state in the browser window. |

### Tile Image Folders

| Setting | What it does |
|---|---|
| **Number of Image Folders** | Tile folder slots. **Requires a reload.** |

---

## Settings that need a reload

Changing any of these appears to do nothing until you reload the world:

- **Category Style** (token/portrait, and tile)
- **Number of Image Folders** (token, portrait, and tile)

## Settings that need a rescan

Changing these affects what is *in* the cache, so the cache has to be rebuilt before you see it:

- Any folder path
- **Ignored Folders**, **Ignored Words**, **Ignored Tag Patterns**, **Auto-Filter Garbage Tags**

See **[The image cache](userguide-image-cache.md)**.
