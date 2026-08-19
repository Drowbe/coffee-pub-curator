# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [13.3.3]

### Fixed
- **A failed control bind could loot everything, or the wrong character** (`scripts/window-loot.js`). Blacksmith's `getValue()`, `getKeep()`, `getSelection()` and `getSelectedIds()` all report the value the control was *created with* when `attach()` did not find its input — a plausible answer the caller cannot tell from a real one. Both of Curator's uses were exposed, and which shape the failure takes is decided by our own config rather than by anything visible at the call site:

  - The **quantity split** is created with `value: max`, so an unbound read returns *max*. "Take 1 of 20" would have taken all 20, silently.
  - The **actor picker** seeds the current recipient, so switching to somebody else would have handed back the one you started on.

  The careful version — seeding a sensible default — is the one that produces the dangerous failure, which is backwards and worth saying out loud. Both now read the slider position and the ticked boxes out of the dialog, which is correct either way because only *binding* can fail.

  The comment on the quantity read said *"getValue() is integer-clamped and DOM-independent"*. That was taken from `api-quantity-split.md`, which actively recommended it on exactly those grounds; Blacksmith has since corrected the doc. Worth recording that the documentation did not merely fail to prevent this, it caused it.

  Now reads through Blacksmith's `readFrom(root)` and `readIdsFrom(root)`, which shipped in `703ffc7a`. The interim DOM reads were **replaced** rather than kept alongside them — a defensive read left beside a correct one is how the next person concludes the correct one cannot be trusted.

## [13.3.2]

### Changed
- **The dialog control workaround is gone** (`scripts/window-loot.js`): `blacksmith.dialog.wait()` now takes
  a `controls` option and binds anything exposing `attach(root)` after every render, so the quantity split
  and the actor picker hand the control over and stop there. Curator carried a frame-polling workaround that
  waited for the input to appear in the document and attached it by hand — along with a fallback that read
  raw form values whenever that failed.

  Worth recording *why* it existed, because the cause was not a missing feature. Blacksmith's documentation
  said passing an `HTMLElement` as `content` preserved its identity and listeners. It does not: DialogV2
  reads `options.content.innerHTML`, keeps the string, and builds the dialog by assigning `innerHTML` to a
  fresh form, so the node handed over is never inserted and any control attached to it is bound to an
  orphan. Curator and Merchant independently wrote the same workaround against a claim neither checked.
  `dialog.wait()` also had an `onRender(element, dialog)` hook the whole time, simply undocumented.

  The fallback going away is the real improvement. It silently produced a *plausible* answer — an entity
  list's initial selection rather than the user's choice — which is the failure mode that does not look like
  one.
- **The token interaction claim no longer restates Blacksmith's rules** (`scripts/manager-loot.js`): the
  comments explaining that `matches` must be synchronous and stable, and why `bypassPermission` is needed,
  are in `api-tokens.md` and were duplicated at the call site. A doc copied into a call site drifts exactly
  like code copied into one.

## [13.3.1]

### Changed
- **Loot announcement migrated to Blacksmith's chat cards API** (`scripts/token-image-utilities.js`): the card was hand-rendered HTML from a local Handlebars template reusing Blacksmith's card classes. It now composes parts — `header`, `prose`, `rows` — and Blacksmith renders and posts it, so Curator writes no card markup. The composition is stored on the message alongside the baked HTML, which means improvements to a part reach cards that have already been posted. `coffeepub-hide-header` is gone from the call site because the card renderer emits that marker itself.
- **The token name is passed as an inert literal** (`scripts/token-image-utilities.js`): token names are renamable in play and so are untrusted input. Both the sentence and the row label now pass the name as `{ literal }`, which is escaped and neither read for marks nor enriched — a token renamed `Bugbear *Chief*` shows its asterisks instead of italicising the rest of the sentence, and one containing `@UUID[...]` or `[[/r 99d6]]` is no longer obeyed by the enricher. The sentence carries `mark: 'strong'` so the name is emphasised and inert at once, rather than interpolated inside `**` where an asterisk in the name would interleave the tags.
- **The card shows the actor portrait and opens the loot window** (`scripts/token-image-utilities.js`, `scripts/manager-loot.js`): the announcement now carries a row for the body. It shows the actor's portrait rather than the token image, and the row itself is the click target — supplying a `uuid` would have built a document link to the Token, which opens the actor sheet rather than the body. Clicking it runs the same `LootManager.open` path as double-clicking the corpse, so proximity and combat are gated and reported identically. The handler is registered on every client in `LootManager.initialize`, beside the double-click claim, because a chat message is data and a handler cannot travel with the card.
- **A stale corpse row now explains itself** (`scripts/manager-loot.js`): the double-click gesture is gated by a `matches` predicate, but a card sits in the log permanently and outlives the body it announces. Clicking a row whose token has been deleted, or whose corpse has been emptied with no ledger to show, previously would have done nothing at all; it now reports that the body is gone or that there is nothing left to take.

### Fixed
- **The loot card ignored the world's card theme** (`templates/card-loot.hbs`): the template hardcoded `theme-default`, pinning the announcement to the Tan theme while every other Coffee Pub card followed the world's **Default Card Theme** setting. The composition omits `theme`, so the card now resolves the world default at post time like the rest of the suite.

### Removed
- **`templates/card-loot.hbs`**: replaced by the parts composition described above. The template was never registered for preloading and nothing else referenced it. Its `curator-loot-card` class went with it — the class had no rules in any Curator stylesheet or anywhere else, and had been inert since it was written, so no styling was lost. Its comment claiming "There is no styling API for chat cards" is retired with the file; the parts system is that API. `templates/partial-loot-row.hbs` is untouched — that is loot window UI and unrelated.

