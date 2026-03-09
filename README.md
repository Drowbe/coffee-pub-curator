# Coffee Pub Curator

![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![MIT License](https://img.shields.io/badge/license-MIT-blue)

## Disclaimer

This is a personal project created for my FoundryVTT games to introduce various quality-of-life features and functions. 

If you stumble upon this repository and find it useful, feel free to try it out! However, please note that this project is developed for personal use, and I make no guarantees regarding stability, compatibility, or ongoing support.

**Use at your own risk.** I am not responsible for any issues, data loss, or unexpected behavior resulting from using this project.

## Overview

**Coffee Pub Curator** is a module designed for token and portrait image replacement, dead token visual management, and loot pile generation. It intelligently matches images for actors based on customizable data weighting and provides automation for handling defeated NPCs and creatures.

This module was originally part of Coffee Pub Blacksmith and has been extracted into its own standalone module for better modularity. **Coffee Pub Blacksmith is required for this module to function.**

## Key Features

### Token and Portrait Image Replacement
- Automatically replaces token and actor portrait images based on file naming conventions and path matching.
- **Data Weighting:** Configure the importance of factors like actor name, folder structure, and tag matches to determine the best possible image for a token.
- Seamlessly updates dropped tokens onto the canvas with appropriate art.

### Dead Tokens & Loot Generation
- **Dead Token Replacement:** When a creature is defeated or reduced to 0 HP, automatically replace its token image with a designated "dead" version.
- **Loot Piles:** Automatically convert dead tokens into loot piles (requires the Item Piles module).
- **Loot Table Integration:** Configure general, gear, treasure, and epic loot tables to randomly generate loot for defeated enemies.
- **Currency Generation:** Automatically add configurable amounts of platinum, gold, electrum, silver, and copper to loot piles.
- **Epic Loot Odds:** Assign a percentage chance to roll on an Epic Loot table for special encounters.

## Installation

1. Inside Foundry VTT, use the following manifest URL:
   ```
   https://github.com/Drowbe/coffee-pub-curator/releases/latest/download/module.json
   ```
2. Enable the module in your game world's module settings.

## Configuration

### Required Modules
- [Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith): Provides the core API, shared functionality, and settings menus required by Curator.

### Recommended Modules
- [Item Piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles): Strongly recommended (and practically required) if you intend to use the "Convert Dead to Loot" functionality.

## Support

If you encounter any issues or have suggestions, please file them in the [Issues](https://github.com/Drowbe/coffee-pub-curator/issues) section of the repository.

## License

This work is licensed under the included LICENSE file.

## Credits

Part of the Coffee Pub module collection.