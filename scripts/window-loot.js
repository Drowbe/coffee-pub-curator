import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/scripts/window-tool-base.js';
import { MODULE } from './const.js';
import { notify } from './notifications.js';
import { PHYSICAL_TYPES, DENOMINATIONS } from './loot-transfer.js';
// Circular with manager-loot.js by design: that module imports this one for
// LootWindow.open. Safe because every use below is inside a method, so the
// binding is resolved at call time rather than at module evaluation.
import { LootManager } from './manager-loot.js';

const TEMPLATE = 'modules/coffee-pub-curator/templates/window-loot.hbs';
const CURRENCY_LABELS = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };

// Remembered across windows so a player with two characters is not asked twice.
let _lastRecipientUuid = null;

function _blacksmith() {
    return game.modules.get('coffee-pub-blacksmith')?.api ?? null;
}

export class LootWindow extends BlacksmithToolWindowBaseV2 {
    static _windows = new Map();

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['curator-loot-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Loot', resizable: false, minimizable: true },
            windowSizeConstraints: { minWidth: 420, maxWidth: 660, maxHeight: 'calc(100vh - 16px)' },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'curator-loot'
        }
    );

    static ACTION_HANDLERS = {
        close: (_event, _target, win) => win.close(),
        openSheet: (_event, _target, win) => win.openSheet(),
        take: (_event, target, win) => win.run(() => win.takeItem(target.dataset.itemId)),
        give: (_event, target, win) => win.run(() => win.giveItem(target.dataset.itemId)),
        party: (_event, target, win) => win.run(() => win.itemToParty(target.dataset.itemId)),
        takeCurrency: (_event, target, win) => win.run(() => win.takeCurrency(target.dataset.denom)),
        partyCurrency: (_event, target, win) => win.run(() => win.currencyToParty(target.dataset.denom)),
        distribute: (_event, _target, win) => win.run(() => win.distributeCurrency()),
        takeAll: (_event, _target, win) => win.run(() => win.takeAll()),
        allToParty: (_event, _target, win) => win.run(() => win.allToParty()),
        bury: (_event, _target, win) => win.run(() => win.bury())
    };

    constructor(tokenDocument, options = {}) {
        const opts = foundry.utils.mergeObject({}, options);
        opts.id ||= `curator-loot-${tokenDocument.id}-${foundry.utils.randomID()}`;
        opts.position = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, LootWindow.DEFAULT_OPTIONS.position ?? {}),
            opts.position || {}
        );
        opts.window = foundry.utils.mergeObject(
            foundry.utils.mergeObject({}, LootWindow.DEFAULT_OPTIONS.window ?? {}),
            opts.window || {}
        );
        super(opts);
        this.tokenUuid = tokenDocument.uuid;
        this.busy = false;
    }

    static async open(tokenDocument) {
        const existing = this._windows.get(tokenDocument.uuid);
        if (existing) return existing.render(true);
        const win = new this(tokenDocument);
        this._windows.set(tokenDocument.uuid, win);
        await win.render(true);
        return win;
    }

    static closeForToken(tokenUuid) {
        const win = this._windows.get(tokenUuid);
        if (win) void win.close();
    }

    /** Every open window on this client re-reads current Actor data. */
    static refreshForToken(tokenUuid) {
        const win = this._windows.get(tokenUuid);
        if (win) void win.render(false);
    }

    async _resolveToken() {
        return fromUuid(this.tokenUuid);
    }

    /**
     * The window base delegates click only. A <select> reports its value on
     * change, so the recipient picker is wired here rather than through
     * ACTION_HANDLERS.
     */
    _onRender(context, options) {
        super._onRender?.(context, options);
        const select = this.element?.querySelector('select[data-recipient]');
        if (select && select.dataset.curatorBound !== 'true') {
            select.dataset.curatorBound = 'true';
            select.addEventListener('change', (event) => this.setRecipient(event.target.value));
        }
    }

    // ==============================================================
    // ===== RECIPIENT ==============================================
    // ==============================================================

    get recipients() {
        return LootManager.getEligibleRecipients();
    }

    get recipient() {
        const options = this.recipients;
        if (!options.length) return null;
        const remembered = options.find((actor) => actor.uuid === (this._recipientUuid ?? _lastRecipientUuid));
        return remembered ?? options[0];
    }

    setRecipient(uuid) {
        if (!uuid) return;
        this._recipientUuid = uuid;
        _lastRecipientUuid = uuid;
        void this.render(false);
    }

    // ==============================================================
    // ===== ACTIONS ================================================
    // ==============================================================

    /**
     * Disable the window while a request is in flight. This is user feedback, not
     * the concurrency guarantee — that lives on the GM.
     */
    async run(operation) {
        if (this.busy) return;
        this.busy = true;
        this.element?.classList.add('curator-loot-busy');
        try {
            await operation();
        } catch (error) {
            console.error(`${MODULE.TITLE} | Loot action failed:`, error);
            notify.error('That loot action could not be completed.');
        } finally {
            this.busy = false;
            this.element?.classList.remove('curator-loot-busy');
            // Bury closes the window, and rendering a closed Application throws.
            if (this.constructor._windows.get(this.tokenUuid) === this) await this.render(false);
        }
    }

    async _send(op, payload) {
        const token = await this._resolveToken();
        const state = LootManager.getState(token);
        return LootManager.request(op, {
            tokenUuid: this.tokenUuid,
            generationId: state?.generationId ?? null,
            ...payload
        });
    }

    /** Ask how many only when there is a choice to make. */
    async _askQuantity(label, max) {
        if (max <= 1) return max;
        const blacksmith = _blacksmith();
        if (typeof blacksmith?.quantitySplit?.create !== 'function' || typeof blacksmith?.dialog?.wait !== 'function') {
            return max;
        }

        const inputName = 'curator-loot-quantity';
        const control = blacksmith.quantitySplit.create({
            max,
            value: max,
            inputName,
            giveLabel: 'Take',
            keepLabel: 'Leave',
            amountLabel: `How many ${label}?`
        });

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<div class="blacksmith-field">${control.html}</div>`;

        // The control is read off the submitted form, not the controller: wait()
        // exposes no render hook, and its button callbacks run after the dialog has
        // closed with the form element handed over.
        let chosen = null;
        const outcome = await blacksmith.dialog.wait({
            title: `Take ${label}`,
            content: wrapper,
            buttons: [
                {
                    action: 'take',
                    label: 'Take',
                    icon: 'fa-solid fa-hand',
                    default: true,
                    callback: (form) => { chosen = Number(form?.elements?.[inputName]?.value ?? max); }
                },
                { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' }
            ],
            closeValue: null,
            cancelValue: null
        });
        control.destroy();

        if (outcome?.value !== 'take') return null;
        const amount = Math.trunc(Number(chosen));
        return Number.isFinite(amount) && amount >= 1 ? Math.min(amount, max) : null;
    }

    async _itemContext(itemId) {
        const token = await this._resolveToken();
        const item = token?.actor?.items?.get(itemId);
        if (!item) {
            notify.warn('That item is no longer on the body.');
            return null;
        }
        const quantity = Number(item.system?.quantity ?? 1);
        return { item, quantity: Number.isFinite(quantity) ? quantity : 1 };
    }

    async takeItem(itemId) {
        const recipient = this.recipient;
        if (!recipient) {
            notify.warn('You have no character able to receive loot.');
            return;
        }
        const context = await this._itemContext(itemId);
        if (!context) return;
        const amount = await this._askQuantity(context.item.name, context.quantity);
        if (!amount) return;
        this._report(await this._send('item', { itemId, quantity: amount, recipientUuid: recipient.uuid }),
            `${recipient.name} took ${amount > 1 ? `${amount} ` : ''}${context.item.name}.`);
    }

    async giveItem(itemId) {
        const token = await this._resolveToken();
        const choices = LootManager.getGiftRecipients(token?.actor?.uuid);
        if (!choices.length) {
            notify.warn('There is nobody in the party to give this to.');
            return;
        }
        const blacksmith = _blacksmith();
        if (typeof blacksmith?.dialog?.choose !== 'function') {
            notify.warn('The Blacksmith dialog API is unavailable.');
            return;
        }

        const context = await this._itemContext(itemId);
        if (!context) return;

        const picked = await blacksmith.dialog.choose({
            title: `Give ${context.item.name}`,
            content: `<p>Who receives <strong>${context.item.name}</strong>?</p>`,
            choices: choices.map((actor) => ({ id: actor.uuid, label: actor.name, icon: 'fa-solid fa-user' }))
        });
        if (picked?.action !== 'submit') return;
        const recipientUuid = picked.value ?? null;
        if (!recipientUuid) return;

        const amount = await this._askQuantity(context.item.name, context.quantity);
        if (!amount) return;

        const recipient = choices.find((actor) => actor.uuid === recipientUuid);
        this._report(await this._send('item', { itemId, quantity: amount, recipientUuid }),
            `${context.item.name} given to ${recipient?.name ?? 'the party'}.`);
    }

    async itemToParty(itemId) {
        const party = LootManager.getPartyActor();
        if (!party) {
            notify.warn('No primary party is set for this world.');
            return;
        }
        const context = await this._itemContext(itemId);
        if (!context) return;
        const amount = await this._askQuantity(context.item.name, context.quantity);
        if (!amount) return;
        this._report(await this._send('item', { itemId, quantity: amount, recipientUuid: party.uuid }),
            `${context.item.name} sent to ${party.name}.`);
    }

    async takeCurrency(denom) {
        const recipient = this.recipient;
        if (!recipient) {
            notify.warn('You have no character able to receive loot.');
            return;
        }
        const token = await this._resolveToken();
        const held = Math.trunc(Number(token?.actor?.system?.currency?.[denom] ?? 0));
        if (held < 1) return;
        const amount = await this._askQuantity(CURRENCY_LABELS[denom] ?? denom, held);
        if (!amount) return;
        this._report(await this._send('currency', { currency: { [denom]: amount }, recipientUuid: recipient.uuid }),
            `${recipient.name} took ${amount} ${denom.toUpperCase()}.`);
    }

    async currencyToParty(denom) {
        const party = LootManager.getPartyActor();
        if (!party) {
            notify.warn('No primary party is set for this world.');
            return;
        }
        const token = await this._resolveToken();
        const held = Math.trunc(Number(token?.actor?.system?.currency?.[denom] ?? 0));
        if (held < 1) return;
        const amount = await this._askQuantity(CURRENCY_LABELS[denom] ?? denom, held);
        if (!amount) return;
        this._report(await this._send('currency', { currency: { [denom]: amount }, recipientUuid: party.uuid }),
            `${amount} ${denom.toUpperCase()} sent to ${party.name}.`);
    }

    async distributeCurrency() {
        const result = await this._send('distribute', {});
        if (result?.code === 'NOT_ENOUGH_TO_SPLIT') {
            notify.warn(`There is not enough here to split ${result.members} ways.`);
            return;
        }
        const share = result?.share
            ? Object.entries(result.share).map(([denom, value]) => `${value} ${denom.toUpperCase()}`).join(', ')
            : '';
        this._report(result, `Each of the ${result?.members} party members received ${share}.`);
    }

    async takeAll() {
        const recipient = this.recipient;
        if (!recipient) {
            notify.warn('You have no character able to receive loot.');
            return;
        }
        this._report(await this._send('takeAll', { recipientUuid: recipient.uuid }),
            `${recipient.name} took everything.`);
    }

    async allToParty() {
        const party = LootManager.getPartyActor();
        if (!party) {
            notify.warn('No primary party is set for this world.');
            return;
        }
        this._report(await this._send('takeAll', { recipientUuid: party.uuid }),
            `Everything sent to ${party.name}.`);
    }

    async bury() {
        const result = await this._send('bury', {});
        if (result?.code === 'BURY_DECLINED') {
            notify.info('The GM declined to bury this body.');
            return;
        }
        if (result?.ok) notify.info('The body has been buried.');
        else this._report(result, '');
    }

    /**
     * Batch operations report partial success because they cannot be atomic — the
     * transfer primitive locks per Actor and has no batch call.
     */
    _report(result, successMessage) {
        if (result?.ok && result.partial) {
            const failed = (result.lines ?? []).filter((line) => !line.ok);
            notify.warn(`${result.moved ?? 0} of ${result.total ?? failed.length} moved. Left behind: ${failed.map((l) => l.label).join(', ')}.`);
            return;
        }
        if (result?.ok) {
            if (successMessage) notify.info(successMessage);
            return;
        }
        notify.error(this._explain(result?.code, result));
    }

    _explain(code, result) {
        switch (code) {
            case 'NO_ACTIVE_GM': return 'No GM is connected, so loot cannot be moved.';
            case 'TIMEOUT': return 'The GM did not respond in time.';
            case 'NOT_LOOTABLE': return 'This body is no longer lootable.';
            case 'STALE_GENERATION': return 'This body has changed since the window opened.';
            case 'SOURCE_ITEM_NOT_FOUND': return 'Somebody else took that first.';
            case 'INSUFFICIENT_QUANTITY': return `Only ${result?.available} left.`;
            case 'INSUFFICIENT_CURRENCY': return `Only ${result?.available} ${String(result?.denomination ?? '').toUpperCase()} left.`;
            case 'CONTAINER_HAS_CONTENTS': return 'Empty the container before moving it.';
            case 'ITEM_NOT_TRANSFERABLE': return 'That is not something you can carry off.';
            case 'RECIPIENT_NOT_ALLOWED': return 'That character cannot receive this.';
            case 'NO_PARTY_MEMBERS': return 'There are no party members to share with.';
            case 'SAME_ACTOR': return 'That is already where it is.';
            case 'NOT_A_CORPSE': return 'That is not a Curator corpse.';
            case 'ROLLBACK_FAILED': return 'The transfer half-failed. Ask your GM to check both sheets.';
            default: return 'That loot action could not be completed.';
        }
    }

    // ==============================================================
    // ===== RENDER =================================================
    // ==============================================================

    async getData() {
        const token = await this._resolveToken();
        const actor = token?.actor;
        const missing = !token || !actor;

        let items = [];
        let currencies = [];

        if (!missing) {
            items = actor.items.filter((item) => PHYSICAL_TYPES.has(item.type)).map((item) => ({
                id: item.id,
                name: item.name,
                img: item.img,
                type: item.type,
                typeLabel: item.type?.charAt(0).toUpperCase() + item.type?.slice(1),
                quantity: Number(item.system?.quantity ?? 1),
                containerId: item.system?.container ?? null
            }));
            const containersWithContents = new Set(items.map((item) => item.containerId).filter(Boolean));
            items = items.filter((item) => item.type !== 'container' || !containersWithContents.has(item.id));

            currencies = DENOMINATIONS.map((key) => ({
                key,
                label: CURRENCY_LABELS[key],
                value: Math.trunc(Number(actor.system?.currency?.[key] ?? 0)),
                abbreviation: key.toUpperCase()
            })).filter((entry) => entry.value > 0);
        }

        const party = LootManager.getPartyActor();
        const options = this.recipients;
        const recipient = this.recipient;

        const bodyContent = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
            missing,
            tokenName: token?.name ?? 'Missing Corpse',
            portraitImg: actor?.img ?? 'icons/svg/mystery-man.svg',
            items,
            itemCount: items.length,
            hasItems: items.length > 0,
            currencies,
            currencyCount: currencies.length,
            hasCurrency: currencies.length > 0,
            isGM: game.user.isGM,
            partyName: party?.name ?? null,
            hasParty: Boolean(party),
            recipientName: recipient?.name ?? null,
            recipientOptions: options.map((member) => ({
                uuid: member.uuid,
                name: member.name,
                selected: member.uuid === recipient?.uuid
            })),
            hasRecipientChoice: options.length > 1,
            hasRecipient: Boolean(recipient)
        });

        const canAct = !missing && (items.length > 0 || currencies.length > 0);

        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterLeft: `
                <button type="button" class="blacksmith-window-btn-primary" data-action="takeAll" ${canAct && recipient ? '' : 'disabled'}>
                    <i class="fa-solid fa-hands-holding"></i> Take All
                </button>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="allToParty" ${canAct && party ? '' : 'disabled'}>
                    <i class="fa-solid fa-users"></i> All to Party
                </button>`,
            toolFooterRight: `
                ${game.user.isGM && !missing ? `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="openSheet">
                    <i class="fa-solid fa-user"></i> Sheet
                </button>` : ''}
                <button type="button" class="blacksmith-window-btn-secondary" data-action="close">
                    <i class="fa-solid fa-xmark"></i> Close
                </button>`
        };
    }

    async openSheet() {
        if (!game.user.isGM) return;
        const token = await this._resolveToken();
        token?.actor?.sheet?.render(true, { token });
    }

    _onClose(options) {
        this.constructor._windows.delete(this.tokenUuid);
        super._onClose?.(options);
    }
}