## [13.3.0] - 2026-08-08

### Added
- **Native corpse looting** (`scripts/manager-loot.js`, `scripts/window-loot.js`, `scripts/loot-inventory.js`, `templates/window-loot.hbs`, `templates/partial-loot-row.hbs`, `styles/window-loot.css`): a dead NPC prepared by Curator can now be looted directly. Double-click the body and a loot window opens listing its physical items and coin. Take a whole row or part of a stack, give an item to another party member, send items or coin to the party inventory, split coin evenly across the party, take everything at once, or bury the body. Every mutation runs through `blacksmith.inventory` on the authoritative GM; Curator owns no item-transfer code of its own.
- **Double-click interaction on lootable bodies** (`scripts/manager-loot.js`): registered through Blacksmith's `api.tokens.registerInteraction` with `gesture: 'clickLeft2'`. Foundry emits no token double-click hook, and its permission predicate runs before the handler, so a player without LIMITED permission on the corpse Actor could never reach it — Blacksmith relaxes that predicate for a matching claim only. Non-corpse tokens are untouched.
- **Looting section in settings** (`scripts/settings.js`, `lang/en.json`): **GM Approves Burying a Full Body**, **Bury Emptied Bodies**, **Loot Proximity** (0–60 ft, 0 disables), **Allow Looting in Combat**, **Enable Send to Party**, and **Enable Give to Player**. Every setting that hides a control is also re-checked on the GM, so hiding a button is not the security boundary.
- **Convert After Combat** (`scripts/settings.js`, `scripts/token-image-utilities.js`): holds loot conversion until the encounter ends, for GMs who do not want bodies becoming lootable mid-fight. A held body carries the marker on its Token document rather than in memory, so reloading the browser mid-combat does not strand it, and a creature revived before combat ends is never converted.
- **"Looted by" record** (`scripts/manager-loot.js`): a fully-taken row stays in the list, struck through and labelled with the character that took it, in its original position. The record lives on the Token document, so every client sees the same thing and a window opened afterwards still shows the full history. A picked-clean body stops being lootable but still opens as a record of who took what.
- **Live looter presence** (`scripts/manager-loot.js`, `scripts/window-loot.js`): anyone else with the same body open appears as portraits beside "Looting as", so it is obvious when two people are working the same corpse.
- **GM inline quantity editing** (`scripts/window-loot.js`): a GM can double-click any quantity in the loot window to change it — Enter commits, Escape reverts, clicking away commits. Setting zero removes the item after a confirmation. A packed container has no editable quantity and shows a remove control instead, which hands off to dnd5e's own container delete dialog so the system owns the "delete contents too?" question and the recursion.
- **`documentation/architecture/architecture-loot.md`**: describes the implemented system — state model, lifecycle, authorization, transfers, the ledger, presence, and known limitations.
- **`documentation/testing/testing-loot.md`**: the verification checklist the feature was signed off against.

### Changed
- **Item Piles is no longer required or used** (`scripts/token-image-utilities.js`, `scripts/settings.js`, `lang/en.json`, `README.md`): Curator converted dead tokens into Item Piles to make them lootable. All of it is gone — availability checks, `flags.item-piles` writes, `turnTokensIntoItemPiles` and `revertTokensFromItemPiles` calls, and the user-facing dependency warnings. Corpse looting is now Curator's own, and Item Piles is not a recommendation, a soft dependency, or a fallback. Bodies converted by earlier versions remain Item Piles and are not rewritten; newly prepared bodies use Curator's state.
- **Loot generation writes through Blacksmith** (`scripts/loot-utilities.js`): `_rollLootTable` accumulates every result across every roll and makes a single `grantItems` call, so duplicate drops coalesce into one stack instead of a row each, and the whole roll costs at most two writes. `_addRandomCoins` uses `grantCurrency` with deltas, retiring a read-then-write on `system.currency` that raced any concurrent change.
- **Loot generation now happens once per token, ever** (`scripts/manager-loot.js`, `scripts/token-image-utilities.js`): a creature that dies, is revived, and dies again offers whatever is left rather than a fresh set of possessions. Combat healing makes a creature dying twice ordinary, and regenerating loot each time would make kill-loot-heal-kill an infinite source. A re-death announces nothing in chat, because nothing new dropped.
- **`module.json` declares `"socket": true`**: Curator emitted on `module.coffee-pub-curator` for the image-sharing popout, but Foundry requires the manifest flag for that namespace, so those emits were being silently dropped. Loot uses the same channel. **This requires a world restart, not a browser refresh** — Foundry reads module manifests at world launch.

