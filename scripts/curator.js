// ==================================================================
// ===== CURATOR - ENTRY POINT ==================================
// ==================================================================

import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { TokenImageUtilities } from './token-image-utilities.js';
import { TokenImageReplacementWindow } from './token-image-replacement.js';
import { TileImageWindow } from './tile-image-window.js';
import { registerSettings } from './settings.js';
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

// Menubar identity: one "Curator" button on the main bar that toggles a
// secondary bar holding the image tools.
const MENUBAR_TOOL_ID = 'curator';
const SECONDARY_BAR_ID = 'curator';
const SECONDARY_BAR_ITEMS = {
    TOKEN: 'curator-replace-token',
    CANVAS_TOKEN: 'curator-replace-canvas-tokens',
    PORTRAIT: 'curator-replace-portrait',
    CANVAS_PORTRAIT: 'curator-replace-canvas-portraits',
    TILE: 'curator-place-image'
};

Hooks.once('ready', async function () {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.warn(`${MODULE.TITLE} | Blacksmith not found; skipping registration.`);
        return;
    }

    // module.api is assigned early; window globals (BlacksmithUtils, etc.) wire later.
    // Wait so initializeCurator and settings do not call null helpers (see Blacksmith wiki).
    if (typeof BlacksmithAPI.waitForReady === 'function') {
        await BlacksmithAPI.waitForReady();
    }

    try {
        if (window.BlacksmithModuleManager) {
            window.BlacksmithModuleManager.registerModule(MODULE.ID, {
                name: MODULE.TITLE,
                version: game.modules.get(MODULE.ID)?.version || '1.0.0'
            });
            console.log(`✅ Module ${MODULE.TITLE} registered with Blacksmith successfully`);
        }
    } catch (error) {
        console.error(`❌ Failed to register ${MODULE.TITLE} with Blacksmith:`, error);
    }

    registerSettings(blacksmith);

    // Socket handler — must register for ALL users, not just GM
    game.socket.on(`module.${MODULE.ID}`, (data) => {
        if (data?.action === 'showImage') {
            const ImagePopout = foundry.applications?.apps?.ImagePopout ?? window.ImagePopout;
            if (ImagePopout) {
                new ImagePopout(data.src, { title: data.title ?? '', shareable: false }).render(true);
            }
        }
    });

    // Pin double-click — register for all users via the API (ownership/visibility handled by Blacksmith)
    const pinsAPI = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    if (pinsAPI?.isAvailable()) {
        pinsAPI.registerPinType(MODULE.ID, 'curator-image', 'Curator Image');

        const offDoubleClick = pinsAPI.on('doubleClick', (evt) => {
            const imagePath = evt.pin?.image;
            if (!imagePath) return;
            const imageName = imagePath.split('/').pop().replace(/\.[^.]+$/, '');
            if (game.user.isGM) {
                game.socket.emit(`module.${MODULE.ID}`, { action: 'showImage', src: imagePath, title: imageName });
            }
            const ImagePopout = foundry.applications?.apps?.ImagePopout ?? window.ImagePopout;
            if (ImagePopout) new ImagePopout(imagePath, { title: imageName, shareable: false }).render(true);
        }, { moduleId: MODULE.ID });

        Hooks.once('unloadModule', (id) => { if (id === MODULE.ID) offDoubleClick?.(); });
    }

    if (!game.user.isGM) return;

    if (typeof blacksmith.registerMenubarTool !== 'function') {
        setTimeout(() => {
            const api = game.modules.get('coffee-pub-blacksmith')?.api;
            if (api && typeof api.registerMenubarTool === 'function') {
                initializeCurator(api);
            } else {
                console.warn(`${MODULE.TITLE} | Blacksmith API not available; image replacement tools will not appear.`);
            }
        }, 150);
        return;
    }
    initializeCurator(blacksmith);
});

/**
 * Register the "Curator" menubar button and the secondary bar its tools live on.
 * The bar type must exist before it can be opened; items themselves are
 * timing-safe and queue until the type registers.
 */
