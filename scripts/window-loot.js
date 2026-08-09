import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/scripts/window-tool-base.js';
import { MODULE } from './const.js';
import { notify } from './notifications.js';
import { isPhysical, denominations, hasBatchTransfer } from './loot-inventory.js';
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

/**
 * Attach an embedded Blacksmith control once its markup is actually in the
 * document.
 *
 * Attaching to a detached wrapper before handing it to dialog.wait() does not
 * work, whatever the move-not-copy semantics suggest — the control ends up
 * unbound, and that failure is silent: the inputs still render and still report
 * a value, so a slider looks alive while its captions never move and an entity
 * list hands back the initial selection rather than the user's. dialog.wait()
 * exposes no render hook, so poll a few frames for the input instead.
 */
async function _attachWhenRendered(control, inputName, frames = 20) {
    for (let i = 0; i < frames; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const live = document.querySelector(`[name="${inputName}"]`);
        if (!live) continue;
        control.attach(live.closest('.application') ?? live.closest('form') ?? document.body);
        return true;
    }
    console.warn(`${MODULE.TITLE} | Control "${inputName}" never rendered; falling back to form values.`);
    return false;
}

export class LootWindow extends BlacksmithToolWindowBaseV2 {
    static _windows = new Map();

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['curator-loot-window'],
            // An explicit height rather than `auto`: a resizable window needs a height
            // it can be dragged from, and `auto` plus a max-height would let the cap
            // silently refuse the drag. The cap is now the viewport, so resizing is
            // only bounded by the screen.
            position: { width: 520, height: 560 },
            window: { title: 'Loot', resizable: true, minimizable: true },
            windowSizeConstraints: { minWidth: 420, minHeight: 320, maxWidth: 900, maxHeight: 'calc(100vh - 40px)' },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'curator-loot'
        }
    );

    static ACTION_HANDLERS = {
        close: (_event, _target, win) => win.close(),
        take: (_event, target, win) => win.run(() => win.takeItem(target.dataset.itemId)),
        give: (_event, target, win) => win.run(() => win.giveItem(target.dataset.itemId)),
        party: (_event, target, win) => win.run(() => win.itemToParty(target.dataset.itemId)),
        takeCurrency: (_event, target, win) => win.run(() => win.takeCurrency(target.dataset.denom)),
        partyCurrency: (_event, target, win) => win.run(() => win.currencyToParty(target.dataset.denom)),
        distribute: (_event, _target, win) => win.run(() => win.distributeCurrency()),
        takeAll: (_event, _target, win) => win.run(() => win.takeAll()),
        allToParty: (_event, _target, win) => win.run(() => win.allToParty()),
        bury: (_event, _target, win) => win.run(() => win.bury()),
        changeRecipient: (_event, _target, win) => win.changeRecipient()
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
        LootManager.announcePresence(tokenDocument.uuid);
        return win;
    }

    static isOpenFor(tokenUuid) {
        return this._windows.has(tokenUuid);
    }

    /** The character the local user is looting as, for presence broadcasts. */
    static recipientFor(tokenUuid) {
        return this._windows.get(tokenUuid)?.recipient ?? null;
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
        LootManager.announcePresence(this.tokenUuid);
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

    /**
     * Pick an Actor through Blacksmith's entity list rather than a select or a
     * button row: it renders portraits, a type line, and disabled reasons, and it
     * is the control the plan named for recipient selection.
     */
    async _pickActor({ title, actors, selectedUuid, confirmLabel = 'Select', confirmIcon = 'fa-solid fa-check' }) {
        const blacksmith = _blacksmith();
        if (typeof blacksmith?.entityList?.create !== 'function' || typeof blacksmith?.dialog?.wait !== 'function') {
            notify.warn('The Blacksmith entity list is unavailable.');
            return null;
        }
        if (!actors.length) return null;

        const list = blacksmith.entityList.create({
            entities: actors.map((actor) => ({
                id: actor.uuid,
                uuid: actor.uuid,
                name: actor.name,
                img: actor.img
            })),
            mode: 'single',
            inputName: 'curator-loot-actor',
            selected: selectedUuid ?? actors[0].uuid
        });

        const inputName = 'curator-loot-actor';
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<div class="blacksmith-field">${list.html}</div>`;

        let chosen = null;
        let bound = false;
        const pending = blacksmith.dialog.wait({
            title,
            content: wrapper,
            classes: ['curator-dialog'],
            // Secondary action left, primary right — the same order as the window footer.
            buttons: [
                { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' },
                {
                    action: 'select',
                    label: confirmLabel,
                    icon: confirmIcon,
                    default: true,
                    callback: (form) => {
                        chosen = bound
                            ? list.getSelectedIds()?.[0] ?? null
                            : form?.elements?.[inputName]?.value ?? null;
                    }
                }
            ],
            closeValue: null,
            cancelValue: null
        });

        bound = await _attachWhenRendered(list, inputName);
        const outcome = await pending;
        list.destroy();

        return outcome?.value === 'select' ? chosen : null;
    }

    async changeRecipient() {
        const options = this.recipients;
        if (options.length < 2) return;
        const picked = await this._pickActor({
            title: 'Looting As',
            actors: options,
            selectedUuid: this.recipient?.uuid,
            confirmIcon: 'fa-solid fa-user-check'
        });
        if (picked) this.setRecipient(picked);
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

        let chosen = null;
        let bound = false;
        const pending = blacksmith.dialog.wait({
            title: `Take ${label}`,
            content: wrapper,
            classes: ['curator-dialog'],
            // Secondary action left, primary right — the same order as the window footer.
            buttons: [
                { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' },
                {
                    action: 'take',
                    label: 'Take',
                    icon: 'fa-solid fa-hand',
                    default: true,
                    // getValue() is integer-clamped and DOM-independent, but it is only
                    // correct once the control is bound; read the form otherwise.
                    callback: (form) => {
                        chosen = bound ? control.getValue() : Number(form?.elements?.[inputName]?.value ?? max);
                    }
                }
            ],
            closeValue: null,
            cancelValue: null
        });

        bound = await _attachWhenRendered(control, inputName);
        const outcome = await pending;
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
        const context = await this._itemContext(itemId);
        if (!context) return;

        const recipientUuid = await this._pickActor({
            title: `Give ${context.item.name}`,
            actors: choices,
            confirmLabel: 'Give',
            confirmIcon: 'fa-solid fa-hand-holding-heart'
        });
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
        // The character being looted as travels with the request so the GM's prompt
        // can show who is actually asking.
        const result = await this._send('bury', { recipientUuid: this.recipient?.uuid ?? null });
        if (result?.code === 'BURY_DECLINED') {
            notify.info('The GM declined to bury this body.');
            return;
        }
        // Success is announced to everyone by the GM, so saying it again here would
        // show the requester two messages for one action.
        if (!result?.ok) this._report(result, '');
    }

    /**
     * `ok: true, merged: false` is success — the item arrived as its own row rather
     * than joining a stack. Only an explicit `partial` flag means anything was left.
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
        this._reportFailure(result);
    }

    _reportFailure(result) {
        const code = result?.code;

        // A half-completed transfer is repairable by hand, but only if the GM is
        // told which item landed and what both sides now read. Never swallow these.
        if (code === 'SOURCE_UPDATE_FAILED' || code === 'ROLLBACK_FAILED') {
            console.error(`${MODULE.TITLE} | Loot transfer left an inconsistent state:`, result);
            const detail = [
                result.targetItemId ? `target item ${result.targetItemId}` : null,
                result.merged === true ? 'merged into an existing stack' : null,
                Number.isFinite(result.quantity) ? `quantity ${result.quantity}` : null
            ].filter(Boolean).join(', ');
            notify.error(
                code === 'ROLLBACK_FAILED'
                    ? `The transfer failed and could not be undone${detail ? ` (${detail})` : ''}. A GM must check both sheets — details are in the console.`
                    : `The item arrived but the body was not updated${detail ? ` (${detail})` : ''}. A GM must check both sheets — details are in the console.`
            );
            return;
        }

        // The only code describing a state that will change on its own.
        if (code === 'LOCK_TIMEOUT') {
            notify.warn('The body is busy with another transfer. Try that again.');
            return;
        }

        notify.error(this._explain(code, result));
    }

    _explain(code, result) {
        switch (code) {
            case 'INVENTORY_UNAVAILABLE': return 'The Blacksmith inventory API is not available.';
            case 'DUPLICATE_ITEM': return 'That item was listed twice in one request.';
            case 'NOTHING_TO_TAKE': return 'There is nothing left on this body.';
            case 'COMBAT_ACTIVE': return 'You cannot loot while combat is under way.';
            case 'TOO_FAR': return `You need to be within ${result?.limit} feet of the body.`;
            case 'SEND_TO_PARTY_DISABLED': return 'Sending loot to the party is turned off in this world.';
            case 'SEND_TO_PLAYER_DISABLED': return 'Giving loot to other players is turned off in this world.';
            case 'NO_ACTIVE_GM': return 'No GM is connected, so loot cannot be moved.';
            case 'TIMEOUT': return 'The GM did not respond. If this keeps happening, the world may need a restart.';
            case 'NOT_LOOTABLE': return 'This body is no longer lootable.';
            case 'NOT_A_CORPSE': return 'That is not a Curator corpse.';
            case 'STALE_GENERATION': return 'This body has changed since the window opened.';
            case 'SOURCE_ITEM_NOT_FOUND':
            case 'ITEM_NOT_FOUND': return 'Somebody else took that first.';
            case 'SOURCE_ACTOR_NOT_FOUND': return 'This body is no longer on the scene.';
            case 'TARGET_ACTOR_NOT_FOUND': return 'That character could not be found.';
            case 'INVALID_QUANTITY': return 'That is not a valid amount.';
            case 'INSUFFICIENT_QUANTITY': return `Only ${result?.available} left.`;
            case 'INVALID_CURRENCY': return 'That is not a valid coin amount.';
            case 'INSUFFICIENT_CURRENCY': return `Only ${result?.available} ${String(result?.denomination ?? '').toUpperCase()} left.`;
            // contentCount is null when Blacksmith could not determine it and refused
            // to be safe, so only name a number when there is one.
            case 'CONTAINER_HAS_CONTENTS': return Number.isFinite(result?.contentCount)
                ? `Unpack ${result.contentCount} item${result.contentCount === 1 ? '' : 's'} first.`
                : 'Empty the container before moving it.';
            case 'ITEM_NOT_TRANSFERABLE': return 'That is not something you can carry off.';
            case 'TARGET_CREATE_FAILED': return 'That could not be added to the recipient.';
            case 'RECIPIENT_NOT_ALLOWED': return 'That character cannot receive this.';
            case 'NO_PARTY_MEMBERS': return 'There are no party members to share with.';
            case 'SAME_ACTOR': return 'That is already where it is.';
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
            items = actor.items.filter((item) => isPhysical(item.type)).map((item) => ({
                id: item.id,
                name: item.name,
                img: item.img,
                type: item.type,
                typeLabel: item.type?.charAt(0).toUpperCase() + item.type?.slice(1),
                quantity: Number(item.system?.quantity ?? 1),
                containerId: item.system?.container ?? null
            }));
            // A packed container is shown, not hidden. It cannot be transferred — the
            // primitive returns CONTAINER_HAS_CONTENTS — but hiding it made the body
            // read as though the bag was never there, while Loot All correctly left it
            // behind. Contents stay listed as their own takeable rows.
            const contentCounts = new Map();
            for (const item of items) {
                if (!item.containerId) continue;
                contentCounts.set(item.containerId, (contentCounts.get(item.containerId) ?? 0) + 1);
            }
            items = items.map((item) => {
                const contentCount = contentCounts.get(item.id) ?? 0;
                return {
                    ...item,
                    contentCount,
                    packed: contentCount > 0,
                    contentLabel: `Holds ${contentCount} item${contentCount === 1 ? '' : 's'}`
                };
            });

            // Looted rows come from the Token's ledger, not from this window's memory,
            // so they are the same on every client and survive reopening the window.
            const taken = LootManager.getTaken(token).map((entry) => ({ ...entry, id: entry.itemId, looted: true }));
            items = [...items.map((item) => ({ ...item, looted: false })), ...taken];

            // A looted row holds its original place rather than sliding to the bottom.
            // The order is the one the body had before anything was taken; anything
            // added since is unranked and falls to the end in its own order.
            const order = LootManager.getOrder(token);
            if (order.length) {
                const rank = (id) => {
                    const index = order.indexOf(id);
                    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
                };
                items.sort((a, b) => rank(a.id) - rank(b.id));
            }

            currencies = denominations().map((key) => ({
                key,
                label: CURRENCY_LABELS[key],
                value: Math.trunc(Number(actor.system?.currency?.[key] ?? 0)),
                abbreviation: key.toUpperCase()
            })).filter((entry) => entry.value > 0);
        }

        const party = LootManager.getPartyActor();
        const options = this.recipients;
        const recipient = this.recipient;

        const available = items.filter((item) => !item.looted);
        const canLootAll = !missing && hasBatchTransfer() && (available.length > 0 || currencies.length > 0);

        const bodyContent = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
            missing,
            tokenName: token?.name ?? 'Missing Corpse',
            portraitImg: actor?.img ?? 'icons/svg/mystery-man.svg',
            items,
            itemCount: available.length,
            hasItems: items.length > 0,
            currencies,
            currencyCount: currencies.length,
            hasCurrency: currencies.length > 0,
            isGM: game.user.isGM,
            partyName: party?.name ?? null,
            hasParty: Boolean(party) && LootManager.sendToPartyEnabled,
            canGive: LootManager.sendToPlayerEnabled,
            recipientName: recipient?.name ?? null,
            recipientImg: recipient?.img ?? 'icons/svg/mystery-man.svg',
            looters: LootManager.getLooters(this.tokenUuid),
            hasRecipientChoice: options.length > 1,
            hasRecipient: Boolean(recipient)
        });

        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterLeft: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="close">
                    <i class="fa-solid fa-check"></i> Done
                </button>`,
            toolFooterRight: `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="allToParty"
                        ${canLootAll && party && LootManager.sendToPartyEnabled ? '' : 'disabled'} data-tooltip="Send everything to the party inventory">
                    <i class="fa-solid fa-users"></i> Loot to Party
                </button>
                <button type="button" class="blacksmith-window-btn-primary" data-action="takeAll"
                        ${canLootAll && recipient ? '' : 'disabled'} data-tooltip="Take everything">
                    <i class="fa-solid fa-hands-holding"></i> Loot All
                </button>`
        };
    }

    /**
     * Sheet access lives in the titlebar rather than the footer: it is GM-only
     * inspection, not a loot action, and the footer is reserved for the latter.
     */
    getToolHeaderActions() {
        if (!game.user.isGM) return [];
        return [
            {
                id: 'curator-loot-sheet',
                icon: 'fa-solid fa-user',
                label: 'Character Sheet',
                onClick: () => void this.openSheet()
            },
            {
                id: 'curator-loot-prototype',
                icon: 'fa-solid fa-chess-pawn',
                label: 'Prototype Token',
                onClick: () => void this.openPrototypeToken()
            }
        ];
    }

    async openSheet() {
        if (!game.user.isGM) return;
        const token = await this._resolveToken();
        token?.actor?.sheet?.render(true, { token });
    }

    async openPrototypeToken() {
        if (!game.user.isGM) return;
        const token = await this._resolveToken();
        const prototype = token?.actor?.prototypeToken;
        const sheetClass = CONFIG.Token?.prototypeSheetClass;
        if (!prototype || !sheetClass) {
            notify.warn('This corpse has no prototype token.');
            return;
        }
        new sheetClass({ prototype }).render(true);
    }

    _onClose(options) {
        this.constructor._windows.delete(this.tokenUuid);
        LootManager.clearPresence(this.tokenUuid);
        super._onClose?.(options);
    }
}
