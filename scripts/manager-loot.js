import { MODULE } from './const.js';
import { HookManager } from './manager-hooks.js';
import { LootWindow } from './window-loot.js';
import { notify } from './notifications.js';

// Shared teardown handle for every claim and hook this manager registers.
const CONTEXT = 'curator-loot';

// The loot card marks its button with the corpse Token UUID.
const CARD_BUTTON_ATTR = 'data-curator-loot-open';

export class LootManager {
    static FLAG = 'loot';
    static STATES = Object.freeze({ PREPARING: 'preparing', READY: 'ready', EMPTY: 'empty' });

    static _interactionId = null;

    static initialize() {
        this._registerTokenInteraction();
        this._registerCardHandler();
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
}
