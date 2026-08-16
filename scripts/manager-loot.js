import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { LootWindow } from './window-loot.js';
import { notify } from './notifications.js';
import { transferItem, transferItems, transferCurrency, isPhysical, denominations } from './loot-inventory.js';
import { isTokenAlive } from './document-liveness.js';

// Shared teardown handle for every claim and hook this manager registers.
const CONTEXT = 'curator-loot';

const CHANNEL = `module.${MODULE.ID}`;
const REQUEST = 'lootRequest';
const RESPONSE = 'lootResponse';
const REFRESH = 'lootRefresh';
const PRESENCE = 'lootPresence';
const NOTICE = 'lootNotice';

// A player request that never reaches an answering GM must fail, not hang.
const REQUEST_TIMEOUT_MS = 20000;

// The loot card's row action, matching what token-image-utilities.js composes.
const CARD_ACTION = 'open-loot';

export class LootManager {
    static FLAG = 'loot';
    static STATES = Object.freeze({ PREPARING: 'preparing', READY: 'ready', EMPTY: 'empty' });

    static _interactionId = null;
    static _pending = new Map();
    // tokenUuid -> Map(userId -> { name, img }). Who has a loot window open right now.
    static _presence = new Map();
    // Ledger writes are read-modify-write, and requests are handled concurrently,
    // so they are chained rather than racing each other.
    static _ledgerWrites = Promise.resolve();

    static initialize() {
        this._registerTokenInteraction();
        this._registerCardAction();
        this._registerSocket();
        this._registerPresenceCleanup();
    }

    static teardown() {
        const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
        chatCards?.unregisterAction?.(MODULE.ID, CARD_ACTION);

        const tokens = this._tokensApi();
        if (this._interactionId && typeof tokens?.disposeByContext === 'function') {
            tokens.disposeByContext(CONTEXT);
        }
        this._interactionId = null;
        HookManager.disposeByContext(CONTEXT);
    }

    /** World settings are policy; read them through one place. */
    static setting(key, fallback) {
        try {
            return game.settings.get(MODULE.ID, key);
        } catch (_error) {
            return fallback;
        }
    }

    static get sendToPartyEnabled() { return this.setting('lootSendToParty', true) !== false; }
    static get sendToPlayerEnabled() { return this.setting('lootSendToPlayer', true) !== false; }

    static _tokensApi() {
        return game.modules.get('coffee-pub-blacksmith')?.api?.tokens ?? null;
    }

    // ==============================================================
    // ===== INTERACTION ============================================
    // ==============================================================

    /**
     * The corpse row on the loot card, as a second door into the same window.
     *
     * Registered on every client and not only the GM: a chat message is data, so a
     * handler cannot travel with the card — each client resolves its own at render
     * time, which is why this belongs here rather than beside the post.
     *
     * Unlike the double-click claim there is no `matches` predicate to gate the
     * gesture, so this checks what that predicate would have. A card outlives the
     * body it announces: the row is still sitting in the log after the corpse is
     * emptied, buried or deleted, which makes a stale click ordinary rather than
     * exceptional, and it has to say so instead of doing nothing.
     */
    static _registerCardAction() {
        const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
        if (typeof chatCards?.registerAction !== 'function') return;

        chatCards.registerAction(MODULE.ID, CARD_ACTION, async ({ value }) => {
            const tokenDocument = value ? await fromUuid(value) : null;
            if (!tokenDocument) {
                notify.warn('That body is no longer here.');
                return;
            }
            if (!this.canOpen(tokenDocument)) {
                notify.warn(`There is nothing left to take from ${tokenDocument.name}.`);
                return;
            }
            this.openSafely(tokenDocument);
        });
    }

