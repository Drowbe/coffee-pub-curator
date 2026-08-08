import { MODULE } from './const.js';
import { LootWindow } from './window-loot.js';

export class LootManager {
    static FLAG = 'loot';
    static STATES = Object.freeze({ PREPARING: 'preparing', READY: 'ready', EMPTY: 'empty' });

    static initialize() {
        // Token interaction is registered through Blacksmith once its public
        // token-interaction API is available. Curator must not wrap Foundry or
        // use libWrapper directly.
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
