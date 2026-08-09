# Coffee Pub Curator

![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

## Disclaimer

This is a personal project created for my FoundryVTT games to introduce various quality-of-life features and functions.

If you stumble upon this repository and find it useful, feel free to try it out! However, please note that this project is developed for personal use, and I make no guarantees regarding stability, compatibility, or ongoing support.

**Use at your own risk.** I am not responsible for any issues, data loss, or unexpected behavior resulting from using this project.

## Overview

**Coffee Pub Curator** handles token and portrait artwork, dead token visuals, and what happens to a body after it falls. It matches images to actors using customisable weighting, and turns defeated creatures into corpses your players can actually loot.

This module was originally part of Coffee Pub Blacksmith and has been extracted into its own standalone module for better modularity. **Coffee Pub Blacksmith is required for this module to function.**

## Key Features

### Token and Portrait Image Replacement
- Automatically replaces token and actor portrait images based on file naming conventions and path matching.
- **Data Weighting:** Configure the importance of factors like actor name, folder structure, and tag matches to determine the best possible image for a token.
- Seamlessly updates dropped tokens onto the canvas with appropriate art.
- Batch tools to re-match every token or portrait on the current canvas.

### Dead Tokens
- **Dead Token Replacement:** When a creature is defeated or reduced to 0 HP, automatically replace its token image with a designated "dead" version.
- Separate handling for player characters and NPCs, including death-save overlays.
- Original artwork is stored and restored if the creature is revived.

### Loot Generation
- **Loot Tables:** Configure general, adventuring supplies, treasure, and epic loot tables to generate loot for defeated enemies.
- **Currency:** Add configurable amounts of platinum, gold, electrum, silver, and copper.
- **Epic Loot Odds:** Assign a percentage chance to roll on an Epic Loot table for special encounters.
- **Convert After Combat:** Optionally hold conversion until the encounter ends, so bodies do not become lootable mid-fight.

### Looting
Double-click a prepared body and a loot window opens.

- **Take** a whole row, or part of a stack with a quantity slider.
- **Give** an item to another party member.
- **Send to Party** — items or coin to the party inventory.
- **Distribute** coin evenly across the party; the remainder stays on the body.
- **Loot All** in a single action.
- **Bury** the body to remove it from the canvas, with GM approval when it still holds something.
- Fully-taken rows stay in the list marked **Looted by** whoever took them, so the body reads as a record.
- Container contents are shown nested inside the bag they came from.
- See who else has the same body open while you are looting it.

GM controls: edit any quantity in place by double-clicking it, remove items, and open the corpse's character sheet or prototype token from the window titlebar.

World settings cover loot proximity, whether looting is allowed during combat, whether bodies are buried once emptied, and whether the party and give-to-player controls appear at all.

## Installation

1. Inside Foundry VTT, use the following manifest URL:
   ```
   https://github.com/Drowbe/coffee-pub-curator/releases/latest/download/module.json
   ```
2. Alternatively, you can download the [latest zip release](https://github.com/Drowbe/coffee-pub-curator/releases/latest/download/coffee-pub-curator.zip) and extract it to your `Data/modules/coffee-pub-curator` directory.
3. Enable the module in your game world's module settings.

## Requirements

- [Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith): provides the core API, shared window and dialog components, inventory primitives, socket infrastructure, and settings menus. Curator does not function without it.
- **D&D 5e.** Loot generation and looting read `system.quantity`, `system.currency`, and dnd5e's container model.

No other modules are required or recommended.

> **Upgrading from 13.2.x or earlier:** Curator used to convert dead tokens into Item Piles, and that module was effectively required. It no longer is — looting is now Curator's own and Item Piles is not used, recommended, or checked for. Bodies converted by an earlier version remain Item Piles and are left alone; newly prepared bodies use Curator's own state. Note that 13.3.0 sets `"socket": true` in the manifest, which needs a **world restart** rather than a browser refresh.

## Documentation

- `documentation/architecture/` — how the implemented systems work
- `documentation/plans/` — intent and the reasoning behind decisions
- `documentation/testing/` — verification checklists
- `documentation/TODO.md` — known issues, patterns to avoid, and ideas not yet scheduled

## Support

If you encounter any issues or have suggestions, please file them in the [Issues](https://github.com/Drowbe/coffee-pub-curator/issues) section of the repository.

## License

This work is licensed under the included LICENSE file.

## Credits

Part of the Coffee Pub module collection.
