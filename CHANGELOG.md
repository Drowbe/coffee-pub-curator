# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [13.0.6] - 2026-05-11

### Added
- Right-click context menu on image tiles now includes **Add to Favorites** / **Remove from Favorites** as the first item for both token and portrait windows.
- New `ImageCacheManager._saveMetadataToStorage(mode)` — saves the cache after metadata changes (e.g. favorites) without regenerating the folder fingerprint, making favorites instant instead of blocking for 10–30 seconds.

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