    /**
     * Claim double-click on lootable corpses through Blacksmith.
     *
     * Foundry emits no token double-click hook, and the permission predicate runs
     * before the handler, so a corpse is unreachable for a player without LIMITED on
     * the Actor unless the predicate itself is relaxed. Only Blacksmith can do that.
     * See documentation/plans/plan-loot.md section 6.
     */
    static _registerTokenInteraction() {
        const tokens = this._tokensApi();
        if (typeof tokens?.registerInteraction !== 'function') {
            // The registry is unreleased in Blacksmith. The loot card is the entry
            // point until it lands, so this is not a user-facing problem and must not
            // produce a user-facing warning.
            console.debug(`${MODULE.TITLE} | Blacksmith token interaction registry unavailable; loot card only.`);
            return;
        }

        try {
            this._interactionId = tokens.registerInteraction({
                id: 'curator-loot',
                module: MODULE.ID,
                gesture: 'clickLeft2',
                priority: 2,
                // MUST stay synchronous and MUST return the same answer twice in a row.
                // Foundry's permission predicate is synchronous and a promise is truthy,
                // so an async matcher would grant every double-click unconditionally.
                // Blacksmith evaluates permission and dispatch separately and re-checks
                // between them, so anything transient here produces a dead gesture.
                // Keep it a plain flag read: eligibility, distance, and UUID resolution
                // belong in open() and in the GM handler.
                matches: (tokenDocument) => this.canOpen(tokenDocument),
                bypassPermission: true,
                // A throwing handler is a dead gesture by design — Blacksmith will not
                // fall through to Foundry once permission has been relaxed, because that
                // would open the Actor sheet to a player who cannot otherwise open it.
                handler: (token) => this.openSafely(token?.document),
                context: CONTEXT
            });
        } catch (error) {
            console.error(`${MODULE.TITLE} | Failed to claim token double-click:`, error);
        }
    }

    /**
     * Open without ever throwing or returning a rejected promise. open() is async, so
     * a try/catch alone would not contain a rejection.
     */
    static openSafely(tokenDocument) {
        try {
            const opening = this.open(tokenDocument);
            if (typeof opening?.catch === 'function') {
                opening.catch((error) => this._reportOpenFailure(error));
            }
        } catch (error) {
            this._reportOpenFailure(error);
        }
    }

    static _reportOpenFailure(error) {
        console.error(`${MODULE.TITLE} | Failed to open the loot window:`, error);
        notify.error('Could not open the loot window.');
    }

    /**
     * Both gates are re-checked on the GM before anything moves. These are here so a
     * refusal arrives as a message at the door rather than as a window that opens and
     * then fails on every action — they are the explanation, not the guard.
     */
    static checkAccess(tokenDocument, user = game.user) {
        if (user.isGM) return { ok: true };
        if (game.combat?.started && this.setting('lootAllowInCombat', false) !== true) {
            return { ok: false, code: 'COMBAT_ACTIVE' };
        }
        return this._proximityCheck(tokenDocument, user);
    }

    static open(tokenDocument) {
        if (!this.canOpen(tokenDocument)) return null;

        const access = this.checkAccess(tokenDocument);
        if (!access.ok) {
            notify.warn(access.code === 'COMBAT_ACTIVE'
                ? 'You cannot loot while combat is under way.'
                : `${tokenDocument.name} is too far away — you need to be within ${access.limit} feet.`);
            return null;
        }

        return LootWindow.open(tokenDocument);
    }

    // ==============================================================
    // ===== STATE ==================================================
    // ==============================================================

    static getState(tokenDocument) {
        return tokenDocument?.getFlag(MODULE.ID, this.FLAG) ?? null;
    }

    /** Can things still be taken from it. */
    static isLootable(tokenDocument) {
        return this.getState(tokenDocument)?.state === this.STATES.READY;
    }

    /**
     * Can the window be opened at all.
     *
     * An emptied body still opens while it has a ledger, because the record of who
     * took what is the reason anyone reopens a picked-clean corpse. One with nothing
     * left *and* nothing to show — a body re-killed after a previous life was looted,
     * whose ledger went with the revival — is not offered.
     */
    static canOpen(tokenDocument) {
        const state = this.getState(tokenDocument);
        if (state?.state === this.STATES.READY) return true;
        return state?.state === this.STATES.EMPTY && this.getTaken(tokenDocument).length > 0;
    }

    static async markPreparing(tokenDocument) {
        const generationId = foundry.utils.randomID();
        await tokenDocument.setFlag(MODULE.ID, this.FLAG, {
            enabled: true,
            state: this.STATES.PREPARING,
            preparedAt: Date.now(),
            preparedBy: game.user.id,
            sourceActorUuid: tokenDocument.actor?.uuid ?? null,
            generationId
        });
        return generationId;
    }

