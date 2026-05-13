// ==================================================================
// ===== TILE IMAGE PLACEMENT WINDOW ================================
// ==================================================================

import { MODULE } from './const.js';
import '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { BlacksmithWindowBaseV2 } from '/modules/coffee-pub-blacksmith/scripts/window-base.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { UIContextMenu } from './ui-context-menu.js';
import { getTileImagePaths } from './settings.js';

const TILE_MODE = ImageCacheManager.MODES.TILE;

export class TileImageWindow extends BlacksmithWindowBaseV2 {
    constructor(options = {}) {
        super(foundry.utils.mergeObject({}, options));
        this.matches = [];
        this.allMatches = [];
        this.currentPage = 0;
        this.resultsPerPage = 50;
        this.isLoadingMore = false;
        this.hasMoreResults = false;
        this.isSearching = false;
        this.sortOrder = 'atoz';
        this.currentFilter = 'all';
        this.searchTerm = '';
        this._cachedSearchTerms = null;
        this.selectedTags = new Set();
        this.tagSortMode = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileImageTagSortMode', 'count');
        this._searchResultCache = new Map();
        this._searchCacheMaxSize = 50;
        this._searchCacheTTL = 300000;
        this._trackedTimeouts = new Set();
        this._teardownExecuted = false;
        this._activeImageElements = new Set();

        this.tileTint = '#ffffff';
        this.dropShadow = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDropShadow', false);

        // Placement mode state
        this._pendingPlacement = null;
        this._placementCleanup = null;
        this._placementTooltip = null;
        this._placementTooltipMouseMove = null;
        this.isPlacementMode = false;
    }