async function registerMenubarIntegration(blacksmith) {
    // No size: a row of labelled buttons needs no extra room, so it takes the
    // house default (30px, matching the primary menubar).
    const barRegistered = await blacksmith.registerSecondaryBarType(SECONDARY_BAR_ID, {
        name: MODULE.TITLE,
        title: 'Curator Image Tools',
        icon: 'fa-solid fa-images',
        persistence: 'manual', // Stay open until the user closes it
        moduleId: MODULE.ID,
        groups: {
            'replace': { mode: 'default', order: 10 },
            'place': { mode: 'default', order: 20 }
        }
    });

    if (!barRegistered) {
        console.warn(`${MODULE.TITLE} | Failed to register secondary bar type; image tools will not appear.`);
        return;
    }

    blacksmith.registerMenubarTool(MENUBAR_TOOL_ID, {
        icon: 'fa-solid fa-images',
        name: MENUBAR_TOOL_ID,
        title: 'Curator',
        tooltip: 'Curator Image Tools',
        onClick: () => blacksmith.toggleSecondaryBar(SECONDARY_BAR_ID),
        zone: 'middle',
        group: 'utility',
        // No groupOrder: Blacksmith derives it from the group name (utility = 2).
        order: 2,
        moduleId: MODULE.ID,
        gmOnly: true,
        leaderOnly: false,
        visible: true,
        toggleable: true, // Required for the bar-open state to sync onto the button
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    // Sync the button's active state whenever the bar opens, closes, or is
    // displaced by another module's bar.
    blacksmith.registerSecondaryBarTool(SECONDARY_BAR_ID, MENUBAR_TOOL_ID);

    blacksmith.registerSecondaryBarItem(SECONDARY_BAR_ID, SECONDARY_BAR_ITEMS.TOKEN, {
        icon: 'fa-solid fa-image',
        label: 'Replace Token',
        tooltip: 'Replace Token Images',
        group: 'replace',
        order: 10,
        moduleId: MODULE.ID,
        visible: () => game.user.isGM,
        onClick: () => TokenImageReplacementWindow.openWindow({ mode: 'token' })
    });

    // Batch action: no window, walks every token on the current canvas.
    blacksmith.registerSecondaryBarItem(SECONDARY_BAR_ID, SECONDARY_BAR_ITEMS.CANVAS_TOKEN, {
        icon: 'fa-solid fa-sync',
        label: 'Replace Canvas Tokens',
        tooltip: 'Replace token images for every token on the canvas',
        group: 'replace',
        order: 20,
        moduleId: MODULE.ID,
        visible: () => game.user.isGM,
        onClick: () => TokenImageReplacementWindow.runUpdateCanvas(ImageCacheManager.MODES.TOKEN, 'Token')
    });

    blacksmith.registerSecondaryBarItem(SECONDARY_BAR_ID, SECONDARY_BAR_ITEMS.PORTRAIT, {
        icon: 'fa-solid fa-portrait',
        label: 'Replace Portrait',
        tooltip: 'Replace Portrait Images',
        group: 'replace',
        order: 30,
        moduleId: MODULE.ID,
        visible: () => game.user.isGM,
        onClick: () => TokenImageReplacementWindow.openWindow({ mode: 'portrait' })
    });

    blacksmith.registerSecondaryBarItem(SECONDARY_BAR_ID, SECONDARY_BAR_ITEMS.CANVAS_PORTRAIT, {
        icon: 'fa-solid fa-sync',
        label: 'Replace Canvas Portraits',
        tooltip: 'Replace portrait images for every token on the canvas',
        group: 'replace',
        order: 40,
        moduleId: MODULE.ID,
        visible: () => game.user.isGM,
        onClick: () => TokenImageReplacementWindow.runUpdateCanvas(ImageCacheManager.MODES.PORTRAIT, 'Portrait')
    });

    blacksmith.registerSecondaryBarItem(SECONDARY_BAR_ID, SECONDARY_BAR_ITEMS.TILE, {
        icon: 'fa-solid fa-map',
        label: 'Place Image',
        tooltip: 'Place Images as Tiles or Pins',
        group: 'place',
        order: 10,
        moduleId: MODULE.ID,
        visible: () => game.user.isGM,
        onClick: () => TileImageWindow.openWindow()
    });
}

function initializeCurator(blacksmith) {
    HookManager.initialize();
    ImageCacheManager.initialize();
    TokenImageUtilities.initialize();

    // Warn GM if Convert to Loot is enabled but Item Piles is not active
    if (game.user.isGM) {
        const lootEnabled = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenConvertDeadToLoot', false);
        if (lootEnabled && !game.modules.get('item-piles')?.active) {
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, "Curator: Convert to Loot is enabled in settings, but the Item Piles module is not active. Tokens will not be converted to loot piles. Please install and enable Item Piles, or disable Convert to Loot in Curator settings.", "", false, true);
        }
    }

    registerMenubarIntegration(blacksmith).catch((error) => {
        console.error(`${MODULE.TITLE} | Menubar integration failed:`, error);
    });

    if (typeof blacksmith.registerToolbarTool === 'function') {
        blacksmith.registerToolbarTool('token-replacement', {
            icon: 'fa-solid fa-images',
            name: 'token-replacement',
            title: 'Token Image Replacement',
            button: true,
            visible: () => BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', true),
            gmOnly: true,
            onCoffeePub: true,
            onFoundry: () => BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', false),
            onClick: () => TokenImageReplacementWindow.openWindow(),
            moduleId: MODULE.ID,
            zone: 'gmtools',
            order: 20
        });
    }

    const module = game.modules.get(MODULE.ID);
    if (module) {
        module.api = {
            getCombatContextMenuItems(context) {
                const { combat, combatantId, canvasToken, x, y } = context || {};
                // The window opens against whatever token is selected, so both
                // rows select the combatant's token first and differ only in
                // which library the window opens in.
                const openFor = async (mode) => {
                    if (!canvasToken) return;
                    try {
                        if (blacksmith.panToCombatant && combat && combatantId) {
                            await blacksmith.panToCombatant(combatantId, { selectToken: true });
                            const token = canvas.tokens?.placeables.find(t => t.id === canvasToken.id);
                            if (token) token.control({ releaseOthers: true });
                        }
                    } catch (_e) {}
                    await TokenImageReplacementWindow.openWindow({ mode });
                };
                return [
                    {
                        name: 'Replace Token',
                        icon: 'fa-solid fa-image',
                        disabled: !canvasToken,
                        callback: () => openFor(ImageCacheManager.MODES.TOKEN)
                    },
                    {
                        name: 'Replace Portrait',
                        icon: 'fa-solid fa-image-portrait',
                        disabled: !canvasToken,
                        callback: () => openFor(ImageCacheManager.MODES.PORTRAIT)
                    }
                ];
            },
            registerImageTileContextMenuItem: ImageCacheManager.registerImageTileContextMenuItem.bind(ImageCacheManager),
            unregisterImageTileContextMenuItem: ImageCacheManager.unregisterImageTileContextMenuItem.bind(ImageCacheManager),
            openReplacementWindow: (opts) => TokenImageReplacementWindow.openWindow(opts),
            openTileWindow: () => TileImageWindow.openWindow()
        };
    }
}