    /**
     * Settle a prepared corpse into `ready` or `empty`.
     *
     * Generation happens once per token, ever — a revived creature does not grow a
     * new sword to replace the one taken from it, and clearing the marker on revival
     * would make kill-loot-heal-kill an infinite loot faucet, which ordinary combat
     * healing reaches without anyone trying.
     *
     * @returns {string|false} the state settled on, or false if this generation is stale
     */
    static async markReady(tokenDocument, generationId) {
        const state = this.getState(tokenDocument);
        if (!state || state.generationId !== generationId) return false;
        const settled = this._remainingOn(tokenDocument.actor).empty ? this.STATES.EMPTY : this.STATES.READY;
        await tokenDocument.setFlag(MODULE.ID, this.FLAG, {
            ...state,
            state: settled,
            preparedAt: Date.now()
        });
        return settled;
    }

    /** Nothing left to take. The ledger stays, so the record survives. */
    static async markEmpty(tokenDocument) {
        const state = this.getState(tokenDocument);
        if (!state || state.state === this.STATES.EMPTY) return false;
        await tokenDocument.setFlag(MODULE.ID, this.FLAG, { ...state, state: this.STATES.EMPTY });
        return true;
    }

    /**
     * Who took what, on the Token document rather than in window memory.
     *
     * Authoritative, shared by every client for free, and still correct for a window
     * opened after the fact — none of which a per-window snapshot manages.
     */
    static getTaken(tokenDocument) {
        const taken = this.getState(tokenDocument)?.taken;
        return Array.isArray(taken) ? taken : [];
    }

    /** The row order the body had before anything was taken from it. */
    static getOrder(tokenDocument) {
        const order = this.getState(tokenDocument)?.order;
        return Array.isArray(order) ? order : [];
    }

    /**
     * @param {string[]} order Item ids as they stood *before* this transfer. Stored
     *   once, on the first take, so a looted row can keep its original position
     *   rather than sliding to the end. Live indices shift as rows are removed, so
     *   they cannot be used for this.
     */
    static recordTaken(tokenDocument, entries, order = []) {
        if (!entries.length) return this._ledgerWrites;
        this._ledgerWrites = this._ledgerWrites.then(async () => {
            const state = this.getState(tokenDocument);
            if (!state) return;
            const taken = Array.isArray(state.taken) ? state.taken : [];
            await tokenDocument.setFlag(MODULE.ID, this.FLAG, {
                ...state,
                order: Array.isArray(state.order) && state.order.length ? state.order : order,
                taken: [...taken, ...entries]
            });
        }).catch((error) => console.error(`${MODULE.TITLE} | Could not record looted items:`, error));
        return this._ledgerWrites;
    }

    static _currentOrder(corpse) {
        return corpse.items.filter((item) => isPhysical(item.type)).map((item) => item.id);
    }

    static _snapshot(item, takerName) {
        return {
            itemId: item.id,
            name: item.name,
            img: item.img,
            type: item.type,
            typeLabel: item.type?.charAt(0).toUpperCase() + item.type?.slice(1),
            // Recorded so a looted row stays nested under the bag it came out of.
            containerId: item.system?.container ?? null,
            by: takerName
        };
    }

    static async clear(tokenDocument) {
        if (tokenDocument?.getFlag(MODULE.ID, this.FLAG) !== undefined) {
            await tokenDocument.unsetFlag(MODULE.ID, this.FLAG);
        }
        LootWindow.closeForToken(tokenDocument?.uuid);
    }

    // ==============================================================
    // ===== RECIPIENT POLICY =======================================
    // ==============================================================
    // Curator owns who may receive loot. Blacksmith must never decide this.

    /** The dnd5e primary party Group Actor, which carries its own inventory. */
    static getPartyActor() {
        const party = game.actors?.party ?? null;
        return party?.type === 'group' ? party : null;
    }

    /** Character Actors in the primary party, or every player character if none is set. */
    static getPartyCharacters() {
        const party = this.getPartyActor();
        const members = party?.system?.playerCharacters;
        if (Array.isArray(members) && members.length) return members.filter((a) => a?.type === 'character');
        return game.actors.filter((actor) => actor.type === 'character' && actor.hasPlayerOwner);
    }

    /** Actors this user may take loot *as*. The GM may act as any party character. */
    static getEligibleRecipients() {
        if (game.user.isGM) return this.getPartyCharacters();
        return game.actors.filter((actor) => actor.type === 'character' && actor.isOwner);
    }

    /** Actors this user may hand an item *to*. Any party character, by decision. */
    static getGiftRecipients(excludeUuid) {
        return this.getPartyCharacters().filter((actor) => actor.uuid !== excludeUuid);
    }