    // ------------------------------------------------------------------
    // Static class properties (ApplicationV2)
    // ------------------------------------------------------------------

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            id: 'tile-image-window',
            classes: ['tile-image-window'],
            position: { width: 800, height: 620 },
            window: { title: 'Place Tile', resizable: true, minimizable: true },
            actions: {
                scanImages: TileImageWindow._actionScanImages,
                pauseCache: TileImageWindow._actionPauseCache,
                deleteCache: TileImageWindow._actionDeleteCache,
                cancelPlacement: TileImageWindow._actionCancelPlacement,
                clearSearch: TileImageWindow._actionClearSearch,
                filterToggle: TileImageWindow._actionFilterToggle,
                setDefaults: TileImageWindow._actionSetDefaults
            }
        }
    );

    static PARTS = {
        body: { template: 'modules/coffee-pub-curator/templates/window-tile-image.hbs' }
    };

    static ROOT_CLASS = 'tile-image-window';
    static _ref = null;
    static _delegationAttached = false;
    static _listeners = null;

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    async _prepareContext(options = {}) {
        return this.getData(options);
    }

    getData() {
        const cache = ImageCacheManager.getCache(TILE_MODE);
        const aggregatedTags = this._getAggregatedTags();
        return {
            appId: this.id,
            isScanning: cache.isScanning,
            overallProgress: cache.overallProgress,
            totalSteps: cache.totalSteps,
            overallProgressPercentage: cache.totalSteps > 0
                ? Math.round((cache.overallProgress / cache.totalSteps) * 100) : 0,
            currentFolderIndex: cache.currentFolderIndex || 0,
            totalFolders: cache.totalFolders || 0,
            showFolderInfo: (cache.totalFolders || 0) > 1,
            currentStepName: cache.currentStepName,
            currentStepProgress: cache.currentStepProgress,
            currentStepTotal: cache.currentStepTotal,
            currentStepProgressPercentage: cache.currentStepTotal > 0
                ? Math.round((cache.currentStepProgress / cache.currentStepTotal) * 100) : 0,
            currentPath: cache.currentPath,
            currentFileName: cache.currentFileName,
            cacheStatus: this._getCacheStatus(),
            sortOrder: this.sortOrder,
            currentFilter: this.currentFilter,
            categoryStyle: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileImageCategoryStyle', 'buttons'),
            categories: this._getCategories(),
            aggregatedTags,
            hasAggregatedTags: aggregatedTags.primary.length + aggregatedTags.secondary.length > 0,
            tagSortMode: this.tagSortMode,
            tileAssetGridSize: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultAssetGridSize', 100),
            tileComputedSize: this._getComputedSizeLabel(),
            tileRotation: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultRotation', 0),
            tileAlpha: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultAlpha', 1.0),
            tileAlphaPercent: Math.round(BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultAlpha', 1.0) * 100),
            tileTint: this.tileTint ?? '#ffffff',
            tileLocked: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultLocked', false),
            tileHidden: BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultHidden', false),
            isPlacementMode: this.isPlacementMode,
            pendingImageName: this._pendingPlacement?.imageName ?? '',
            tmfxActive: game.modules.get('tokenmagic')?.active ?? false,
            dropShadow: this.dropShadow
        };
    }

    // ------------------------------------------------------------------
    // Delegation
    // ------------------------------------------------------------------

    _attachDelegationOnce() {
        TileImageWindow._ref = this;
        if (TileImageWindow._delegationAttached) return;
        TileImageWindow._delegationAttached = true;

        const onClick = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            const thumb = e.target?.closest?.('.tir-thumbnail-item');
            if (thumb) { e.preventDefault(); w._onSelectImage(e); return; }
            const cat = e.target?.closest?.('.tir-filter-category');
            if (cat) { e.preventDefault(); w._onCategoryFilterClick(e); return; }
            const tag = e.target?.closest?.('.tir-search-tools-tag');
            if (tag) { e.preventDefault(); w._onTagClick(e); return; }
        };
        const onContextMenu = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            const thumb = e.target?.closest?.('.tir-thumbnail-item');
            if (thumb) { e.preventDefault(); w._onImageRightClick(e); return; }
        };
        const onInput = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            if (e.target?.matches?.('.tir-search-input')) { w._onSearchInput(e); return; }
            if (e.target?.matches?.('.tiw-param-slider')) { w._onParamSliderInput(e); return; }
            if (e.target?.matches?.('#tiw-param-asset-grid-size')) { w._refreshComputedSize(); return; }
            if (e.target?.matches?.('#tiw-param-tint-text')) {
                const val = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    w.tileTint = val;
                    const swatch = w._getRoot()?.querySelector('#tiw-param-tint');
                    if (swatch) swatch.value = val;
                }
                return;
            }
        };
        const onChange = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            if (e.target?.matches?.('.blacksmith-select')) { w._onSortOrderChange(e); return; }
            if (e.target?.matches?.('#tiw-param-tint')) {
                w.tileTint = e.target.value;
                const txt = w._getRoot()?.querySelector('#tiw-param-tint-text');
                if (txt) txt.value = e.target.value;
                return;
            }
            if (e.target?.matches?.('#tiw-drop-shadow')) { w.dropShadow = e.target.checked; game.settings.set(MODULE.ID, 'tileDropShadow', e.target.checked); return; }
        };
        const onScroll = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            if (e.target?.matches?.('.tir-thumbnails-grid')) { w._onScroll(e); return; }
        };
        const onKeypress = (e) => {
            const w = TileImageWindow._ref;
            if (!w) return;
            const root = w._getRoot();
            if (!root?.contains?.(e.target)) return;
            if (e.target?.matches?.('.tir-search-input') && (e.key === 'Enter' || e.which === 13)) {
                e.preventDefault();
            }
        };

        document.addEventListener('click',       onClick);
        document.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('input',       onInput);
        document.addEventListener('change',      onChange);
        document.addEventListener('scroll',      onScroll, true);
        document.addEventListener('keypress',    onKeypress);

        TileImageWindow._listeners = { onClick, onContextMenu, onInput, onChange, onScroll, onKeypress };
    }

    async _onFirstRender(_context, options) {
        await super._onFirstRender?.(_context, options);
        this._attachDelegationOnce();
        this._initializeFilterToggleButton();
        this._initializeParamSliders();
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._attachDelegationOnce();
        this._initializeFilterToggleButton();
        this._initializeParamSliders();
    }

    // ------------------------------------------------------------------
    // render / close
    // ------------------------------------------------------------------

    async render(force = false, options = {}) {
        const scrolls = this._saveScrollPositions();
        const result = await super.render(force, options);
        requestAnimationFrame(() => {
            this._restoreScrollPositions(scrolls);
            this._initializeFilterToggleButton();
            this._initializeParamSliders();
            this._updateResults();
        });
        return result;
    }

    _saveScrollPositions() {
        const root = this._getRoot();
        const body = root?.querySelector?.('.tir-content');
        return { body: body ? body.scrollTop : 0 };
    }

    _restoreScrollPositions(saved) {
        if (!saved) return;
        const root = this._getRoot();
        const body = root?.querySelector?.('.tir-content');
        if (body && saved.body) body.scrollTop = saved.body;
    }

    async close(options = {}) {
        this._exitPlacementMode();
        TileImageWindow._ref = null;
        if (TileImageWindow._listeners) {
            const l = TileImageWindow._listeners;
            document.removeEventListener('click',       l.onClick);
            document.removeEventListener('contextmenu', l.onContextMenu);
            document.removeEventListener('input',       l.onInput);
            document.removeEventListener('change',      l.onChange);
            document.removeEventListener('scroll',      l.onScroll, true);
            document.removeEventListener('keypress',    l.onKeypress);
            TileImageWindow._listeners = null;
        }
        TileImageWindow._delegationAttached = false;
        this._teardownResources();
        return super.close(options);
    }

    // ------------------------------------------------------------------
    // Static action handlers
    // ------------------------------------------------------------------

    static _actionScanImages(event, target)     { TileImageWindow._ref?._onScanImages(); }
    static _actionPauseCache(event, target)     { TileImageWindow._ref?._onPauseCache(); }
    static _actionDeleteCache(event, target)    { TileImageWindow._ref?._onDeleteCache(); }
    static _actionCancelPlacement(event, target){ TileImageWindow._ref?._exitPlacementMode(true); }
    static _actionClearSearch(event, target)    { TileImageWindow._ref?._onClearSearch(event); }
    static _actionFilterToggle(event, target)   { TileImageWindow._ref?._onFilterToggle(event); }
    static _actionSetDefaults(event, target)    { TileImageWindow._ref?._onSetDefaults(); }

    // ------------------------------------------------------------------
    // openWindow
    // ------------------------------------------------------------------

    static async openWindow(opts = {}) {
        if (!game.user.isGM) {
            ui.notifications.warn('Only GMs can use the Tile Image Placement window.');
            return;
        }
        const existing = Object.values(ui.windows).find(w => w instanceof TileImageWindow);
        if (existing) { existing.render(true); return; }
        const win = new TileImageWindow();
        win.render(true);
        await win._findMatches();
    }

    // ------------------------------------------------------------------
    // Canvas placement mode
    // ------------------------------------------------------------------

    _snapshotParams(naturalWidth, naturalHeight) {
        // Read all option-bar values NOW, before any re-render can reset them.
        const root = this._getRoot();
        const get  = s => root?.querySelector(s);
        return {
            naturalWidth,
            naturalHeight,
            assetGridSize: parseInt(get('#tiw-param-asset-grid-size')?.value) || BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultAssetGridSize', 100),
            sceneGridSize: canvas.scene?.grid?.size || canvas.grid?.size || 100,
            rotation:      parseFloat(get('#tiw-param-rotation')?.value)           ?? BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultRotation', 0),
            alpha:         parseFloat(get('#tiw-param-alpha')?.value)              ?? BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultAlpha', 1.0),
            tint:          get('#tiw-param-tint')?.value                           || '#ffffff',
            locked:        get('[data-setting-key="tileDefaultLocked"]')?.checked  ?? BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultLocked', false),
            hidden:        get('[data-setting-key="tileDefaultHidden"]')?.checked  ?? BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileDefaultHidden', false),
        };
    }

    _enterPlacementMode(imagePath, imageName, naturalWidth = 0, naturalHeight = 0) {
        if (!canvas?.scene) {
            ui.notifications.warn('Tile Image: No active scene to place a tile on.');
            return;
        }

        const snapshot = this._snapshotParams(naturalWidth, naturalHeight);

        // If already in placement mode, just swap the image
        if (this._pendingPlacement) {
            this._pendingPlacement = { imagePath, imageName, ...snapshot };
            this._highlightSelectedThumb(imagePath);
            this._refreshComputedSize();
            return;
        }

        this._pendingPlacement = { imagePath, imageName, ...snapshot };
        this.isPlacementMode = true;
        this._highlightSelectedThumb(imagePath);

        // Switch to tiles layer so the placed tile is immediately visible/selected
        canvas.tiles?.activate?.();

        // Crosshair cursor on the canvas
        const canvasEl = canvas.app?.view;
        if (canvasEl) canvasEl.style.cursor = 'crosshair';

        // Cursor-following placement preview (mirrors Blacksmith encounter tooltip)
        const tooltip = document.createElement('div');
        tooltip.className = 'tiw-placement-tooltip';
        tooltip.innerHTML = `
            <img class="tiw-placement-tooltip-img" src="${imagePath}" alt="${imageName}">
            <div class="tiw-placement-tooltip-name">${imageName}</div>
            <div class="tiw-placement-tooltip-hint">Click to place &nbsp;&middot;&nbsp; Esc to cancel</div>
        `;
        document.body.appendChild(tooltip);
        this._placementTooltip = tooltip;

        const onMouseMove = (event) => {
            tooltip.style.left = (event.data.global.x + 16) + 'px';
            tooltip.style.top  = (event.data.global.y - 60) + 'px';
        };
        canvas.stage?.on?.('mousemove', onMouseMove);
        this._placementTooltipMouseMove = onMouseMove;

        // One-shot canvas click handler — only fires on direct canvas clicks
        const onCanvasClick = (e) => {
            if (e.target !== canvasEl) return; // ignore clicks on UI overlays
            e.stopPropagation();
            cleanup();
            this._completePlacement(e);
        };

        // ESC cancels — use capture so we intercept before Foundry's window-close handler
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                cleanup();
                this._exitPlacementMode(true);
            }
        };

        const cleanup = () => {
            canvasEl?.removeEventListener?.('click', onCanvasClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            if (canvasEl) canvasEl.style.cursor = '';
            if (this._placementTooltip) {
                this._placementTooltip.remove();
                this._placementTooltip = null;
            }
            if (this._placementTooltipMouseMove) {
                canvas.stage?.off?.('mousemove', this._placementTooltipMouseMove);
                this._placementTooltipMouseMove = null;
            }
            this._placementCleanup = null;
        };

        this._placementCleanup = cleanup;
        canvasEl?.addEventListener?.('click', onCanvasClick, true);
        document.addEventListener('keydown', onKeyDown, true);

        this._refreshComputedSize();
        this.render(false);
    }

    _exitPlacementMode(rerender = false) {
        this._placementCleanup?.();
        this._placementCleanup = null;
        this._pendingPlacement = null;
        this.isPlacementMode = false;

        const canvasEl = canvas.app?.view;
        if (canvasEl) canvasEl.style.cursor = '';

        this._getRoot()?.querySelectorAll('.tir-thumbnail-item.tiw-selected')
            .forEach(el => el.classList.remove('tiw-selected'));

        if (rerender) this.render(false);
    }

    async _completePlacement(clickEvent) {
        if (!this._pendingPlacement) return;

        // Capture snapshot BEFORE _exitPlacementMode nulls _pendingPlacement
        const { imagePath, imageName,
                naturalWidth: naturalW0, naturalHeight: naturalH0,
                assetGridSize, sceneGridSize,
                rotation, alpha, tint, locked, hidden } = this._pendingPlacement;
        this._exitPlacementMode(false);

        // Convert screen coordinates → canvas stage coordinates
        const canvasEl = canvas.app?.view;
        const rect = canvasEl?.getBoundingClientRect() ?? { left: 0, top: 0 };
        const screenX = clickEvent.clientX - rect.left;
        const screenY = clickEvent.clientY - rect.top;
        const t = canvas.stage?.worldTransform;
        const canvasX = t ? (screenX - t.tx) / t.a : screenX;
        const canvasY = t ? (screenY - t.ty) / t.d : screenY;
        const naturalW = naturalW0 || sceneGridSize;
        const naturalH = naturalH0 || sceneGridSize;
        const scale    = sceneGridSize / assetGridSize;
        const width    = Math.round(naturalW * scale);
        const height   = Math.round(naturalH * scale);
        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME,
            `Tile dims: natural=${naturalW}×${naturalH} assetGrid=${assetGridSize} sceneGrid=${sceneGridSize} → placed=${width}×${height}`, '', true, false);

        try {
            const [tileDoc] = await canvas.scene.createEmbeddedDocuments('Tile', [{
                texture: { src: imagePath, tint: tint !== '#ffffff' ? tint : null },
                x: Math.round(canvasX - width / 2),
                y: Math.round(canvasY - height / 2),
                width, height, rotation, alpha, locked, hidden
            }]);

            if (this.dropShadow && game.modules.get('tokenmagic')?.active && window.TokenMagic && tileDoc) {
                const shadowParams = [{
                    filterType: 'shadow',
                    filterId: 'myShadow',
                    rotation: 35,
                    blur: 2,
                    quality: 5,
                    distance: 5,
                    alpha: 0.8,
                    padding: 10,
                    shadowOnly: false,
                    color: 0x000000,
                    zOrder: 6000,
                    animated: {
                        blur:     { active: false, loopDuration: 1,   animType: 'syncCosOscillation', val1: 2,  val2: 4  },
                        rotation: { active: false, loopDuration: 100, animType: 'syncSinOscillation', val1: 33, val2: 37 }
                    }
                }];
                // Wait for the canvas to draw the tile placeable before TMFX can target it
                setTimeout(() => {
                    const placeable = tileDoc.object;
                    if (placeable) TokenMagic.addUpdateFilters(placeable, shadowParams);
                }, 150);
            }

            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME,
                `Tile Image: Placed "${imageName}" (${width}x${height})`, '', true, false);
        } catch (err) {
            ui.notifications.error(`Tile Image: Failed to place tile — ${err.message}`);
        }

        // Re-render to clear placement mode banner
        this.render(false);
    }

    _highlightSelectedThumb(imagePath) {
        const root = this._getRoot();
        if (!root) return;
        root.querySelectorAll('.tir-thumbnail-item').forEach(el => {
            el.classList.toggle('tiw-selected', el.dataset.imagePath === imagePath);
        });
    }

    // ------------------------------------------------------------------
    // Cache helpers
    // ------------------------------------------------------------------

    _getCacheStatus() {
        const cache = ImageCacheManager.getCache(TILE_MODE);
        if (!cache.lastScan) return 'No cache';
        const files = cache.files?.size ?? 0;
        const ageMs = Date.now() - cache.lastScan;
        const ageH = (ageMs / 3600000).toFixed(1);
        const sizeStr = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tileImageDisplayCacheStatus', '');
        return `${files.toLocaleString()} files, ${ageH} hours old${sizeStr ? ', ' + sizeStr : ''}`;
    }

    _getTopLevelFolder(fileInfo) {
        const fullPath = fileInfo?.fullPath ?? '';
        if (!fullPath) return null;
        const bases = getTileImagePaths().filter(Boolean);
        for (const base of bases) {
            const prefix = base.endsWith('/') ? base : base + '/';
            if (fullPath.startsWith(prefix)) {
                const relative = fullPath.slice(prefix.length);
                const slash = relative.indexOf('/');
                return slash !== -1 ? relative.slice(0, slash) : null;
            }
        }
        // Fallback: use sourcePath stored in metadata
        const sourcePath = fileInfo?.metadata?.sourcePath ?? '';
        if (sourcePath) {
            const prefix = sourcePath.endsWith('/') ? sourcePath : sourcePath + '/';
            if (fullPath.startsWith(prefix)) {
                const relative = fullPath.slice(prefix.length);
                const slash = relative.indexOf('/');
                return slash !== -1 ? relative.slice(0, slash) : null;
            }
        }
        return null;
    }

    _getCategories() {
        const cache = ImageCacheManager.getCache(TILE_MODE);
        if (!cache.files || cache.files.size === 0) return [];
        const folderCount = new Map();
        for (const [, f] of cache.files) {
            const folder = this._getTopLevelFolder(f);
            if (folder) folderCount.set(folder, (folderCount.get(folder) ?? 0) + 1);
        }
        return Array.from(folderCount.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([folder, count]) => ({ key: folder, name: folder, count, isActive: this.currentFilter === folder }));
    }

    _getAggregatedTags() {
        const cache = ImageCacheManager.getCache(TILE_MODE);
        const files = this.allMatches.length > 0 ? this.allMatches : Array.from(cache.files?.values() ?? []);
        const primaryCount = new Map();
        const secondaryCount = new Map();
        for (const f of files) {
            for (const t of (f?.metadata?.primaryTags ?? [])) primaryCount.set(t, (primaryCount.get(t) ?? 0) + 1);
            for (const t of (f?.metadata?.secondaryTags ?? [])) secondaryCount.set(t, (secondaryCount.get(t) ?? 0) + 1);
        }
        const sort = (map) => {
            const arr = Array.from(map.entries());
            if (this.tagSortMode === 'alpha') arr.sort((a, b) => a[0].localeCompare(b[0]));
            else arr.sort((a, b) => b[1] - a[1]);
            return arr.map(([t]) => t);
        };
        return { primary: sort(primaryCount), secondary: sort(secondaryCount) };
    }

    // ------------------------------------------------------------------
    // Search / matching
    // ------------------------------------------------------------------

    async _findMatches() {
        this.matches = [];
        this.allMatches = [];
        this.currentPage = 0;
        this.isSearching = true;
        this._updateStatusIcon();

        const cache = ImageCacheManager.getCache(TILE_MODE);
        if (cache.files.size === 0) {
            this.isSearching = false;
            this._updateStatusIcon();
            this._updateResults();
            return;
        }

        let files = Array.from(cache.files.values());

        if (this.currentFilter === 'favorites') {
            files = files.filter(f => f?.metadata?.tags?.includes('FAVORITE'));
        } else if (this.currentFilter !== 'all') {
            files = files.filter(f => this._getTopLevelFolder(f) === this.currentFilter);
        }

        if (this.selectedTags.size > 0) {
            files = files.filter(f => {
                const all = [...(f?.metadata?.primaryTags ?? []), ...(f?.metadata?.secondaryTags ?? [])];
                return Array.from(this.selectedTags).every(t => all.includes(t));
            });
        }

        const term = (this.searchTerm || '').trim().toLowerCase();
        if (term.length >= 2) {
            files = files.filter(f => {
                const name = (f?.name ?? '').toLowerCase();
                const path = (f?.fullPath ?? '').toLowerCase();
                const tags = [...(f?.metadata?.primaryTags ?? []), ...(f?.metadata?.secondaryTags ?? [])].join(' ').toLowerCase();
                return name.includes(term) || path.includes(term) || tags.includes(term);
            });
        }

        if (this.sortOrder === 'atoz') files.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        else if (this.sortOrder === 'ztoa') files.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));

        this.allMatches = files;
        this.hasMoreResults = files.length > this.resultsPerPage;
        this.matches = files.slice(0, this.resultsPerPage);
        this.isSearching = false;
        this._updateStatusIcon();
        this._updateResults();
    }

    _updateStatusIcon() {
        const el = this._getRoot()?.querySelector('#tir-results-details-status');
        if (!el) return;
        el.innerHTML = this.isSearching
            ? '<i class="fa-solid fa-arrows-rotate fa-spin"></i>'
            : '<i class="fa-solid fa-magnifying-glass"></i>';
    }

    _updateResults() {
        const root = this._getRoot();
        if (!root) return;
        const grid = root.querySelector('.tir-thumbnails-grid');
        if (!grid) return;

        this._activeImageElements.forEach(img => { try { img.src = ''; } catch (_) {} });
        this._activeImageElements.clear();

        if (this.matches.length === 0) {
            grid.innerHTML = `<div class="tir-no-results">
                <i class="fa-solid fa-map"></i>
                <p>No tile images found.<br>Add image folder paths in Settings and click Scan Images.</p>
            </div>`;
        } else {
            grid.innerHTML = this.matches.map(f => this._renderThumbnail(f)).join('');
            grid.querySelectorAll('img.tir-thumb-img').forEach(img => this._activeImageElements.add(img));
        }

        const countEl = root.querySelector('#tir-results-details-count');
        if (countEl) countEl.innerHTML = `<i class="fas fa-images"></i>${this.matches.length} of ${this.allMatches.length} Showing`;
    }

    _renderThumbnail(fileInfo) {
        const path = fileInfo.fullPath || '';
        const name = fileInfo.name || path.split('/').pop() || '';
        const tags = [...(fileInfo?.metadata?.primaryTags ?? []), ...(fileInfo?.metadata?.secondaryTags ?? [])];
        const isFav = fileInfo?.metadata?.tags?.includes('FAVORITE') || fileInfo?.metadata?.tags?.includes('favorite');
        const isSelected = this._pendingPlacement?.imagePath === path;
        return `
            <div class="tir-thumbnail-item${isSelected ? ' tiw-selected' : ''}${isFav ? ' tir-favorite-image' : ''}"
                 data-image-path="${path}" data-image-name="${name}" data-tooltip="${name}">
                <div class="tir-thumbnail-image">
                    <img src="${path}" alt="${name}" loading="lazy">
                    <div class="tir-thumbnail-overlay">
                        <i class="fa-solid fa-crosshairs"></i>
                        <span class="tir-overlay-text">Place Tile</span>
                    </div>
                    ${isFav ? '<div class="tir-thumbnail-favorite-badge"><i class="fas fa-heart"></i></div>' : ''}
                </div>
                <div class="tir-thumbnail-name">${name}</div>
                <div class="tir-thumbnail-score">
                    <div class="tir-score-text">Browse</div>
                    <div class="tir-score-bar"><div class="tir-score-fill" style="width: 0%"></div></div>
                </div>
                <div class="tir-thumbnail-tagset">
                    ${tags.slice(0, 8).map(t => `<span class="tir-thumbnail-tag">${t}</span>`).join('')}
                </div>
            </div>`;
    }

    async _loadMoreResults() {
        if (this.isLoadingMore || !this.hasMoreResults) return;
        this.isLoadingMore = true;
        const nextPage = this.currentPage + 1;
        const start = nextPage * this.resultsPerPage;
        const more = this.allMatches.slice(start, start + this.resultsPerPage);
        this.matches = [...this.matches, ...more];
        this.currentPage = nextPage;
        this.hasMoreResults = this.allMatches.length > this.matches.length;
        this.isLoadingMore = false;
        this._updateResults();
    }

    _onParamSliderInput(event) {
        const input = event.target;
        const root  = this._getRoot();
        if (input.id === 'tiw-param-rotation') {
            const val = root?.querySelector('#tiw-param-rotation-val');
            if (val) val.textContent = `${Math.round(input.value)}°`;
        } else if (input.id === 'tiw-param-alpha') {
            const val = root?.querySelector('#tiw-param-alpha-val');
            if (val) val.textContent = `${Math.round(parseFloat(input.value) * 100)}%`;
        }
    }

    _getComputedSizeLabel() {
        const p = this._pendingPlacement;
        if (p?.naturalWidth > 0) {
            // Use snapshotted values — always accurate after selection
            const scale = p.sceneGridSize / p.assetGridSize;
            return `${Math.round(p.naturalWidth * scale)} × ${Math.round(p.naturalHeight * scale)} px`;
        }
        // No image selected yet — show what the current input would produce with a hypothetical 1×1 tile
        return '— × —';
    }

    _refreshComputedSize() {
        const el = this._getRoot()?.querySelector('#tiw-computed-size');
        if (el) el.textContent = this._getComputedSizeLabel();
    }

    _initializeParamSliders() {
        const root = this._getRoot();
        if (!root) return;
        const rotInput = root.querySelector('#tiw-param-rotation');
        if (rotInput) {
            const val = root.querySelector('#tiw-param-rotation-val');
            if (val) val.textContent = `${Math.round(rotInput.value)}°`;
        }
        const alphaInput = root.querySelector('#tiw-param-alpha');
        if (alphaInput) {
            const val = root.querySelector('#tiw-param-alpha-val');
            if (val) val.textContent = `${Math.round(parseFloat(alphaInput.value) * 100)}%`;
        }
    }

    // ------------------------------------------------------------------
    // Event handlers
    // ------------------------------------------------------------------

    _resolveImageDims(imagePath, thumbEl, callback) {
        // Primary: Foundry's texture loader uses the PIXI cache — most reliable
        foundry.canvas.loadTexture(imagePath).then(texture => {
            if (texture?.width > 0) { callback(texture.width, texture.height); return; }
            // Fallback: DOM img naturalWidth (if fully loaded)
            const img = thumbEl?.querySelector('img');
            if (img?.complete && img.naturalWidth > 0) { callback(img.naturalWidth, img.naturalHeight); return; }
            callback(0, 0);
        }).catch(() => {
            const img = thumbEl?.querySelector('img');
            if (img?.complete && img.naturalWidth > 0) callback(img.naturalWidth, img.naturalHeight);
            else callback(0, 0);
        });
    }

    _onSelectImage(event) {
        const thumb = event.target.closest('.tir-thumbnail-item');
        if (!thumb) return;
        const imagePath = thumb.dataset.imagePath;
        const imageName = thumb.dataset.imageName;
        if (!imagePath) return;
        this._resolveImageDims(imagePath, thumb, (nw, nh) => {
            this._enterPlacementMode(imagePath, imageName, nw, nh);
        });
    }

    _onImageRightClick(event) {
        const thumb = event.target.closest('.tir-thumbnail-item');
        if (!thumb) return;
        const imagePath = thumb.dataset.imagePath;
        const imageName = thumb.dataset.imageName;
        if (!imagePath) return;

        // Find the cache entry by fullPath scan — matches how the entry was stored
        let fileInfo = null;
        for (const [, f] of ImageCacheManager.getCache(TILE_MODE).files) {
            if (f.fullPath === imagePath) { fileInfo = f; break; }
        }
        if (fileInfo) ImageCacheManager._ensureTagMetadata(fileInfo.metadata);
        const isFav = fileInfo?.metadata?.tags?.includes('FAVORITE') ?? false;
        const menuRoot = (thumb.ownerDocument || document).body;

        const coreItems = [
            {
                name: isFav ? 'Remove from Favorites' : 'Add to Favorites',
                icon: isFav ? 'fa-solid fa-heart-crack' : 'fa-solid fa-heart',
                callback: () => this._toggleFavorite(imagePath, imageName, fileInfo)
            },
            {
                name: 'Place on Canvas',
                icon: 'fa-solid fa-map',
                callback: () => this._resolveImageDims(imagePath, thumb, (nw, nh) => this._enterPlacementMode(imagePath, imageName, nw, nh))
            },
            {
                name: 'View Full Size and Share',
                icon: 'fa-solid fa-users',
                description: 'Show this image to all connected players',
                callback: () => {
                    game.socket.emit(`module.${MODULE.ID}`, { action: 'showImage', src: imagePath, title: imageName });
                    const ImagePopout = foundry.applications?.apps?.ImagePopout ?? window.ImagePopout;
                    if (ImagePopout) new ImagePopout(imagePath, { title: imageName, shareable: false }).render(true);
                }
            }
        ];

        UIContextMenu.show({
            id: `${MODULE.ID}-tile-context-menu`,
            x: event.clientX,
            y: event.clientY,
            root: menuRoot,
            className: 'context-menu-above-dialogs',
            zones: { core: coreItems, module: [], gm: [] }
        });
    }

    _getCacheKeyForPath(fullPath) {
        const bases = getTileImagePaths().filter(Boolean);
        for (const base of bases) {
            const prefix = base.endsWith('/') ? base : base + '/';
            if (fullPath.startsWith(prefix)) return fullPath.slice(prefix.length).toLowerCase();
        }
        return fullPath.toLowerCase();
    }

    async _toggleFavorite(imagePath, imageName, fileInfo) {
        if (!fileInfo) return;
        ImageCacheManager._ensureTagMetadata(fileInfo.metadata);
        const isFavorited = fileInfo.metadata?.tags?.includes('FAVORITE') ?? false;
        if (isFavorited) {
            ImageCacheManager._removeTag(fileInfo.metadata, 'FAVORITE');
            await ImageCacheManager._saveMetadataToStorage(TILE_MODE);
            ui.notifications.info(`Removed ${imageName} from favorites`);
        } else {
            ImageCacheManager._markTag(fileInfo.metadata, 'FAVORITE', 'primary');
            await ImageCacheManager._saveMetadataToStorage(TILE_MODE);
            ui.notifications.info(`Added ${imageName} to favorites`);
        }
        if (this.currentFilter === 'favorites') {
            await this._findMatches();
        } else {
            this._updateResults();
        }
    }

    async _onScanImages() {
        const cache = ImageCacheManager.getCache(TILE_MODE);
        if (cache.isScanning) return;

        // Re-render immediately to show scanning state in the template
        this.render(false);

        // Track whether the scan ever started — dialog may be open before scan begins,
        // so isScanning is false initially. Don't clear until true→false transition.
        let scanStarted = false;
        const progressTimer = setInterval(() => {
            const isScanning = ImageCacheManager.getCache(TILE_MODE).isScanning;
            if (isScanning) {
                scanStarted = true;
                this.render(false);
            } else if (scanStarted) {
                clearInterval(progressTimer);
            }
        }, 400);

        try {
            await ImageCacheManager.scanForImages(TILE_MODE);
        } finally {
            clearInterval(progressTimer);
        }

        this.currentFilter = 'all';
        await this._findMatches();
        this.render(true);
    }

    _onPauseCache() {
        ImageCacheManager.pauseCache(TILE_MODE);
        this.render(true);
    }

    async _onSetDefaults() {
        const root = this._getRoot();
        const get = (sel) => root?.querySelector(sel);
        const assetGridSize = parseInt(get('#tiw-param-asset-grid-size')?.value) || 100;
        const rotation      = parseFloat(get('#tiw-param-rotation')?.value)  ?? 0;
        const alpha         = parseFloat(get('#tiw-param-alpha')?.value)     ?? 1.0;
        const locked        = get('[data-setting-key="tileDefaultLocked"]')?.checked  ?? false;
        const hidden        = get('[data-setting-key="tileDefaultHidden"]')?.checked  ?? false;

        await game.settings.set(MODULE.ID, 'tileDefaultAssetGridSize', assetGridSize);
        await game.settings.set(MODULE.ID, 'tileDefaultRotation',      rotation);
        await game.settings.set(MODULE.ID, 'tileDefaultAlpha',         alpha);
        await game.settings.set(MODULE.ID, 'tileDefaultLocked',        locked);
        await game.settings.set(MODULE.ID, 'tileDefaultHidden',        hidden);

        ui.notifications.info('Tile defaults saved.');
    }

    async _onDeleteCache() {
        const confirmed = await Dialog.confirm({
            title: 'Delete Tile Image Cache',
            content: '<p>Delete the tile image cache? You will need to scan again to browse images.</p>',
            yes: () => true, no: () => false, defaultYes: false
        });
        if (!confirmed) return;
        await ImageCacheManager.deleteCache(TILE_MODE);
        this.matches = [];
        this.allMatches = [];
        this.render(true);
    }

    async _onClearSearch(event) {
        event?.preventDefault?.();
        const root = this._getRoot();
        const input = root?.querySelector('.tir-search-input');
        if (input) input.value = '';
        this.searchTerm = '';
        this.selectedTags.clear();
        root?.querySelectorAll('.tir-search-tools-tag').forEach(t => t.classList.remove('selected'));
        await this._findMatches();
    }

    _onFilterToggle(event) {
        event?.preventDefault?.();
        const root = this._getRoot();
        if (!root) return;
        const button = event?.target?.closest('.tir-filter-toggle-btn') ?? event?.target;
        const tagContainer = root.querySelector('#tir-search-tools-tag-container');
        const icon = button?.querySelector('i');
        if (this.tagSortMode === 'count') {
            this.tagSortMode = 'alpha';
            if (button) button.setAttribute('title', 'Tag Sort: Alpha');
            if (icon) icon.className = 'fas fa-filter-list';
            if (tagContainer) tagContainer.style.display = '';
        } else if (this.tagSortMode === 'alpha') {
            this.tagSortMode = 'hidden';
            if (button) button.setAttribute('title', 'Tag Sort: Hidden');
            if (icon) icon.className = 'fas fa-filter-circle-xmark';
            if (tagContainer) tagContainer.style.display = 'none';
        } else {
            this.tagSortMode = 'count';
            if (button) button.setAttribute('title', 'Tag Sort: Count');
            if (icon) icon.className = 'fas fa-filter';
            if (tagContainer) tagContainer.style.display = '';
        }
        game.settings.set(MODULE.ID, 'tileImageTagSortMode', this.tagSortMode);
        this._updateTagContainer();
    }

    _initializeFilterToggleButton() {
        const root = this._getRoot();
        if (!root) return;
        const button = root.querySelector('.tir-filter-toggle-btn');
        const tagContainer = root.querySelector('#tir-search-tools-tag-container');
        const icon = button?.querySelector('i');
        const states = {
            count:  { title: 'Tag Sort: Count',  cls: 'fas fa-filter',              show: true },
            alpha:  { title: 'Tag Sort: Alpha',   cls: 'fas fa-filter-list',         show: true },
            hidden: { title: 'Tag Sort: Hidden',  cls: 'fas fa-filter-circle-xmark', show: false }
        };
        const s = states[this.tagSortMode] ?? states.count;
        if (button) button.setAttribute('title', s.title);
        if (icon) icon.className = s.cls;
        if (tagContainer) tagContainer.style.display = s.show ? '' : 'none';
    }

    async _onSearchInput(event) {
        this.searchTerm = event.target.value.trim();
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => this._findMatches(), 300);
    }

    async _onSortOrderChange(event) {
        const val = event.target.value;
        if (!val || val === this.sortOrder) return;
        this.sortOrder = val;
        await this._findMatches();
    }

    async _onScroll(event) {
        const el = event.target;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
            if (this.hasMoreResults && !this.isLoadingMore) await this._loadMoreResults();
        }
    }

    async _onCategoryFilterClick(event) {
        const clicked = event.target.closest('.tir-filter-category');
        if (!clicked) return;
        const cat = clicked.dataset.category;
        if (!cat || cat === this.currentFilter) return;
        this.currentFilter = cat;
        const root = this._getRoot();
        root?.querySelectorAll('.tir-filter-category').forEach(el => el.classList.remove('active'));
        clicked.classList.add('active');
        await this._findMatches();
    }

    async _onTagClick(event) {
        const tag = event.target.closest('.tir-search-tools-tag');
        if (!tag) return;
        const name = tag.dataset.searchTerm;
        if (!name) return;
        if (this.selectedTags.has(name)) { this.selectedTags.delete(name); tag.classList.remove('selected'); }
        else { this.selectedTags.add(name); tag.classList.add('selected'); }
        await this._findMatches();
    }

    async _onFuzzySearchToggle(event) {
        await game.settings.set(MODULE.ID, 'tileImageFuzzySearch', event.target.checked);
        await this._findMatches();
    }

    _updateTagContainer() {
        const root = this._getRoot();
        const container = root?.querySelector('#tir-search-tools-tag-container');
        if (!container) return;
        const agg = this._getAggregatedTags();
        const groups = [
            { label: 'Primary Tags', list: agg.primary, css: 'primary' },
            { label: 'Secondary Tags', list: agg.secondary, css: 'secondary' }
        ];
        container.innerHTML = groups.map(g => {
            if (!g.list?.length) return '';
            const tags = g.list.map(t => {
                const sel = this.selectedTags.has(t) ? ' selected' : '';
                return `<span class="tir-search-tools-tag${sel}" data-search-term="${t}">${t}</span>`;
            }).join('');
            return `<div class="tir-search-tools-tag-group tir-search-tools-tag-group-${g.css}">
                        <div class="tir-search-tools-tag-group-label">${g.label}</div>
                        <div class="tir-search-tools-tag-row">${tags}</div>
                    </div>`;
        }).join('');
    }

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    _teardownResources() {
        if (this._teardownExecuted) return;
        this._teardownExecuted = true;
        for (const id of this._trackedTimeouts) clearTimeout(id);
        this._trackedTimeouts.clear();
        this._activeImageElements.forEach(img => { try { img.src = ''; } catch (_) {} });
        this._activeImageElements.clear();
        this.matches = [];
        this.allMatches = [];
        this._cachedSearchTerms = null;
        this.selectedTags.clear();
        this._searchResultCache.clear();
    }
}
