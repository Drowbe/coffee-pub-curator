# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