    // ==============================================================
    // ===== SOCKET =================================================
    // ==============================================================

    static _registerPresenceCleanup() {
        HookManager.registerHook({
            name: 'userConnected',
            description: 'Curator: drop loot presence for a departing user',
            context: CONTEXT,
            key: 'curator-loot-presence',
            priority: 3,
            callback: (user, connected) => { if (!connected) this._dropUser(user.id); }
        });
    }

    static _registerSocket() {
        game.socket.on(CHANNEL, (data) => {
            if (data?.action === REQUEST) {
                if (!game.user.isGM) return;
                if (!this._isAnsweringGM()) {
                    console.debug(`${MODULE.TITLE} | Loot request "${data.op}" ignored; another GM is answering.`);
                    return;
                }
                // Logged on receipt so a player-side timeout can be told apart from a
                // request that never arrived — the usual cause of the latter is
                // module.json's socket flag not being live yet.
                console.debug(`${MODULE.TITLE} | Loot request "${data.op}" received from ${game.users.get(data.userId)?.name ?? data.userId}.`);
                void this._handleRequest(data);
                return;
            }
            if (data?.action === RESPONSE && data.toUserId === game.user.id) {
                this._pending.get(data.requestId)?.(data.result);
                return;
            }
            if (data?.action === NOTICE) {
                notify.info(data.message);
                return;
            }
            if (data?.action === PRESENCE) {
                this._onPresence(data);
                return;
            }
            if (data?.action === REFRESH) {
                if (data.closed) LootWindow.closeForToken(data.tokenUuid);
                else LootWindow.refreshForToken(data.tokenUuid);
            }
        });
    }

    // ==============================================================
    // ===== PRESENCE ===============================================
    // ==============================================================
    // Peer to peer rather than GM-brokered: this is display only, nothing
    // authoritative hangs off it, and routing it through the GM would make an
    // absent GM look like an empty room.

    static getLooters(tokenUuid, { excludeSelf = true } = {}) {
        const room = this._presence.get(tokenUuid);
        if (!room) return [];
        return [...room.entries()]
            .filter(([userId]) => !excludeSelf || userId !== game.user.id)
            .map(([userId, entry]) => ({ userId, ...entry }));
    }

    /** What this client looks like to everyone else in the room. */
    static _selfPresence(tokenUuid) {
        const actor = LootWindow.recipientFor(tokenUuid);
        return {
            name: actor?.name ?? game.user.name,
            img: actor?.img ?? game.user.avatar ?? 'icons/svg/mystery-man.svg'
        };
    }

    static announcePresence(tokenUuid) {
        this._setPresence(tokenUuid, game.user.id, this._selfPresence(tokenUuid));
        game.socket.emit(CHANNEL, { action: PRESENCE, state: 'open', tokenUuid, userId: game.user.id, ...this._selfPresence(tokenUuid) });
        // Ask anyone already here to announce, so a late arrival sees the room.
        game.socket.emit(CHANNEL, { action: PRESENCE, state: 'ping', tokenUuid, userId: game.user.id });
    }

    static clearPresence(tokenUuid) {
        this._presence.get(tokenUuid)?.delete(game.user.id);
        game.socket.emit(CHANNEL, { action: PRESENCE, state: 'close', tokenUuid, userId: game.user.id });
    }

    static _setPresence(tokenUuid, userId, entry) {
        if (!this._presence.has(tokenUuid)) this._presence.set(tokenUuid, new Map());
        this._presence.get(tokenUuid).set(userId, entry);
    }

    static _onPresence(data) {
        const { state, tokenUuid, userId } = data ?? {};
        if (!tokenUuid || !userId || userId === game.user.id) return;

        if (state === 'close') {
            this._presence.get(tokenUuid)?.delete(userId);
        } else if (state === 'ping') {
            // Only answer if this client is actually in that room.
            if (!LootWindow.isOpenFor(tokenUuid)) return;
            game.socket.emit(CHANNEL, { action: PRESENCE, state: 'open', tokenUuid, userId: game.user.id, ...this._selfPresence(tokenUuid) });
            return;
        } else {
            this._setPresence(tokenUuid, userId, { name: data.name, img: data.img });
        }
        LootWindow.refreshForToken(tokenUuid);
    }

    /** A client that vanishes never sends `close`, so drop it when it disconnects. */
    static _dropUser(userId) {
        for (const [tokenUuid, room] of this._presence) {
            if (room.delete(userId)) LootWindow.refreshForToken(tokenUuid);
        }
    }

