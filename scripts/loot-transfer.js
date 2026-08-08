// ==================================================================
// ===== TEMPORARY — DELETE WHEN BLACKSMITH SHIPS api.inventory =====
// ==================================================================
//
// documentation/plan-loot.md section 4 forbids a second permanent item-transfer
// engine in Curator. This file is the temporary adapter that rule allows: it is
// written to Blacksmith's proposed api.inventory contract exactly — same call
// shape, same success shape, same error codes — so retiring it is deleting this
// file, not rewriting call sites.
//
// Every entry point already prefers blacksmith.inventory when it exists, so the
// day Blacksmith ships, the local implementation below stops executing on its
// own. Do not add Curator-specific behavior here. Authorization, recipient
// policy, distance, and notifications live in manager-loot.js.

import { MODULE } from './const.js';

// Matches the primitive's whitelist. Anything else is ITEM_NOT_TRANSFERABLE.
export const PHYSICAL_TYPES = Object.freeze(new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']));

export const DENOMINATIONS = Object.freeze(['cp', 'sp', 'ep', 'gp', 'pp']);

// dnd5e clears these on its own drop path (_onDropResetData). A raw create does
// not, so a transferred weapon would arrive already equipped and an attuned item
// would land attuned without consuming a slot.
const RESET_PATHS = ['equipped', 'attuned', 'prepared', 'crew.value'];

// actorUuid -> promise resolved when the current holder releases it.
const _locks = new Map();

function _sharedApi() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.inventory ?? null;
}

/**
 * Run fn while holding every named Actor lock.
 *
 * Locks key on Actor UUID rather than Item id: an item-level lock covers neither
 * Take All against one corpse from two clients nor currency, which has no item.
 * Every lock is installed in one synchronous step, so two transfers can never
 * hold each other's locks crosswise.
 */
function _withLocks(uuids, fn) {
    const keys = [...new Set(uuids.filter(Boolean))].sort();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const waitFor = keys.map((key) => _locks.get(key) ?? Promise.resolve());
    for (const key of keys) _locks.set(key, held);

    return Promise.allSettled(waitFor)
        .then(fn)
        .finally(() => {
            for (const key of keys) if (_locks.get(key) === held) _locks.delete(key);
            release();
        });
}

function _quantityOf(item) {
    const raw = item?.system?.quantity;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function _identity(item) {
    const source = item.toObject();
    const system = foundry.utils.deepClone(source.system ?? {});
    delete system.quantity;
    for (const path of RESET_PATHS) {
        const parts = path.split('.');
        const leaf = parts.pop();
        let node = system;
        for (const part of parts) node = node?.[part];
        if (node) delete node[leaf];
    }
    return { system, flags: source.flags ?? {}, stats: source._stats ?? {} };
}

/**
 * Merge only when the two rows are the same thing in every respect that is not
 * the quantity being added. Comparing the whole of `system` rather than a field
 * list means nothing has to be remembered when dnd5e adds a field. Any
 * unresolvable difference falls to a separate row — never to an error.
 */
function _canMerge(candidate, item) {
    if (candidate.name !== item.name || candidate.type !== item.type) return false;
    if (_quantityOf(candidate) === null || _quantityOf(item) === null) return false;
    if (candidate.appliedEnchantments?.length || item.appliedEnchantments?.length) return false;

    const a = _identity(candidate);
    const b = _identity(item);

    const sourceA = a.stats?.compendiumSource ?? candidate.flags?.dnd5e?.sourceId ?? null;
    const sourceB = b.stats?.compendiumSource ?? item.flags?.dnd5e?.sourceId ?? null;
    if (sourceA && sourceB && sourceA !== sourceB) return false;
    if (Boolean(sourceA) !== Boolean(sourceB)) return false;

    return foundry.utils.objectsEqual(a.system, b.system) && foundry.utils.objectsEqual(a.flags, b.flags);
}

function _stripForCreate(item, quantity) {
    const data = item.toObject();
    delete data._id;
    delete data.folder;
    delete data.ownership;
    delete data.sort;
    if (data.system) {
        delete data.system.equipped;
        delete data.system.attuned;
        delete data.system.prepared;
        if (data.system.crew) delete data.system.crew.value;
        // A new row starts loose. Container ids do not survive an Actor boundary.
        delete data.system.container;
        if (quantity !== null) data.system.quantity = quantity;
    }
    return data;
}

async function _transferItem({ sourceActorUuid, targetActorUuid, itemId, quantity }) {
    if (sourceActorUuid === targetActorUuid) return { ok: false, code: 'SAME_ACTOR' };

    const source = await fromUuid(sourceActorUuid);
    if (!source) return { ok: false, code: 'SOURCE_ACTOR_NOT_FOUND' };
    const target = await fromUuid(targetActorUuid);
    if (!target) return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };

    const item = source.items?.get(itemId);
    if (!item) return { ok: false, code: 'SOURCE_ITEM_NOT_FOUND' };
    if (!PHYSICAL_TYPES.has(item.type)) return { ok: false, code: 'ITEM_NOT_TRANSFERABLE' };

    if (item.type === 'container') {
        const contentCount = source.items.filter((i) => i.system?.container === item.id).length;
        if (contentCount > 0) return { ok: false, code: 'CONTAINER_HAS_CONTENTS', contentCount };
    }

    // Stackability is read off the resolved document. A caller-supplied flag here
    // would destroy a stack when it is wrong.
    const available = _quantityOf(item);
    let moving = null;
    if (available !== null) {
        moving = Math.trunc(Number(quantity ?? available));
        if (!Number.isFinite(moving) || moving < 1) return { ok: false, code: 'INVALID_QUANTITY' };
        if (moving > available) return { ok: false, code: 'INSUFFICIENT_QUANTITY', requested: moving, available };
    }

    // Create on the target first. The opposite order fails toward a vanished
    // item; this order fails toward a visible duplicate, which is recoverable.
    let targetItemId = null;
    let merged = false;
    const mergeInto = moving === null ? null : target.items?.find((candidate) => _canMerge(candidate, item));

    try {
        if (mergeInto) {
            await mergeInto.update({ 'system.quantity': _quantityOf(mergeInto) + moving });
            targetItemId = mergeInto.id;
            merged = true;
        } else {
            const [created] = await target.createEmbeddedDocuments('Item', [_stripForCreate(item, moving)]);
            if (!created) return { ok: false, code: 'TARGET_CREATE_FAILED' };
            targetItemId = created.id;
        }
    } catch (error) {
        console.error(`${MODULE.TITLE} | Transfer target create failed:`, error);
        return { ok: false, code: 'TARGET_CREATE_FAILED' };
    }

    let sourceRemaining = 0;
    let sourceDeleted = false;
    try {
        if (moving === null || moving >= available) {
            await item.delete();
            sourceDeleted = true;
        } else {
            sourceRemaining = available - moving;
            await item.update({ 'system.quantity': sourceRemaining });
        }
    } catch (error) {
        console.error(`${MODULE.TITLE} | Transfer source update failed:`, error);
        try {
            if (merged) await mergeInto.update({ 'system.quantity': _quantityOf(mergeInto) - moving });
            else await target.deleteEmbeddedDocuments('Item', [targetItemId]);
        } catch (rollbackError) {
            console.error(`${MODULE.TITLE} | Transfer rollback failed:`, rollbackError);
            return { ok: false, code: 'ROLLBACK_FAILED', targetItemId, available };
        }
        return { ok: false, code: 'SOURCE_UPDATE_FAILED', targetItemId, available };
    }

    return {
        ok: true,
        sourceItemId: itemId,
        targetItemId,
        quantity: moving ?? 1,
        sourceRemaining,
        sourceDeleted,
        merged
    };
}

