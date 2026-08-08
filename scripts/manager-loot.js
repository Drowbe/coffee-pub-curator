import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { LootWindow } from './window-loot.js';
import { notify } from './notifications.js';
import { transferItem, transferCurrency, isPhysical, denominations } from './loot-inventory.js';

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
                if (!game.user.isGM || !this._isAnsweringGM()) return;
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
            return this._processBury(tokenDocument, user);
        }

        const state = this.getState(tokenDocument);
        if (state?.state !== this.STATES.READY) return { ok: false, code: 'NOT_LOOTABLE' };
        if (payload.generationId && payload.generationId !== state.generationId) {
            return { ok: false, code: 'STALE_GENERATION' };
        }

        const corpse = tokenDocument.actor;
        if (!corpse) return { ok: false, code: 'SOURCE_ACTOR_NOT_FOUND' };

        let result;
        switch (op) {
            case 'item': result = await this._processItem(corpse, payload, user); break;
            case 'currency': result = await this._processCurrency(corpse, payload, user); break;
            case 'takeAll': return { ok: false, code: 'BATCH_UNAVAILABLE' };
            case 'distribute': result = await this._processDistribute(corpse, payload); break;
            default: return { ok: false, code: 'UNKNOWN_OPERATION' };
        }

        if (result.ok) this._broadcastRefresh(tokenDocument.uuid);
        return result;
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
        if (party?.uuid === recipientUuid) return { ok: true, actorUuid: recipientUuid };

        let actor = null;
        try {
            actor = fromUuidSync(recipientUuid);
        } catch (_error) {
            return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };
        }
        if (!actor || actor.type !== 'character') return { ok: false, code: 'TARGET_ACTOR_NOT_FOUND' };
        if (user.isGM) return { ok: true, actorUuid: recipientUuid };
        if (actor.testUserPermission(user, 'OWNER')) return { ok: true, actorUuid: recipientUuid };
        if (this.getPartyCharacters().some((member) => member.uuid === recipientUuid)) {
            return { ok: true, actorUuid: recipientUuid };
        }
        return { ok: false, code: 'RECIPIENT_NOT_ALLOWED' };
    }

    static async _processItem(corpse, payload, user) {
        const check = this._validateRecipient(payload.recipientUuid, user, corpse);
        if (!check.ok) return check;
        return transferItem({
            sourceActorUuid: corpse.uuid,
            targetActorUuid: check.actorUuid,
            itemId: payload.itemId,
            quantity: payload.quantity
        });
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
    static async _processBury(tokenDocument, user) {
        const actor = tokenDocument.actor;
        const itemCount = actor ? actor.items.filter((i) => isPhysical(i.type)).length : 0;
        const coinCount = denominations().reduce(
            (sum, denom) => sum + Math.trunc(Number(actor?.system?.currency?.[denom] ?? 0)), 0
        );

        const remaining = [];
        if (itemCount) remaining.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
        if (coinCount) remaining.push(`${coinCount} coin${coinCount === 1 ? '' : 's'}`);

        const dialog = game.modules.get('coffee-pub-blacksmith')?.api?.dialog;
        const body = remaining.length
            ? `<p><strong>${user.name}</strong> wants to bury <strong>${tokenDocument.name}</strong>.</p>
               <p>The body still holds ${remaining.join(' and ')}. Burying removes the token from the scene and destroys what is left on it.</p>`
            : `<p><strong>${user.name}</strong> wants to bury <strong>${tokenDocument.name}</strong>.</p>
               <p>The body is empty. Burying removes the token from the scene.</p>`;

        const confirmed = typeof dialog?.confirm === 'function'
            ? await dialog.confirm({
                title: 'Bury Corpse',
                content: body,
                confirmLabel: 'Bury',
                confirmIcon: 'fa-solid fa-shovel',
                destructive: true
            })
            : await foundry.applications.api.DialogV2.confirm({ window: { title: 'Bury Corpse' }, content: body, rejectClose: false });

        if (!confirmed) return { ok: false, code: 'BURY_DECLINED' };

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