### Fixed
- **Image replacement could write to a deleted token** (`scripts/token-image-replacement.js`, `scripts/document-liveness.js`): `_onTokenCreated` settles for 100ms and runs a matching pass before it writes, and a token created and deleted inside that window left every later write aimed at a document that no longer existed, surfacing as an uncaught `undefined id [...] does not exist in the EmbeddedCollection`. The portrait flag write was the one write on that path with no try/catch, which is why it escaped rather than being logged. All writes now re-check after each await, not once on entry — and because an unlinked token's Actor is synthetic and dies with its token, checking the Actor alone never caught it. Reported by Blacksmith, whose test harness creates and deletes tokens fast enough to expose it.
- **Three more instances of the same race** (`scripts/token-image-utilities.js`, `scripts/manager-loot.js`): the delayed loot conversion re-found its token after the timer and then wrote the loot image using the reference captured *before* the delay; `_convertTokenToLoot` marked a body ready after generation had awaited; and bury deleted a token after a GM approval dialog that stays open as long as the GM leaves it.
- **Forked copies of two Blacksmith components deleted** (`scripts/ui-context-menu.js`, `scripts/manager-hooks.js`): both were copies taken before upstream fixes and could never pick up later ones. The context menu was missing four fixes — dismissal bound in the bubble phase (any consumer calling `stopPropagation` trapped the menu open), Escape closing the window instead of the menu, a 150ms arming delay that swallowed genuine outside clicks, and no height cap so a long menu ran off screen unreachable. The hook manager was missing the `renderChatMessage` → `renderChatMessageHTML` remap, general `pre*` cancellation (only `preUpdateToken` worked), and context on the callback record, which meant every Curator hook reported as context "default" in Blacksmith's hook statistics. Both are now thin accessors that forward to the shared implementation.


## [13.2.3] - 2026-08-03

### Added
- **Blacksmith Toast notifications** (`scripts/notifications.js`): added a shared notification wrapper around `api.toast.show()` with consistent informational, warning, and error presentation. Curator's user-facing notifications now use Blacksmith Toasts instead of Foundry's `ui.notifications`; diagnostic messages remain console-only.

### Changed
- **Loot tables are now compendium-only and portable between worlds** (`scripts/settings.js`, `scripts/loot-utilities.js`): General Loot, Adventuring Supplies, Treasure, and Epic Loot selectors enumerate the RollTables in every installed RollTable compendium via `api.compendiums.getAllPacks('RollTable')`, including packs outside the GM's curated search mapping. Selections store stable compendium document UUIDs and load them with `fromUuid()`. Loose world RollTables are no longer offered or resolved.
- **Loot settings reorganized for clarity** (`scripts/settings.js`, `lang/en.json`): the former **Treasure and Loot** block is now **Coins**, followed by separate **General Loot**, **Adventuring Supplies**, **Treasure**, and **Epic Loot** sections. Each selector is explicitly labelled as a **Compendium Table** so its source and portability are clear.

## [13.2.2]

### Changed
- **Menubar consolidated behind a single "Curator" button** (`scripts/curator.js`): Curator claimed three slots on the Blacksmith main menubar (Replace Token, Replace Portrait, Place Image). It now registers one toggleable **Curator** tool in the `utility` group that opens a Curator secondary bar, and the tools live on that bar as secondary bar items — **Replace Token**, **Replace Canvas Tokens**, **Replace Portrait**, **Replace Canvas Portraits** in a `replace` group and **Place Image** in a `place` group, so a divider separates them. The bar takes the house default size and `persistence: 'manual'` (stays open until dismissed), and `registerSecondaryBarTool` syncs the main button's active state when the bar opens, closes, or is displaced by another module's bar.
- **Right-click context menus on the menubar tools removed** (`scripts/curator.js`): the menus offered two rows each, and the "Open Replace *X* Images" / "Open Tile Image Browser" rows called exactly what left-clicking the button already called — the only non-redundant action was the batch canvas update. That action is now a first-class button on the secondary bar (**Replace Canvas Tokens** / **Replace Canvas Portraits**, both calling `runUpdateCanvas`), so the whole `contextmenu` listener and its `uiContextMenu` dependency are gone. Nothing is now hidden behind a right-click. Verify live: as GM, confirm one Curator button on the menubar, that clicking it toggles a bar with the five labelled buttons, that the two Replace buttons open their windows, and that the two Replace Canvas buttons batch-update canvas tokens without opening a window (and warn as before when the canvas is empty or the feature is disabled in settings).
- **Combat bar context menu now offers Replace Token and Replace Portrait separately** (`scripts/curator.js`): `getCombatContextMenuItems` returned a single "Replace Image" row that opened the replacement window in whatever mode it was last left in (`tokenImageReplacementLastMode`), so which library you got depended on history rather than on what you clicked. It now returns two rows that open the window explicitly in `ImageCacheManager.MODES.TOKEN` and `MODES.PORTRAIT`. Both still select the combatant's token first, since the window resolves its target from the current selection. Blacksmith places these rows wherever it likes — as of its next release, inside a "Character" submenu on the combat bar portrait menu — and does not depend on the count or the labels. Verify live: right-click a combat bar portrait as GM and confirm both rows appear, that each opens the replacement window in its own mode regardless of which was used last, and that both target the right-clicked combatant.

## [13.2.1]

### Fixed
- **Tag button intermittently dead**: Clicking the tag (filter) button next to the search box in the Token/Portrait and Tile windows sometimes did nothing. Root cause: the tag container div was only rendered by the template when tags existed at render time — if the window rendered while the image cache was still loading (or during a search / empty state), the container never entered the DOM, and no later code path could create it, so tags could never appear for the life of that window. The container is now always rendered (hidden when empty or when tag mode is Hidden) and is populated dynamically as results update. The Tile window also now refreshes its tag row on every results update, matching the Token window.

## [13.2.0] - 2026-07-12

Performance and reliability overhaul of the image cache scanning and the Token/Portrait/Tile browser windows. Large libraries (10k+ images) now open quickly, stay responsive, and scan without freezing or crashing the client.

