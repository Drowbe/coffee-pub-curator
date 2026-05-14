# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
