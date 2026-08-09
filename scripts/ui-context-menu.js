// ==================================================================
// ===== UI CONTEXT MENU — accessor for Blacksmith's shared menu =====
// ==================================================================
//
// This file used to be a 276-line fork of Blacksmith's UIContextMenu. It was
// deleted on 2026-08-08 after Blacksmith found it carrying four bugs they had
// already fixed upstream: dismissal bound in the bubble phase (trapped open by
// any consumer calling stopPropagation), Escape closing the window instead of
// the menu, a 150ms arming delay that swallowed genuine outside clicks, and no
// height cap so a long menu ran off the screen unreachable.
//
// A diff confirmed the fork contained nothing the shared version lacked — the
// only lines unique to it were the four defects. Do not reintroduce a copy. If
// Curator needs behaviour the shared menu does not have, that is a change to
// Blacksmith's, not a reason to fork again.
//
// Surface: documentation/api/api-contextmenu.md in Blacksmith.

import { MODULE } from './const.js';

function api() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.uiContextMenu ?? null;
}

export const UIContextMenu = {
    show(options) {
        const menu = api();
        if (!menu) {
            console.warn(`${MODULE.TITLE} | Blacksmith uiContextMenu unavailable; no menu shown.`);
            return null;
        }
        return menu.show(options);
    },

    close(id) {
        return api()?.close(id) ?? null;
    },

    closeAll() {
        return api()?.closeAll() ?? null;
    }
};