### Performance
- **Image Replacement window opens fast**: Opening the Token/Portrait window with a selected token dropped from ~8–10s to near-instant on large libraries. Root cause was `_getCategories()`, called on every render, which rescanned all cached files **once per category button** (O(categories × files), worse for root files) — work that was identical regardless of the active tab, which is why even the small SELECTED tab was slow. Category counts are now precomputed in a single pass at cache build/load time (`ImageCacheManager._buildIndexes`) and stored on the cache, then read directly by the window.
- **Faster token/search matching in the window**: The relevance scoring loop re-extracted the token's data (iterating all the actor's items) and re-read the deprioritized-words setting for **every** cached file. Both are now computed once per search and passed into the scorer, cutting the bulk of the ALL-tab scoring cost when a token is selected.
- **Bounded memory while scrolling results**: Thumbnails now use `content-visibility` + `decoding="async"`, and an `IntersectionObserver` unloads off-screen images (restoring them on approach). Memory stays roughly flat regardless of how far you scroll instead of growing until the tab struggles.
- **Memoized per-render work**: `_getAggregatedTags()`, category counts, and per-file category derivation are memoized (keyed by the filter/library/cache state) across the Token, Portrait, and Tile windows, so repeated renders and tab switches no longer re-sweep the whole cache. The Tile window (`TileImageWindow`) received the same treatment as its own class.
- **Parallel, capped directory scanning**: Folder browsing now walks sibling directories concurrently (previously strictly one-at-a-time) via a batched producer/consumer, with a global semaphore capping concurrent `FilePicker.browse()` calls (`SCAN_CONCURRENCY`, default 6) so deep/wide trees never flood the backend. Scan time is dominated by the number of folder round-trips, so this is a several-fold speedup on large or deeply nested libraries.
- **Single round-trip per folder**: The working "source" (`data` / `public` / `core`) for a library is now resolved once from its root and reused for every subfolder, instead of re-probing sources per folder. Libraries whose paths don't match the built-in prefix heuristic no longer pay 2–3× browse round-trips, and confirmed-empty folders stop probing every source.

### Fixed
- **Client crash / 30-minute scans on large libraries**: The image cache is stored in a world-scoped setting, and the scan re-serialized the entire (growing) cache, wrote it to the world database, and broadcast the multi-MB payload over the socket **every 5 subdirectories and every 500 files** — 100+ times per large scan, each larger than the last. This O(n²) write amplification plus socket flooding caused the extreme scan times and browser crashes. Incremental crash-resilience saves are now time-throttled (at most once per 30s); the authoritative save still happens once at scan completion.
- **Stall while saving the cache at end of scan**: `_generateFolderFingerprint` recursively re-walked the entire folder tree from scratch at final-save time — a redundant second full scan (hence its 30s timeout). The fingerprint is now computed from the already-scanned cache with no filesystem I/O, so the final save is effectively instant.
- **`setInterval` handler violations during tile scan**: The Tile "Place Image" window's 400ms scan-progress poller did a full re-render, and its `getData()` swept the whole growing cache to build categories and tags on every poll — blocking the main thread (hundreds of `[Violation] 'setInterval' handler took Nms`). That work is now skipped while scanning (it's hidden behind the progress overlay).
- **Peak memory during scan**: Directory results are now committed to the cache in bounded batches rather than collecting the entire library in memory before committing.

### Changed
- Removed the per-folder `console.log` browse tracing that flooded the console during scans (hundreds of lines per scan). Structured debug logging is unchanged.

## [13.1.4] - 2026-05-20

### Added
- **Copy To Location** — right-click any image in the Token, Portrait, or Tile windows and choose **Copy → Copy To Location...** to copy the file into any folder with a new name. A `DialogV2` form pre-fills the current filename and folder; the Browse button opens Foundry's folder picker so you can navigate to any destination without typing a path. Uses `FilePicker.upload` to write the file server-side, making it easy to bring existing tokens and images into a campaign library without leaving the client.

## [13.1.3] - 2026-05-19

### Added
- **Pin tags from image metadata**: When a pin is placed, the image's `primaryTags` and `secondaryTags` from the tile cache are automatically applied as pin tags. Tags appear in Blacksmith's pin manager and can be used for filtering and visibility profiles.

### Changed
- **Pin type renamed**: `placed-image` → `curator-image`. Registered with Blacksmith as `"Curator Image"`. Existing pins with the old type remain in scene flags unchanged.
- **Pin visibility model updated for Blacksmith schema v7**: Pin creation now sets `config.blacksmithAccess: 'gm'` (only the GM can edit/move/delete placed pins) and `config.blacksmithVisibility: 'visible' | 'hidden'` alongside `ownership`, matching the decoupled access + visibility model introduced in Blacksmith schema v7. The Visible toggle still controls both the ownership level (OBSERVER vs NONE) and the new visibility field.
- **Menubar button renamed**: "Place Tile" → **"Place Image"** to reflect that the window places both tiles and pins.

### Fixed
- **Foreground tile placement**: Foreground tiles now correctly render above tokens on the Foundry v13 canvas. Root cause: v13 determines layer by `elevation >= scene.foregroundElevation`, not `overhead` alone. Added `elevation: canvas.scene.foregroundElevation ?? 20` when foreground mode is on. `overhead: true` is kept to enable the occlusion/fade system.
- **Pins not appearing after placement**: When the Blacksmith layer was never activated in the current session, `PinRenderer.getContainer()` returned null and `create()` silently skipped rendering. Fixed by calling `await pinsAPI.reload()` after `create()`, which initializes the layer container if needed.

## [13.1.2] - 2026-05-13