    /** Exactly one GM answers, so two connected GMs cannot both mutate. */
    static _isAnsweringGM() {
        const gms = game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id));
        return gms[0]?.id === game.user.id;
    }

    /**
     * Every mutation runs on the authoritative GM. A player request carries only
     * identifiers; the GM re-resolves and revalidates all of them.
     */
    static async request(op, payload) {
        if (game.user.isGM) return this._process(op, payload, game.user.id);

        if (!game.users.some((u) => u.isGM && u.active)) {
            return { ok: false, code: 'NO_ACTIVE_GM' };
        }

        const requestId = foundry.utils.randomID();
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this._pending.delete(requestId);
                resolve({ ok: false, code: 'TIMEOUT' });
            }, REQUEST_TIMEOUT_MS);

            this._pending.set(requestId, (result) => {
                clearTimeout(timeout);
                this._pending.delete(requestId);
                resolve(result);
            });

            game.socket.emit(CHANNEL, { action: REQUEST, requestId, userId: game.user.id, op, payload });
        });
    }

    static async _handleRequest({ requestId, userId, op, payload }) {
        let result;
        try {
            result = await this._process(op, payload, userId);
        } catch (error) {
            console.error(`${MODULE.TITLE} | Loot request "${op}" failed:`, error);
            result = { ok: false, code: 'HANDLER_ERROR' };
        }
        game.socket.emit(CHANNEL, { action: RESPONSE, requestId, toUserId: userId, result });
    }

    /** Runs on the GM only. Never trust anything in payload without re-resolving it. */
    static async _process(op, payload, userId) {
        const user = game.users.get(userId);
        if (!user) return { ok: false, code: 'UNKNOWN_USER' };

        const tokenDocument = payload?.tokenUuid ? await fromUuid(payload.tokenUuid) : null;
        if (!tokenDocument) return { ok: false, code: 'TOKEN_NOT_FOUND' };

        // Bury works on a corpse in any state, but ONLY on a Curator corpse.
        // Without this a client could ask the GM to delete any token on any scene.
        if (op === 'bury') {
            if (!this.getState(tokenDocument)?.enabled) return { ok: false, code: 'NOT_A_CORPSE' };
            return this._processBury(tokenDocument, user, payload);
        }

        const state = this.getState(tokenDocument);
        if (state?.state !== this.STATES.READY) return { ok: false, code: 'NOT_LOOTABLE' };
        if (payload.generationId && payload.generationId !== state.generationId) {
            return { ok: false, code: 'STALE_GENERATION' };
        }

        const corpse = tokenDocument.actor;
        if (!corpse) return { ok: false, code: 'SOURCE_ACTOR_NOT_FOUND' };

        const access = this.checkAccess(tokenDocument, user);
        if (!access.ok) return access;

        let result;
        switch (op) {
            case 'item': result = await this._processItem(tokenDocument, corpse, payload, user); break;
            case 'currency': result = await this._processCurrency(corpse, payload, user); break;
            case 'takeAll': result = await this._processTakeAll(tokenDocument, corpse, payload, user); break;
            case 'distribute': result = await this._processDistribute(corpse, payload); break;
            default: return { ok: false, code: 'UNKNOWN_OPERATION' };
        }

        if (result.ok) {
            // A picked-clean body stops being lootable but keeps its ledger, so it
            // still opens as a record of who took what.
            if (this._remainingOn(corpse).empty) await this.markEmpty(tokenDocument);
            this._broadcastRefresh(tokenDocument.uuid);
            await this._buryIfEmptied(tokenDocument);
        }
        return result;
    }

    static _remainingOn(actor) {
        const items = actor ? actor.items.filter((item) => isPhysical(item.type)).length : 0;
        const coins = denominations().reduce(
            (sum, denom) => sum + Math.trunc(Number(actor?.system?.currency?.[denom] ?? 0)), 0
        );
        return { items, coins, empty: items === 0 && coins === 0 };
    }

    /** Optional tidy-up: a body with nothing left on it leaves the canvas. */
    static async _buryIfEmptied(tokenDocument) {
        if (this.setting('lootBuryWhenEmpty', false) !== true) return;
        if (!this._remainingOn(tokenDocument.actor).empty) return;
        // Reached after the transfer awaits; the body may already be gone.
        if (!isTokenAlive(tokenDocument)) return;
        const name = tokenDocument.name;
        LootWindow.closeForToken(tokenDocument.uuid);
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
        await tokenDocument.delete();
        this.broadcastNotice(`${name} was picked clean and buried.`);
    }

    /** Token centre in pixels, so a large creature is measured from its middle. */
    static _centre(tokenDocument, gridSize) {
        return {
            x: tokenDocument.x + ((tokenDocument.width ?? 1) * gridSize) / 2,
            y: tokenDocument.y + ((tokenDocument.height ?? 1) * gridSize) / 2
        };
    }

    /**
     * Distance is recalculated from current token positions every time. A client
     * cannot be trusted to measure its own range, and either token may have moved
     * since the window opened.
     *
     * Measured against the corpse's **own** scene rather than `canvas.grid`: this runs
     * on the GM, who may be viewing a different scene than the player looting, and
     * canvas.grid would then be the wrong grid entirely.
     */
    static _proximityCheck(tokenDocument, user) {
        const limit = Number(this.setting('lootProximity', 0)) || 0;
        if (limit <= 0) return { ok: true };

        const scene = tokenDocument.parent;
        const gridSize = Number(scene?.grid?.size) || 100;
        const gridDistance = Number(scene?.grid?.distance) || 5;

        const owned = scene?.tokens?.filter((token) => token.actor?.testUserPermission(user, 'OWNER')) ?? [];
        if (!owned.length) return { ok: false, code: 'TOO_FAR', limit };

        const origin = this._centre(tokenDocument, gridSize);
        for (const token of owned) {
            const point = this._centre(token, gridSize);
            const pixels = Math.hypot(origin.x - point.x, origin.y - point.y);
            const distance = (pixels / gridSize) * gridDistance;
            if (distance <= limit) return { ok: true };
        }
        return { ok: false, code: 'TOO_FAR', limit };
    }

    /**
     * A recipient is valid when the requester owns it, or it is a party character,
     * or it is the party Group Actor. Ownership alone is too narrow now that Give To
     * hands items to other players' characters.
     */
    static _validateRecipient(recipientUuid, user, corpse) {
        if (!recipientUuid) return { ok: false, code: 'NO_RECIPIENT' };
        if (corpse?.uuid === recipientUuid) return { ok: false, code: 'SAME_ACTOR' };

        const party = this.getPartyActor();
        if (party?.uuid === recipientUuid) {
            if (!this.sendToPartyEnabled) return { ok: false, code: 'SEND_TO_PARTY_DISABLED' };
            return { ok: true, actorUuid: recipientUuid };
        }

        let actor = null;
        try {
            actor = fromUuidSync(recipientUuid);
        } catch (_error) {
            return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };
        }
        if (!actor || actor.type !== 'character') return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };
        if (user.isGM) return { ok: true, actorUuid: recipientUuid };
        if (actor.testUserPermission(user, 'OWNER')) return { ok: true, actorUuid: recipientUuid };
        // Giving to somebody else's character is the Give To path, so the setting
        // that hides that control must also refuse a crafted request for it.
        if (this.getPartyCharacters().some((member) => member.uuid === recipientUuid)) {
            if (!this.sendToPlayerEnabled) return { ok: false, code: 'SEND_TO_PLAYER_DISABLED' };
            return { ok: true, actorUuid: recipientUuid };
        }
        return { ok: false, code: 'RECIPIENT_NOT_ALLOWED' };
    }

    static async _processItem(tokenDocument, corpse, payload, user) {
        const check = this._validateRecipient(payload.recipientUuid, user, corpse);
        if (!check.ok) return check;

        // Captured before the transfer: a fully-taken row is gone afterwards.
        const item = corpse.items.get(payload.itemId);
        const taker = fromUuidSync(check.actorUuid)?.name ?? 'Someone';
        const snapshot = item ? this._snapshot(item, taker) : null;
        const order = this._currentOrder(corpse);

        const result = await transferItem({
            sourceActorUuid: corpse.uuid,
            targetActorUuid: check.actorUuid,
            itemId: payload.itemId,
            quantity: payload.quantity
        });

        // Only a row that emptied is "looted"; a partial take leaves a live row.
        if (result.ok && result.sourceDeleted && snapshot) {
            await this.recordTaken(tokenDocument, [snapshot], order);
        }
        return result;
    }

    static async _processCurrency(corpse, payload, user) {
        const check = this._validateRecipient(payload.recipientUuid, user, corpse);
        if (!check.ok) return check;
        return transferCurrency({
            sourceActorUuid: corpse.uuid,
            targetActorUuid: check.actorUuid,
            currency: payload.currency
        });
    }

    /**
     * One `transferItems` call, not a loop over `transferItem`: the batch form costs
     * at most two writes per Actor however many rows move, and it validates per item,
     * so a packed container is refused on its own entry while everything else still
     * goes. Currency is a second call because it is a different primitive.
     */
    static async _processTakeAll(tokenDocument, corpse, payload, user) {
        const check = this._validateRecipient(payload.recipientUuid, user, corpse);
        if (!check.ok) return check;

        const taker = fromUuidSync(check.actorUuid)?.name ?? 'Someone';
        const lines = [];
        const taken = [];
        let order = null;

        // Several passes, because a packed container is validated against the state
        // at the start of a call: a bag emptied by this very batch is still "packed"
        // to that call and stays behind. Emptying it first, then taking it, is what a
        // player would do by hand. Bounded, and it stops as soon as a pass moves
        // nothing, so a permanently stuck row cannot loop.
        for (let pass = 0; pass < 4; pass++) {
            const remaining = corpse.items.filter((item) => isPhysical(item.type));
            if (!remaining.length) break;

            order ??= remaining.map((item) => item.id);

            const packed = new Set(
                remaining
                    .filter((item) => remaining.some((child) => child.system?.container === item.id))
                    .map((item) => item.id)
            );
            const movable = remaining.filter((item) => !packed.has(item.id));
            if (!movable.length) break;

            const labels = new Map(movable.map((item) => [item.id, item.name]));
            const snapshots = new Map(movable.map((item) => [item.id, this._snapshot(item, taker)]));

            const batch = await transferItems({
                sourceActorUuid: corpse.uuid,
                targetActorUuid: check.actorUuid,
                items: movable.map((item) => ({ itemId: item.id }))
            });
            // A whole-call rejection has no per-item detail to report.
            if (!Array.isArray(batch?.results)) return pass === 0 ? batch : batch ?? { ok: false, code: 'HANDLER_ERROR' };

            let moved = 0;
            batch.results.forEach((entry, index) => {
                const itemId = entry?.itemId ?? movable[index]?.id;
                lines.push({ label: labels.get(itemId) ?? 'Item', ...entry });
                if (!entry?.ok) return;
                moved += 1;
                if (entry.sourceDeleted && snapshots.has(itemId)) taken.push(snapshots.get(itemId));
            });

            if (!moved) break;
        }

        if (taken.length) await this.recordTaken(tokenDocument, taken, order ?? []);

        const currency = {};
        for (const denom of denominations()) {
            const held = Math.trunc(Number(corpse.system?.currency?.[denom] ?? 0));
            if (held > 0) currency[denom] = held;
        }
        if (Object.keys(currency).length) {
            const result = await transferCurrency({
                sourceActorUuid: corpse.uuid,
                targetActorUuid: check.actorUuid,
                currency
            });
            lines.push({ label: 'Currency', ...result });
        }

        if (!lines.length) return { ok: false, code: 'NOTHING_TO_TAKE' };
        const moved = lines.filter((line) => line.ok).length;
        return { ok: moved > 0, partial: moved !== lines.length, moved, total: lines.length, lines };
    }

    /**
     * Split every denomination evenly across the party. The remainder stays on the
     * corpse rather than being converted or favouring anyone: no automatic
     * denomination conversion, by decision.
     */
    static async _processDistribute(corpse) {
        const members = this.getPartyCharacters().filter((actor) => actor.uuid !== corpse.uuid);
        if (!members.length) return { ok: false, code: 'NO_PARTY_MEMBERS' };

        const share = {};
        let anything = false;
        for (const denom of denominations()) {
            const held = Math.trunc(Number(corpse.system?.currency?.[denom] ?? 0));
            const each = Math.floor(held / members.length);
            if (each > 0) { share[denom] = each; anything = true; }
        }
        if (!anything) return { ok: false, code: 'NOT_ENOUGH_TO_SPLIT', members: members.length };

        const lines = [];
        for (const member of members) {
            const result = await transferCurrency({
                sourceActorUuid: corpse.uuid,
                targetActorUuid: member.uuid,
                currency: share
            });
            lines.push({ label: member.name, ...result });
        }

        const moved = lines.filter((line) => line.ok).length;
        return { ok: moved > 0, partial: moved !== lines.length, share, members: members.length, lines };
    }

    /**
     * Bury deletes the corpse token. Anyone may ask, at any time, but a GM always
     * confirms first — deleting a scene document is the GM's call, and the GM is the
     * only one who can see what is being destroyed.
     */
    /**
     * Who is asking, for the approval prompt. The character they are looting as is
     * the most accurate answer; the assigned character and then the user avatar are
     * fallbacks for a request that carries no recipient.
     */
    static _askerFor(user, recipientUuid) {
        let actor = null;
        try {
            actor = recipientUuid ? fromUuidSync(recipientUuid) : null;
        } catch (_error) {
            actor = null;
        }
        actor ??= user.character ?? null;
        return {
            name: actor?.name ?? user.name,
            img: actor?.img ?? user.avatar ?? 'icons/svg/mystery-man.svg',
            subtitle: actor ? user.name : null
        };
    }

    static async _processBury(tokenDocument, user, payload = {}) {
        const { items: itemCount, coins: coinCount, empty } = this._remainingOn(tokenDocument.actor);

        const remaining = [];
        if (itemCount) remaining.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
        if (coinCount) remaining.push(`${coinCount} coin${coinCount === 1 ? '' : 's'}`);

        // An empty body is buried without asking. A body that still holds something
        // is destroyed by burying it, so that is the case the GM signs off on.
        if (empty || this.setting('lootBuryApproval', true) !== true) {
            const quick = this._askerFor(user, payload.recipientUuid);
            LootWindow.closeForToken(tokenDocument.uuid);
            game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
            await tokenDocument.delete();
            this.broadcastNotice(`${quick.name} buried ${tokenDocument.name}.`);
            return { ok: true };
        }

        const asker = this._askerFor(user, payload.recipientUuid);
        const body = `
            <div class="curator-bury-request">
                <div class="curator-bury-portrait"><img src="${asker.img}" alt=""></div>
                <div class="curator-bury-copy">
                    <strong>${asker.name}</strong>
                    ${asker.subtitle ? `<span>${asker.subtitle}</span>` : ''}
                    <p>Wants to bury <strong>${tokenDocument.name}</strong>.</p>
                    <p>${remaining.length
                        ? `The body still holds ${remaining.join(' and ')}. Burying removes the token and destroys what is left on it.`
                        : 'The body is empty. Burying removes the token from the scene.'}</p>
                </div>
            </div>`;

        const dialog = game.modules.get('coffee-pub-blacksmith')?.api?.dialog;
        let approved = false;

        if (typeof dialog?.wait === 'function') {
            // wait() rather than confirm() so the button order is ours: the decline is
            // secondary and sits left, approve is the primary action on the right.
            const outcome = await dialog.wait({
                title: 'Bury Request',
                content: body,
                classes: ['curator-dialog'],
                modal: true,
                buttons: [
                    { action: 'cancel', label: 'Decline', icon: 'fa-solid fa-xmark' },
                    { action: 'approve', label: 'Approve', icon: 'fa-solid fa-shovel', default: true, destructive: true }
                ],
                closeValue: null,
                cancelValue: null
            });
            approved = outcome?.value === 'approve';
        } else {
            approved = await foundry.applications.api.DialogV2.confirm({
                window: { title: 'Bury Request' }, content: body, rejectClose: false
            });
        }

        if (!approved) return { ok: false, code: 'BURY_DECLINED' };

        // The prompt is open for as long as the GM leaves it open. The body may have
        // been removed by something else in the meantime.
        if (!isTokenAlive(tokenDocument)) return { ok: false, code: 'TOKEN_NOT_FOUND' };

        LootWindow.closeForToken(tokenDocument.uuid);
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
        await tokenDocument.delete();
        this.broadcastNotice(`${asker.name} buried ${tokenDocument.name}.`);
        return { ok: true };
    }

    /**
     * A body leaving the canvas is everyone's business, not just the requester's —
     * anyone with the window open sees it close and deserves to know why.
     */
    static broadcastNotice(message) {
        if (!message) return;
        game.socket.emit(CHANNEL, { action: NOTICE, message });
        notify.info(message);
    }

    static _broadcastRefresh(tokenUuid) {
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid });
        LootWindow.refreshForToken(tokenUuid);
    }
}
