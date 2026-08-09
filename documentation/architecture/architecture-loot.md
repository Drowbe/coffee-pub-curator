# Loot Architecture

## Status

Phase 1 establishes Curator-owned corpse state and a read-only loot window. Item and currency mutation are intentionally absent until Blacksmith ships `api.inventory`.

## Ownership

Curator owns corpse preparation, interaction, presentation, permissions, and lifecycle policy. Blacksmith owns shared window infrastructure and will own low-level inventory mutation. Curator no longer converts or reverts dead tokens through Item Piles; loot generation remains in `loot-utilities.js`.

## Files

- `manager-loot.js` owns loot flags, state transitions, token interaction, and window invalidation.
- `window-loot.js` reads current token-Actor contents and renders the loot surface.
- `window-loot.hbs` contains the read-only item and currency presentation.
- `window-loot.css` contains Curator-specific layout rules.

## State

The Token document carries `flags.coffee-pub-curator.loot` with an enabled marker, state, preparation metadata, source Actor UUID, and generation ID.

Implemented states are:

- `preparing`: loot generation/conversion has begun.
- `ready`: the corpse may open in the loot window.
- `empty`: reserved for the later mutation phase.

The generation ID prevents a delayed completion from marking a newer corpse lifecycle ready. Revival clears the flag and closes the window associated with the Token UUID.

## Interaction

Curator does not wrap Foundry token methods and does not use libWrapper directly. Automatic corpse interaction is pending a public Blacksmith token-interaction API that can route double-clicks and allow interaction with matching tokens without changing Actor ownership. `LootManager.open(tokenDocument)` is the guarded Curator entry point the Blacksmith callback will invoke. The tool exposes a GM-only Open Sheet action for direct Actor-sheet access. The window resolves the Token document again by UUID and reads current Actor data for every render.

## Visible Contents

The read-only surface extends Blacksmith's ephemeral Tool window base and uses the Actor portrait (`actor.img`), not the token texture. It includes D&D 5e physical item types: weapon, equipment, consumable, tool, loot, and container. Nonphysical embedded Items are excluded. Container contents are rendered as ordinary rows; a container with contents is omitted, while an empty container remains visible. Nonzero `cp`, `sp`, `ep`, `gp`, and `pp` balances are displayed independently.

Take controls are disabled in Phase 1. They will call Blacksmith's authoritative `api.inventory` primitives through a Curator-owned GM socket handler once that API ships.
