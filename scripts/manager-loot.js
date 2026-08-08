import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { LootWindow } from './window-loot.js';
import { notify } from './notifications.js';
import { transferItem, transferItems, transferCurrency, isPhysical, denominations } from './loot-inventory.js';

// Shared teardown handle for every claim and hook this manager registers.
const CONTEXT = 'curator-loot';

// The loot card marks its button with the corpse Token UUID.
const CARD_BUTTON_ATTR = 'data-curator-loot-open';

const CHANNEL = `module.${MODULE.ID}`;
const REQUEST = 'lootRequest';
const RESPONSE = 'lootResponse';
const REFRESH = 'lootRefresh';

// A player request that never reaches an answering GM must fail, not hang.
const REQUEST_TIMEOUT_MS = 20000;

export class LootManager {
    static FLAG = 'loot';
    static STATES = Object.freeze({ PREPARING: 'preparing', READY: 'ready', EMPTY: 'empty' });

    static _interactionId = null;
    static _pending = new Map();
    // Ledger writes are read-modify-write, and requests are handled concurrently,
    // so they are chained rather than racing each other.
    static _ledgerWrites = Promise.resolve();

    static initialize() {
        this._registerTokenInteraction();
        this._registerCardHandler();
        this._registerSocket();
    }

    static teardown() {
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
     * Claim double-click on lootable corpses through Blacksmith.
     *
     * Foundry emits no token double-click hook, and the permission predicate runs
     * before the handler, so a corpse is unreachable for a player without LIMITED on
     * the Actor unless the predicate itself is relaxed. Only Blacksmith can do that.
     * See documentation/plan-loot.md section 6.
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
                matches: (tokenDocument) => this.isLootable(tokenDocument),
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

    static _registerCardHandler() {
        HookManager.registerHook({
            name: 'renderChatMessageHTML',
            description: 'Curator: wire the loot card open button',
            context: CONTEXT,
            key: 'curator-loot-card',
            priority: 3,
            callback: (_message, html) => this._wireCard(html)
        });
    }

    static _wireCard(html) {
        const root = html?.[0] ?? html;
        if (typeof root?.querySelectorAll !== 'function') return;

        for (const button of root.querySelectorAll(`[${CARD_BUTTON_ATTR}]`)) {
            if (button.dataset.curatorLootBound === 'true') continue;
            button.dataset.curatorLootBound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                void this._openFromCard(button.getAttribute(CARD_BUTTON_ATTR));
            });
        }
    }

    static async _openFromCard(tokenUuid) {
        try {
            const tokenDocument = tokenUuid ? await fromUuid(tokenUuid) : null;
            if (!tokenDocument) {
                notify.warn('That corpse is no longer on the scene.');
                return;
            }
            if (!this.isLootable(tokenDocument)) {
                notify.warn(`${tokenDocument.name} has nothing left to loot.`);
                return;
            }
            await this.open(tokenDocument);
        } catch (error) {
            this._reportOpenFailure(error);
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

    static open(tokenDocument) {
        if (!this.isLootable(tokenDocument)) return null;
        return LootWindow.open(tokenDocument);
    }

    // ==============================================================
    // ===== STATE ==================================================
    // ==============================================================

    static getState(tokenDocument) {
        return tokenDocument?.getFlag(MODULE.ID, this.FLAG) ?? null;
    }

    static isLootable(tokenDocument) {
        return this.getState(tokenDocument)?.state === this.STATES.READY;
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

    static async markReady(tokenDocument, generationId) {
        const state = this.getState(tokenDocument);
        if (!state || state.generationId !== generationId) return false;
        await tokenDocument.setFlag(MODULE.ID, this.FLAG, {
            ...state,
            state: this.STATES.READY,
            preparedAt: Date.now()
        });
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
            if (data?.action === REFRESH) {
                if (data.closed) LootWindow.closeForToken(data.tokenUuid);
                else LootWindow.refreshForToken(data.tokenUuid);
            }
        });
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

        if (!user.isGM) {
            if (game.combat?.started && this.setting('lootAllowInCombat', false) !== true) {
                return { ok: false, code: 'COMBAT_ACTIVE' };
            }
            const reach = this._proximityCheck(tokenDocument, user);
            if (!reach.ok) return reach;
        }

        let result;
        switch (op) {
            case 'item': result = await this._processItem(tokenDocument, corpse, payload, user); break;
            case 'currency': result = await this._processCurrency(corpse, payload, user); break;
            case 'takeAll': result = await this._processTakeAll(tokenDocument, corpse, payload, user); break;
            case 'distribute': result = await this._processDistribute(corpse, payload); break;
            default: return { ok: false, code: 'UNKNOWN_OPERATION' };
        }

        if (result.ok) {
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
        LootWindow.closeForToken(tokenDocument.uuid);
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
        await tokenDocument.delete();
    }

    /**
     * Distance is recalculated here from current token positions. A client cannot be
     * trusted to measure its own range, and the corpse or the character may have
     * moved since the window opened.
     */
    static _proximityCheck(tokenDocument, user) {
        const limit = Number(this.setting('lootProximity', 0)) || 0;
        if (limit <= 0) return { ok: true };

        const scene = tokenDocument.parent;
        const owned = scene?.tokens?.filter((token) => token.actor?.testUserPermission(user, 'OWNER')) ?? [];
        if (!owned.length) return { ok: false, code: 'TOO_FAR', limit };

        const origin = { x: tokenDocument.x, y: tokenDocument.y };
        for (const token of owned) {
            const distance = canvas.grid.measurePath([origin, { x: token.x, y: token.y }])?.distance;
            if (Number.isFinite(distance) && distance <= limit) return { ok: true };
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

        // Names are captured before the transfer; a moved row is gone afterwards.
        const sources = corpse.items.filter((item) => isPhysical(item.type));
        const labels = new Map(sources.map((item) => [item.id, item.name]));
        const taker = fromUuidSync(check.actorUuid)?.name ?? 'Someone';
        const snapshots = new Map(sources.map((item) => [item.id, this._snapshot(item, taker)]));
        const order = sources.map((item) => item.id);
        const lines = [];

        if (sources.length) {
            const batch = await transferItems({
                sourceActorUuid: corpse.uuid,
                targetActorUuid: check.actorUuid,
                items: sources.map((item) => ({ itemId: item.id }))
            });
            // A whole-call rejection has no per-item detail to report.
            if (!Array.isArray(batch?.results)) return batch;
            const taken = [];
            batch.results.forEach((entry, index) => {
                const itemId = entry?.itemId ?? sources[index]?.id;
                lines.push({ label: labels.get(itemId) ?? 'Item', ...entry });
                if (entry?.ok && entry.sourceDeleted && snapshots.has(itemId)) {
                    taken.push(snapshots.get(itemId));
                }
            });
            await this.recordTaken(tokenDocument, taken, order);
        }

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
            LootWindow.closeForToken(tokenDocument.uuid);
            game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
            await tokenDocument.delete();
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

        LootWindow.closeForToken(tokenDocument.uuid);
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid: tokenDocument.uuid, closed: true });
        await tokenDocument.delete();
        return { ok: true };
    }

    static _broadcastRefresh(tokenUuid) {
        game.socket.emit(CHANNEL, { action: REFRESH, tokenUuid });
        LootWindow.refreshForToken(tokenUuid);
    }
}
