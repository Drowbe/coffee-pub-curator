import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/scripts/window-tool-base.js';

const PHYSICAL_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);
const TEMPLATE = 'modules/coffee-pub-curator/templates/window-loot.hbs';

export class LootWindow extends BlacksmithToolWindowBaseV2 {
    static _windows = new Map();

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            classes: ['curator-loot-window'],
            position: { width: 480, height: 'auto' },
            window: { title: 'Loot', resizable: false, minimizable: true },
            windowSizeConstraints: { minWidth: 380, maxWidth: 620, maxHeight: 'calc(100vh - 16px)' },
            toolTitlebar: 'full',
            rememberPosition: false,
            windowPositionKey: 'curator-loot'
        }
    );

    static ACTION_HANDLERS = {
        close: (_event, _target, win) => win.close(),
        openSheet: (_event, _target, win) => win.openSheet()
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

    async _resolveToken() {
        return fromUuid(this.tokenUuid);
    }

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

            const labels = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };
            currencies = Object.entries(labels).map(([key, label]) => ({
                key, label, value: Number(actor.system?.currency?.[key] ?? 0),
                abbreviation: key.toUpperCase()
            })).filter((entry) => entry.value > 0);
        }

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
            isGM: game.user.isGM
        });

        return {
            appId: this.id,
            bodyContent,
            showToolFooter: true,
            toolFooterLeft: game.user.isGM && !missing ? `
                <button type="button" class="blacksmith-window-btn-secondary" data-action="openSheet">
                    <i class="fa-solid fa-user"></i> Open Sheet
                </button>` : '',
            toolFooterRight: `
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
