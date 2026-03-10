// ==================================================================
// ===== CURATOR - ENTRY POINT ==================================
// ==================================================================

import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { TokenImageUtilities } from './token-image-utilities.js';
import { TokenImageReplacementWindow } from './token-image-replacement.js';
import { registerSettings } from './settings.js';
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async function () {
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

    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) {
        console.warn(`${MODULE.TITLE} | Blacksmith not found; skipping registration.`);
        return;
    }

    registerSettings(blacksmith);

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

function initializeCurator(blacksmith) {
    HookManager.initialize();
    ImageCacheManager.initialize();
    TokenImageUtilities.initialize();

    blacksmith.registerMenubarTool('replacetoken', {
        icon: 'fa-solid fa-images',
        name: 'replacetoken',
        title: 'Replace Token',
        tooltip: null,
        onClick: () => TokenImageReplacementWindow.openWindow({ mode: 'token' }),
        zone: 'middle',
        group: 'utility',
        groupOrder: blacksmith.GROUP_ORDER?.UTILITY ?? 50,
        order: 2,
        moduleId: MODULE.ID,
        gmOnly: true,
        leaderOnly: false,
        visible: true,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    blacksmith.registerMenubarTool('replaceportrait', {
        icon: 'fa-solid fa-portrait',
        name: 'replaceportrait',
        title: 'Replace Portrait',
        tooltip: null,
        onClick: () => TokenImageReplacementWindow.openWindow({ mode: 'portrait' }),
        zone: 'middle',
        group: 'utility',
        groupOrder: blacksmith.GROUP_ORDER?.UTILITY ?? 50,
        order: 3,
        moduleId: MODULE.ID,
        gmOnly: true,
        leaderOnly: false,
        visible: true,
        toggleable: false,
        active: false,
        iconColor: null,
        buttonNormalTint: null,
        buttonSelectedTint: null
    });

    // Right-click context menus for Replace Token / Replace Portrait menubar tools (Blacksmith API)
    const ContextMenu = blacksmith?.uiContextMenu;
    if (ContextMenu && typeof ContextMenu.show === 'function') {
        document.addEventListener('contextmenu', (event) => {
            const tokenBtn = event.target?.closest?.('[title="Replace Token"]');
            const portraitBtn = event.target?.closest?.('[title="Replace Portrait"]');
            const mode = tokenBtn ? 'token' : (portraitBtn ? 'portrait' : null);
            if (!mode) return;

            event.preventDefault();
            event.stopPropagation();

            const label = mode === 'token' ? 'Token' : 'Portrait';
            ContextMenu.show({
                id: `${MODULE.ID}-menubar-context-${mode}`,
                x: event.clientX,
                y: event.clientY,
                zones: [
                    {
                        name: `Open Replace ${label} Images`,
                        icon: mode === 'token' ? 'fa-solid fa-images' : 'fa-solid fa-portrait',
                        callback: () => TokenImageReplacementWindow.openWindow({ mode })
                    },
                    {
                        name: `Replace Canvas ${label} Images`,
                        icon: 'fa-solid fa-sync',
                        callback: () => TokenImageReplacementWindow.runUpdateCanvas(mode, label)
                    }
                ],
                zoneClass: 'core'
            });
        }, true);
    }

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
                const items = [];
                items.push({
                    name: 'Replace Image',
                    icon: 'fa-solid fa-image',
                    disabled: !canvasToken,
                    callback: async () => {
                        if (!canvasToken) return;
                        try {
                            if (blacksmith.panToCombatant && combat && combatantId) {
                                await blacksmith.panToCombatant(combatantId, { selectToken: true });
                                const token = canvas.tokens?.placeables.find(t => t.id === canvasToken.id);
                                if (token) token.control({ releaseOthers: true });
                            }
                        } catch (_e) {}
                        await TokenImageReplacementWindow.openWindow();
                    }
                });
                return items;
            },
            registerImageTileContextMenuItem: ImageCacheManager.registerImageTileContextMenuItem.bind(ImageCacheManager),
            unregisterImageTileContextMenuItem: ImageCacheManager.unregisterImageTileContextMenuItem.bind(ImageCacheManager),
            openReplacementWindow: (opts) => TokenImageReplacementWindow.openWindow(opts)
        };
    }
}
