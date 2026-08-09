// ==================================================================
// ===== HOOK MANAGER — accessor for Blacksmith's shared manager =====
// ==================================================================
//
// This file used to be a 520-line fork of Blacksmith's HookManager, 86% identical
// and missing three fixes that had landed upstream:
//
//   1. `renderChatMessage` was not remapped to `renderChatMessageHTML`, so a
//      registration attached to a hook Foundry v13 deprecated.
//   2. Returning false from a `pre*` hook only cancelled `preUpdateToken`. Every
//      other `pre*` hook silently could not be cancelled.
//   3. Context was not recorded on the callback record, so Curator's hooks all
//      reported as context "default" in Blacksmith's hook stats tooling — the one
//      thing that tooling exists to show.
//
// Deleted 2026-08-08, alongside the same-shaped fork of ui-context-menu.js. A copy
// taken before a fix keeps the problem and cannot pick up anything that lands
// later. If Curator needs behaviour the shared manager lacks, that is a change to
// Blacksmith's, not a reason to fork again.
//
// Surface: documentation/api/api-hookmanager.md in Blacksmith.

import '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { MODULE } from './const.js';

function shared() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.HookManager
        ?? globalThis.BlacksmithHookManager
        ?? null;
}

function call(method, args, fallback = null) {
    const manager = shared();
    if (typeof manager?.[method] !== 'function') {
        console.warn(`${MODULE.TITLE} | Blacksmith HookManager unavailable; ${method} skipped.`);
        return fallback;
    }
    return manager[method](...args);
}

export const HookManager = {
    // Blacksmith initialises its own manager; kept so existing call sites read the
    // same and so nothing here silently becomes a second lifecycle.
    initialize: () => undefined,
    registerHook: (...args) => call('registerHook', args),
    unregisterHook: (...args) => call('unregisterHook', args, false),
    disposeByContext: (...args) => call('disposeByContext', args, 0),
    removeCallback: (...args) => call('removeCallback', args, false),
    getStats: (...args) => call('getStats', args, null),
    showHooks: (...args) => call('showHooks', args, null),
    showHookDetails: (...args) => call('showHookDetails', args, null)
};