async function _transferCurrency({ sourceActorUuid, targetActorUuid, currency }) {
    if (sourceActorUuid === targetActorUuid) return { ok: false, code: 'SAME_ACTOR' };

    const source = await fromUuid(sourceActorUuid);
    if (!source) return { ok: false, code: 'SOURCE_ACTOR_NOT_FOUND' };
    const target = await fromUuid(targetActorUuid);
    if (!target) return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };

    // Deltas, never absolute totals, and no denomination conversion: paying 2 gp
    // from a purse of 20 sp fails rather than silently exchanging.
    const deltas = {};
    for (const denom of DENOMINATIONS) {
        const amount = Math.trunc(Number(currency?.[denom] ?? 0));
        if (!amount) continue;
        if (!Number.isFinite(amount) || amount < 0) return { ok: false, code: 'INVALID_QUANTITY' };
        const held = Math.trunc(Number(source.system?.currency?.[denom] ?? 0));
        if (amount > held) return { ok: false, code: 'INSUFFICIENT_CURRENCY', denomination: denom, requested: amount, available: held };
        deltas[denom] = amount;
    }
    if (!Object.keys(deltas).length) return { ok: false, code: 'INVALID_QUANTITY' };

    const targetUpdate = {};
    const sourceUpdate = {};
    for (const [denom, amount] of Object.entries(deltas)) {
        targetUpdate[`system.currency.${denom}`] = Math.trunc(Number(target.system?.currency?.[denom] ?? 0)) + amount;
        sourceUpdate[`system.currency.${denom}`] = Math.trunc(Number(source.system?.currency?.[denom] ?? 0)) - amount;
    }

    try {
        await target.update(targetUpdate);
    } catch (error) {
        console.error(`${MODULE.TITLE} | Currency target update failed:`, error);
        return { ok: false, code: 'TARGET_CREATE_FAILED' };
    }

    try {
        await source.update(sourceUpdate);
    } catch (error) {
        console.error(`${MODULE.TITLE} | Currency source update failed:`, error);
        const rollback = {};
        for (const [denom, amount] of Object.entries(deltas)) {
            rollback[`system.currency.${denom}`] = Math.trunc(Number(target.system?.currency?.[denom] ?? 0)) - amount;
        }
        try {
            await target.update(rollback);
        } catch (rollbackError) {
            console.error(`${MODULE.TITLE} | Currency rollback failed:`, rollbackError);
            return { ok: false, code: 'ROLLBACK_FAILED' };
        }
        return { ok: false, code: 'SOURCE_UPDATE_FAILED' };
    }

    return { ok: true, currency: deltas };
}

export async function transferItem(request) {
    const shared = _sharedApi();
    if (typeof shared?.transferItem === 'function') return shared.transferItem(request);
    return _withLocks([request.sourceActorUuid, request.targetActorUuid], () => _transferItem(request));
}

export async function transferCurrency(request) {
    const shared = _sharedApi();
    if (typeof shared?.transferCurrency === 'function') return shared.transferCurrency(request);
    return _withLocks([request.sourceActorUuid, request.targetActorUuid], () => _transferCurrency(request));
}

/** True once Blacksmith owns the mutation and this file is dead weight. */
export function usingSharedApi() {
    return typeof _sharedApi()?.transferItem === 'function';
}