### Added
- **Tile window — param bar**: Placement parameters (Asset Grid Size, Rotation, Opacity, Tint for tile mode; Pin Size, Shape, Border, Image Fit, Zoom for pin mode) moved from the option bar into a dedicated secondary toolbar row between the header and the search area. The option bar now contains only the Tile/Pin toggle and the Reset Options button.
- **Tile window — Visible and Drop Shadow to header**: In pin mode, the Visible and Drop Shadow toggles moved into the header controls area, consistent with the tile-mode toggles (Foreground, Locked, Hidden, Drop Shadow).
- **Pin mode — Image Fit options**: All six Foundry image-fit values now available in the dropdown — Cover, Contain, Fill, Actual Size, Scale Down, Zoom. Selecting Zoom reveals an inline **Zoom** slider (100–200%) that passes `imageZoom` to the Pins API.
- **Pin double-click — image viewer**: Double-clicking a placed-image pin on the canvas opens the Foundry `ImagePopout` with the pin's image. GMs also broadcast the image to all connected players via socket. Registered at module `ready` for all users via `pins.on('doubleClick', …, { moduleId })` so it works whether or not the tile window is open. Cleaned up via `Hooks.once('unloadModule', …)`.
- **Pin type registration moved to module ready**: `pins.registerPinType(MODULE.ID, 'placed-image', 'Placed Image')` now called at module `ready` for all clients, not inside the GM-only `openWindow()`.

