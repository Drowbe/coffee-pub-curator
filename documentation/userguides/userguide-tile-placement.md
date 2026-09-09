# Tile and Map Images

**Audience:** a GM dressing a scene with artwork they already own.

How to browse your image folders and drop artwork onto the canvas at the right size, and how to set the
defaults so you stop adjusting every tile by hand. Scanning the folders is
**[The image cache](userguide-image-cache.md)**.

## Placing a tile

1. Open **Curator** in the Blacksmith menubar.
2. Choose the tile tool.
3. Search or filter, then place the image you want.

The browser is the same shape as the token one: a searchable, tag-filtered view of folders you
nominated in **Tile Image Folders**.

## Getting the size right — the one setting that matters

**Default Asset Grid Size (px)** is the pixel size of one grid square *in your source artwork*.

That sentence is the whole feature. If your art was drawn on a 256-pixel grid, put 256 here, and every
tile you place is scaled so its grid lines up with your scene's. Get it wrong and everything arrives at
the wrong scale, consistently — which at least makes it easy to spot.

**If your library mixes grid sizes**, set this to whichever is most common and adjust the others by
hand. It is a default, not a rule.

## The other defaults

Every placed tile starts with these, and each is a setting rather than a prompt, because being asked
seven questions per tile is worse than adjusting the occasional one afterwards.

| Setting | What it does |
|---|---|
| **Default Rotation** | Degrees, 0–359. |
| **Default Opacity** | 0.1 is nearly invisible, 1.0 fully opaque. |
| **Default Elevation** | What the tile sits above. |
| **Lock by Default** | Placed tiles cannot be dragged by accident. |
| **Hidden by Default** | Players do not see the tile until you reveal it. |
| **Drop Shadow on Placed Tiles** | A soft shadow, so art sits on the map rather than flat against it. |

**Lock by Default is the one to turn on.** Scene dressing is the thing you least want to move by
accident while selecting something else, and unlocking one tile is quicker than finding the one you
nudged.

**Hidden by Default suits reveal-as-you-go maps** — place all the dressing at once, reveal rooms as the
party enters.

## Finding things

**Fuzzy Search** on means near matches count; off means exact strings only. Leave it on unless your
filenames are rigidly systematic.

**Tag Sort Mode** controls the order tags appear in the browser. **Category Style** switches the
category filters between buttons and tabs, and **requires a reload** to take effect — if it seems not to
have worked, that is why.

**Number of Image Folders** sets how many folder paths you can configure, and also **requires a reload**
when you change it. Set it before you start filling in paths.

## When something looks wrong

**Every tile arrives at the wrong scale.** Default Asset Grid Size does not match your artwork.

**A tile cannot be selected.** Lock by Default is on. Unlock it in the tile's own configuration.

**Players cannot see a tile you placed.** Hidden by Default is on.

**Changing Category Style did nothing.** Reload the world.

**A folder's images do not appear.** It was added after the last scan. Run an incremental scan — see
**[The image cache](userguide-image-cache.md)**.
