// Thin accessor for Blacksmith's api.inventory.
//
// Curator owns authorization, recipient policy, and messaging; Blacksmith owns
// every document mutation. Nothing here may grow logic — if a call needs
// wrapping, it belongs in manager-loot.js.
//
// This replaces loot-transfer.js, the temporary adapter that documentation/plans/plan-loot.md
// section 4 allowed while api.inventory was in development. That file is deleted.

import { MODULE } from './const.js';

const FALLBACK_PHYSICAL_TYPES = ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'];
const FALLBACK_DENOMINATIONS = ['cp', 'sp', 'ep', 'gp', 'pp'];

export function inventoryApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.inventory ?? null;
}

export function isInventoryReady() {
    return typeof inventoryApi()?.transferItem === 'function';
}

/** Whether the batch grant form is available. Loot generation needs it. */
export function hasBatchGrant() {
    return typeof inventoryApi()?.grantItems === 'function';
}

/**
 * Blacksmith publishes the whitelist, so Curator does not keep a second copy that
 * could drift. The fallback only covers the window rendering before the API loads.
 */
export function physicalTypes() {
    const types = inventoryApi()?.PHYSICAL_TYPES ?? FALLBACK_PHYSICAL_TYPES;
    return Array.isArray(types) ? types : [...types];
}

export function isPhysical(type) {
    return physicalTypes().includes(type);
}

export function denominations() {
    const denoms = inventoryApi()?.DENOMINATIONS ?? FALLBACK_DENOMINATIONS;
    return Array.isArray(denoms) ? denoms : [...denoms];
}

function unavailable(operation) {
    console.error(`${MODULE.TITLE} | api.inventory is unavailable; ${operation} refused.`);
    return { ok: false, code: 'INVENTORY_UNAVAILABLE' };
}

export async function transferItem(request) {
    const api = inventoryApi();
    if (typeof api?.transferItem !== 'function') return unavailable('transferItem');
    return api.transferItem(request);
}

export async function transferItems(request) {
    const api = inventoryApi();
    if (typeof api?.transferItems !== 'function') return unavailable('transferItems');
    return api.transferItems(request);
}

/** Whether the batch transfer form is available. Take All requires it. */
export function hasBatchTransfer() {
    return typeof inventoryApi()?.transferItems === 'function';
}

export async function transferCurrency(request) {
    const api = inventoryApi();
    if (typeof api?.transferCurrency !== 'function') return unavailable('transferCurrency');
    return api.transferCurrency(request);
}

export async function grantItems(request) {
    const api = inventoryApi();
    if (typeof api?.grantItems !== 'function') return unavailable('grantItems');
    return api.grantItems(request);
}

export async function grantCurrency(request) {
    const api = inventoryApi();
    if (typeof api?.grantCurrency !== 'function') return unavailable('grantCurrency');
    return api.grantCurrency(request);
}