### Changed
- **Menubar button renamed**: "Place Tile" → **"Place Image"** to reflect that the window places both tiles and pins.
- **Foreground tile placement fixed**: Foreground tiles now correctly render above tokens. Root cause: Foundry v13 determines foreground vs background by `elevation >= scene.foregroundElevation`, not by `overhead` alone. Added `elevation: canvas.scene.foregroundElevation ?? 20` to the tile creation data when foreground mode is on. `overhead: true` is still set (enables the occlusion/fade system); `elevation` is the v13 gate that actually routes the tile to the overhead layer.
- **Tile/Pin defaults — auto-save**: All placement parameters are now saved to their world settings immediately on change. There is no longer a "Set as Default" button. The **Reset Options** button (right side of the option bar) resets all options for the current mode to factory defaults: tile (Asset Grid Size 100, Rotation 0°, Opacity 100%, Tint #ffffff, Foreground off, Locked off, Hidden off, Drop Shadow on); pin (Pin Size 200, Shape Square, Border #ffffff width 10, Image Fit Cover, Zoom 1.0, Visible on, Drop Shadow on).
- **Tile default Drop Shadow**: Default changed from `false` to `true`. Pin defaults updated to match reset values: size 200, imageFit `cover`, dropShadow `true`.

### Fixed
- **Library filter empty after refresh**: `_compressFileData` did not save `metadata.sourcePath` in the compressed cache format (`m` object). After a page reload, `sourcePath` was missing on all entries, so any library chip click filtered to 0 results. Fixed by adding `sp` to the compressed metadata and restoring it in `_loadCacheFromStorage`. A one-time rescan is needed to rebuild the cache with the new format.
- **Category chips not updating on library click**: Clicking a library chip called `_findMatches()` / `_updateResults()`, which only refreshes the image grid. The category chips are Handlebars-rendered and never reflected the selected library. Fixed by calling `render(false)` after `_findMatches()` in `_onLibraryClick`, which re-runs `_getCategories()` scoped to the selected library.
- **Pin select dropdowns triggering sort re-render**: The `onChange` delegation handler matched `.blacksmith-select` which caught the pin Shape and Image Fit selects (both use that class), incorrectly calling `_onSortOrderChange` and setting `sortOrder` to e.g. `'square'`. Fixed by changing the sort match to `[name="sortOrder"]`.

## [13.1.1] - 2026-05-13

### Added
- **Pin Mode — Tile window**: A **Tile / Pin** toggle in the option bar switches the placement engine from Foundry tiles to Blacksmith Pins. The toggle is disabled (greyed out) when the Blacksmith Pin API is not available. In Pin Mode:
  - **Image Fit** (Contain / Cover) — controls how the image fills the pin bounds. Contain preserves aspect ratio; Cover crops to fill.
  - **Players See** toggle — sets pin ownership to `OBSERVER` (players see the pin) or `NONE` (GM-only).
  - **Drop Shadow** toggle — uses the Pin API's native `dropShadow` flag; no TMFX dependency.
  - Tile-specific controls (Rotation, Opacity, Tint, Locked, Hidden, TMFX Drop Shadow) are hidden in Pin Mode.
  - Header icon changes to `fa-map-pin`, subtitle and action bar button label update accordingly.
  - **Set as Default** saves pin defaults (Image Fit, Visibility, Drop Shadow) separately from tile defaults; Asset Grid Size is shared.
  - Placement uses `pins.create({ shape: 'none', imageFit, size, dropShadow, ownership }, { sceneId })` — single call, no separate `place()` step needed.
  - Switching mode while in placement mode cancels the active placement cleanly.
- **Tile Image Placement window** (`TileImageWindow`): New browser window for placing map/environment tiles directly onto the canvas from a scanned image library. Accessible from the CoffeePub toolbar (`fa-map` icon).
  - Full image scanning and tagging pipeline via `ImageCacheManager.MODES.TILE`, sharing the same caching infrastructure as Token and Portrait modes.
  - **Asset Grid Size** — replaces fixed Width/Height. Tiles auto-scale so source artwork grid squares map to the scene's grid size: `placed = natural × (sceneGrid ÷ assetGridSize)`. Aspect ratio always preserved. Image natural dimensions are resolved via `foundry.canvas.loadTexture()` at selection time.
  - **Rotation** slider (Blacksmith `.blacksmith-slider` widget, 0–359°). Value shown inline in the label.
  - **Opacity** slider (Blacksmith `.blacksmith-slider` widget, 10–100%). Value shown inline in the label.
  - **Tint** — hex text input + color swatch pair, matching Blacksmith's pin-config color row pattern. White (`#ffffff`) = no tint.
  - **Locked** and **Hidden** toggles in the header.
  - **Drop Shadow** toggle (only visible when Token Magic FX is active). Applies `TokenMagic.addUpdateFilters` 150 ms after tile creation so the canvas placeable is guaranteed to exist.
  - **Set as Default** button saves current Asset Grid Size, Rotation, Opacity, Locked, and Hidden to world settings.
  - Click-to-place workflow: clicking a thumbnail enters placement mode (crosshair cursor, header banner, ESC to cancel); clicking the canvas places the tile centered on the click point.
  - Computed placed-size readout (`— × —` → `800 × 600 px`) updates live as Asset Grid Size changes and refreshes when an image is selected.
  - Card thumbnails match the Token/Portrait window style: hover overlay shows **Place Tile** with crosshairs icon, Browse score bar, tag pills, favorite heart badge.
  - Right-click context menu: Add/Remove Favorites, Place on Canvas, View Full Size and Share, Copy (path / filename / HTML / Markdown), Open in New Tab.
  - Post-scan auto-loads All tab with results.
- **Library selector — all three windows**: A row of chip buttons (one per configured folder path) appears above the category filter row whenever 2+ paths are configured. Clicking a chip narrows all results, category counts, and tag aggregation to that library. Clicking again (or clicking "All Libraries") resets to full view. Switching modes in the Token/Portrait window resets the selection.
- **Named libraries**: Each configured folder path (token, portrait, and tile) now has a companion **Library N Label (Optional)** setting. The chip shows the custom label when set, falling back to the last path segment. Path and label settings are displayed interleaved in the settings UI (Library 1 Path → Library 1 Label, Library 2 Path → Library 2 Label, …) and display names update automatically on each reload. New exported helpers `getTokenLibraries()`, `getPortraitLibraries()`, `getTileLibraries()` return `[{path, label}]` arrays used by all three windows.
- **Foundry Core Data scanning**: Image scanning now works for paths pointing to Foundry's bundled core assets (e.g. `icons`, `icons/creatures`) in addition to user-data paths. `ImageCacheManager._browseDirectory()` auto-detects the correct `FilePicker` source — `'data'` for paths starting with `modules/`, `worlds/`, `systems/`, etc.; `'public'` / `'core'` for everything else — with ordered fallback across all three sources so both library types work transparently.
- **Drop Shadow — Token window**: Drop Shadow toggle added to the Token window header (hidden in Portrait mode and when Token Magic FX is inactive). Persists as world setting `tokenDropShadow`. Applied on token drop, manual image apply, and Update Canvas. All TMFX shadow logic centralised in `_tmfxShadowParams()` / `_applyDropShadowToPlaceables()` static helpers.
- **Drop Shadow — Tile window**: Persists as world setting `tileDropShadow`, restored on window open.

### Changed
- **Path settings renamed**: All folder path settings across token, portrait, and tile modes renamed from "Folder N" → **"Library N Path"** and "Folder N Label" → **"Library N Label (Optional)"**. Hint text removed. Settings are reordered on each load so path and label for the same library appear together.
- **Tile window right-click menu expanded**: Now matches the Token/Portrait window — added **Copy** submenu (Copy Image Path, Copy Filename, Copy as HTML img, Copy as Markdown) and **Open in New Tab** after View Full Size and Share.
- **Library chip CSS consolidated**: `.tiw-library-row` / `.tiw-library-chip` renamed to `.tir-library-row` / `.tir-library-chip` and moved from `window-tile-image.css` into `window-token-replacement.css`, following the established pattern where all shared chrome lives in the token CSS file.
- **Tile option bar**: Elevation field removed. Rotation and Opacity values shown inline in their labels. Fuzzy Search toggle removed (no token scoring in tile mode makes it meaningless). Sort dropdown now has only A→Z and Z→A (Relevance removed for same reason); default changed to A→Z.
- **Tile categories**: Now derived from the first-level subfolder of each file's path relative to the configured tile base path, rather than from filename-extracted tags. Categories are sorted alphabetically and match the actual folder structure (e.g. `doors`, `flora`, `storage`).
- **Tile sliders**: Replaced the hand-rolled `.tir-rangeslider` custom widget with Blacksmith's `.blacksmith-slider` — a native `<input type="range">` with CSS pseudo-element styling. No JS-driven fill/thumb, no clipping at 0%/100%.
- **Tint color picker**: Replaced bare `<input type="color">` with a Blacksmith-style paired hex text input + color swatch, synced live in both directions via `input`/`change` events.

### Fixed
- **`_buildLibraryList` rename** (was `_getLibraries`): `TokenImageReplacementWindow._getLibraries` conflicted with a name in the `ApplicationV2` prototype chain, causing `TypeError: this._getLibraries is not a function` on every window open. Renamed to `_buildLibraryList` in both windows. `TileImageWindow` was unaffected but renamed for consistency.
- **Post-scan grid empty** (Token and Portrait windows): `render(true)` after `_findMatches()` re-rendered the HBS template and cleared the grid. Fixed by calling `_updateResults()` inside the `requestAnimationFrame` callback of the `render()` override so the grid is repopulated after every template re-render.
- **Tile placement dimensions wrong**: Two compounding bugs — (1) DOM inputs re-read in `_completePlacement` after `render(false)` inside `_enterPlacementMode` reset them to saved defaults; fixed by snapshotting all params into `_pendingPlacement` via `_snapshotParams()` before any re-render. (2) `_completePlacement` destructured `this._pendingPlacement` after `_exitPlacementMode()` nulled it; fixed by capturing the full destructure first.
- **`_resolveImageDims` unreliable**: `img.naturalWidth` on lazy-loaded thumbnails returned 0. Replaced with `foundry.canvas.loadTexture()` (PIXI cache, always correct) with DOM `naturalWidth` as fallback.
- **`loadTexture` deprecation**: Updated all calls to `foundry.canvas.loadTexture` (v13 namespace).
- **TMFX drop shadow not applying**: `tileDoc.setFlag()` set the flag before the canvas placeable existed. Replaced with `TokenMagic.addUpdateFilters(tileDoc.object, params)` inside a 150 ms `setTimeout`. Added `window.TokenMagic` guard alongside `game.modules.get('tokenmagic')?.active` in both tile and token windows.
- **Document event listener leak**: Both windows reset `_delegationAttached = false` on `close()` but never removed the anonymous arrow functions from `document`, causing a new set of listeners to accumulate on every open/close cycle. Fixed by storing listeners as named functions in a static `_listeners` object so `close()` can call `removeEventListener` with exact references.
- **Tile favorites broken**: Right-click "Add to Favorites" did nothing — cache lookup used `imageName` as key but cache is keyed by `relativePath/filename`; `_toggleFavorite` ignored the passed `fileInfo` and re-fetched from cache (always null); metadata structure not initialized before mutation. Fixed by scanning `cache.files` values by `fullPath` match, calling `_ensureTagMetadata`, then mutating the live reference directly.
- **Tile "All" tab not active on load**: Template used `{{#unless currentFilter}}active{{/unless}}` but `currentFilter` is initialized to `'all'` (truthy). Changed to `{{#if (eq currentFilter "all")}}active{{/if}}`.
- **Token/Portrait window closes after applying image**: `_applyImageToToken` called `this.close()` after a successful apply. Removed so the window stays open for continued browsing.
- **ESC did not cancel tile placement**: The `keydown` listener was on the bubble phase so Foundry's own close-window ESC handler fired first. Changed to capture phase with `e.stopPropagation()` so placement is cancelled and the window stays open.
- **Tile placement cursor preview**: When a thumbnail is clicked to enter placement mode, a floating tooltip follows the cursor showing a preview of the selected image, filename, and "Click to place · Esc to cancel". Uses `canvas.stage.on('mousemove')` (PIXI stage). Cleaned up automatically on placement or cancel.


## [13.1.0] - 2026-05-11

### Changed
- **ApplicationV2 migration**: `TokenImageReplacementWindow` migrated from deprecated Foundry v1 `Application` to `BlacksmithWindowBaseV2` (`HandlebarsApplicationMixin(ApplicationV2)`). Provides proper position persistence via localStorage, scroll save/restore, and document-level event delegation.
- **Action bar**: Delete Cache, Scan Images, and Update Canvas buttons moved from the mid-window header row to a dedicated action bar at the bottom of the window using Blacksmith's `blacksmith-window-template-*` classes. Left side: Scan Images → Delete Cache. Right side: Update Canvas (primary).
- **Sort dropdown**: Moved from above the image grid to the right of the search row; now uses `blacksmith-select` styling instead of a custom class.
- **Result count**: Moved from the search row to the right of the "Matching Results" header, where it describes the grid rather than the search controls.
- **Search icon**: Migrated to Font Awesome 6 (`fa-solid fa-magnifying-glass` / `fa-solid fa-arrows-rotate fa-spin`) and moved inside the search container, matching the Blacksmith search-wrap pattern. Shows a spinning icon while searching, magnifying glass when idle.
- **Removed "Search Filters" titlebar**: The redundant header row (label + duplicate cache status) above the filter category row was removed; the cache status in the filter row is the only copy now.

### Fixed
- `event.currentTarget` was `document` in all delegated click handlers after the ApplicationV2 migration removed the old `_registerDomEvent` Proxy system. All handlers (`_onSelectImage`, `_onImageRightClick`, `_onCategoryFilterClick`, `_onTagClick`, `_onFilterToggle`, `_onSearchInput`, `_onScroll`, `_onSortOrderChange`) now resolve their target via `event.target.closest(selector)` or `event.target`.
- `_prepareContext` was calling `foundry.utils.mergeObject` on context data that contains live Foundry class instances (Token, Actor), causing `"One of original or other are not Objects!"` crashes on re-render. Fixed by returning `getData()` directly, bypassing the base class merge path.
- `this.selectedToken.document.texture` threw when `selectedToken` was an Actor (portrait mode) because actors have no `.document` wrapper. Fixed with optional chaining: `.document?.texture?.src`.
- Bullet separator characters (`•`) in the token subtitle rendered as `â€¢` mojibake. Replaced with `&bull;` HTML entities throughout the template.
- Smart/curly quotes introduced into string literals during the ApplicationV2 migration caused `SyntaxError: Invalid or unexpected token` on load. All curly quotes replaced with straight ASCII quotes.
- Clear search button lost its position after `.tir-search-container` was converted to a flex row (it had been `position: absolute`). Removed absolute positioning so it flows as a normal flex child at the right end of the container.

## [13.0.6] - 2026-05-11

### Added
- Right-click context menu on image tiles now includes **Add to Favorites** / **Remove from Favorites** as the first item for both token and portrait windows.
- New `ImageCacheManager._saveMetadataToStorage(mode)` — saves the cache after metadata changes (e.g. favorites) without regenerating the folder fingerprint, making favorites instant instead of blocking for 10–30 seconds.
- **View Full Size and Share** context menu item — opens Foundry's built-in image viewer for the GM and simultaneously broadcasts it to all connected players via module socket. Replaces the previous **View Full Size** item.

### Fixed
- **Convert to Loot** now shows a GM warning notification (in-game UI) when the setting is enabled but the Item Piles module is not active, instead of failing silently. A startup warning is also shown when the world loads.
- Favorites save/load cycle: `_saveCacheToStorage` was always called with `true` (wrong mode) instead of the current window mode, so portrait favorites were never saved to the portrait cache.
- `_loadCacheFromStorage` now correctly normalizes all three possible stored formats (abbreviated keys, decompressed full keys, legacy full keys) into a consistent in-memory object, so `filesByFileName` is always rebuilt on load.
- `_compressFileData` was reading `fileData.fileName`, `fileData.fileSize` (non-existent fields), causing `fn` and `fs` to be saved as `undefined`; corrected to `fileData.name` and `fileData.size`.
- `filesByFileName` index was not reset when `_loadCacheFromStorage` rebuilt `cache.files`, leaving stale scan-era keys that caused all post-reload cache lookups to return `null`.
- `filesByFileName` index was not reset during a full rescan (`clearCache = true` in `_processFiles`), causing stale entries from prior scans to accumulate and shadow new ones.
- `_cleanupInvalidPaths` now keeps `filesByFileName` in sync when entries are removed from `cache.files`.
- `_isInvalidFilePath` no longer incorrectly rejects valid user image paths (e.g. `tokens/`, `worlds/`) that don't start with `modules/`, `assets/`, or `data/`; now only rejects null, empty, literal `"undefined"`/`"null"`, wildcards, and path-traversal patterns.

### Performance
- Image scan time reduced from ~45 minutes to ~2 minutes for 12,000+ token images:
  - Removed a redundant `FilePicker.browse` call per file in `_processFileInfo` that fetched file stats and then immediately discarded them.
  - Removed artificial per-file delay (10 ms × 12,000+ files ≈ 2 min of pure sleep) from the scan loop.
  - Full scans now pass `skipDelays = true`, matching the existing incremental-scan fast path.
  - Per-subdirectory incremental saves reduced from every subdirectory to every 5th subdirectory.
- Removed live folder fingerprint comparison from `_loadCacheFromStorage`. Generating a fingerprint requires a full recursive `FilePicker` traverse (30+ seconds for large libraries), which was blocking the startup cache load and racing with window opens — causing the replacement window to open empty even with a token selected. The cache is now accepted as-is on load; `needsRescan` is still flagged when configured paths change.




## [13.0.5] - 2026-04-06

### Fixed
- Curator `ready` now awaits `BlacksmithAPI.waitForReady()` (when provided by Blacksmith) before registering with Blacksmith, registering settings, and calling `initializeCurator`, so `BlacksmithUtils` and other consumer globals are wired before use. Avoids `Cannot read properties of null (reading 'postConsoleAndNotification')` when Curator’s `ready` ran before Blacksmith finished `markReadyForConsumers()`.
- `HookManager.initialize()` guards the startup notification: if `globalThis.BlacksmithUtils` is not ready, logs to the console instead of throwing.

## [13.0.4] - 2026-03-14

### Changed
- Curator no longer owns or initializes Blacksmith's current-turn and targeted token indicator behavior. That feature now lives entirely in Blacksmith.

### Removed
- Removed the orphaned turn-indicator, targeted-indicator, and related token movement/visibility helper code from `scripts/token-image-utilities.js`.
- Removed the stale `targetedIndicatorEnabled` fallback reference from `scripts/manager-image-cache.js`.



## [13.0.3] - 2026-03-09

### Fixed
- Image Replacements window and cache status now show cache size (MB) for the active mode (Token vs Portrait) instead of always using the token cache. File count and age were already correct; size now uses the same mode-specific cache/setting.

## [13.0.2] - 2026-03-09

### Added
- Menubar tools split into **Replace Token** and **Replace Portrait**; each opens the replacement window in the corresponding mode.
- Right-click context menus on both menubar tools (Blacksmith Context Menu API): **Open Replace Token/Portrait Images** and **Replace Canvas Token/Portrait Images**.
- Static `TokenImageReplacementWindow.runUpdateCanvas(mode, modeLabel)` so canvas image updates can be run without opening the window (used by context menu and for future API).

### Changed
- Replacement window `openWindow(opts)` now accepts `opts.mode` ('token' or 'portrait'); existing window switches mode when opened with a different mode.
- Removed `api-helpers.js`; all code now calls `BlacksmithUtils` directly (`getSettingSafely`, `postConsoleAndNotification`, `playSound`). Blacksmith bridge import added in scripts that use the API.

## [13.0.1] - 2026-03-09

### Fixed
- Addressed issue where sound and roll table selection dropdowns were empty in settings by dynamically updating choices based on the new Blacksmith Constants API.

### Added
- Formally registered the module with the `BlacksmithModuleManager` to ensure seamless inter-module communication.

## [13.0.0] - 2026-03-03

### Added
- Initial extraction of Curator from Blacksmith.
- Token and portrait image replacement features.
- Dead token conversion mechanics.
- Loot token conversion, settings, and tables.
