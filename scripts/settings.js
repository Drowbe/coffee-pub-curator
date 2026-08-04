/**
 * Curator settings: image replacement, dead tokens, path helpers.
 * Uses MODULE.ID for all keys. Sound choices for dead tokens come from Blacksmith when provided.
 */
import { MODULE } from './const.js';

const GROUP = 'curator';

function registerHeader(id, labelKey, hintKey, level = 'H2', group = GROUP, scope = 'world') {
    game.settings.register(MODULE.ID, `heading${level}${id}`, {
        name: MODULE.ID + '.' + labelKey,
        hint: MODULE.ID + '.' + hintKey,
        scope,
        config: true,
        default: '',
        type: String,
        group
    });
}

function _setSettingName(key, name) {
    const s = game.settings.settings.get(`${MODULE.ID}.${key}`);
    if (s) s.name = name;
}

function _reorderLibrarySettings(pathPrefix, namePrefix, count) {
    const pairs = [];
    for (let i = 1; i <= count; i++) {
        const pk = `${MODULE.ID}.${pathPrefix}${i}`;
        const nk = `${MODULE.ID}.${namePrefix}${i}`;
        pairs.push([pk, game.settings.settings.get(pk), nk, game.settings.settings.get(nk)]);
    }
    pairs.forEach(([pk, , nk]) => { game.settings.settings.delete(pk); game.settings.settings.delete(nk); });
    pairs.forEach(([pk, pe, nk, ne]) => { if (pe) game.settings.settings.set(pk, pe); if (ne) game.settings.settings.set(nk, ne); });
}

function registerImageReplacementPaths() {
    const numSetting = 'numImageReplacementPaths';
    if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) return;
    const numPaths = game.settings.get(MODULE.ID, numSetting) ?? 1;
    for (let i = 1; i <= numPaths; i++) {
        const pathKey = `tokenImageReplacementPath${i}`;
        const nameKey = `tokenImageReplacementPathName${i}`;
        if (!game.settings.settings.has(`${MODULE.ID}.${pathKey}`)) {
            game.settings.register(MODULE.ID, pathKey, { name: `Library ${i} Path`, hint: '', type: String, config: true, scope: 'world', default: '', filePicker: 'folder', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(pathKey, `Library ${i} Path`);
        }
        if (!game.settings.settings.has(`${MODULE.ID}.${nameKey}`)) {
            game.settings.register(MODULE.ID, nameKey, { name: `Library ${i} Label (Optional)`, hint: '', type: String, config: true, scope: 'world', default: '', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(nameKey, `Library ${i} Label (Optional)`);
        }
    }
    _reorderLibrarySettings('tokenImageReplacementPath', 'tokenImageReplacementPathName', numPaths);
}

function registerTileImagePaths() {
    const numSetting = 'numTileImagePaths';
    if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) return;
    const numPaths = game.settings.get(MODULE.ID, numSetting) ?? 1;
    for (let i = 1; i <= numPaths; i++) {
        const pathKey = `tileImagePath${i}`;
        const nameKey = `tileImagePathName${i}`;
        if (!game.settings.settings.has(`${MODULE.ID}.${pathKey}`)) {
            game.settings.register(MODULE.ID, pathKey, { name: `Library ${i} Path`, hint: '', type: String, config: true, scope: 'world', default: '', filePicker: 'folder', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(pathKey, `Library ${i} Path`);
        }
        if (!game.settings.settings.has(`${MODULE.ID}.${nameKey}`)) {
            game.settings.register(MODULE.ID, nameKey, { name: `Library ${i} Label (Optional)`, hint: '', type: String, config: true, scope: 'world', default: '', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(nameKey, `Library ${i} Label (Optional)`);
        }
    }
    _reorderLibrarySettings('tileImagePath', 'tileImagePathName', numPaths);
}

function registerPortraitImageReplacementPaths() {
    const numSetting = 'numPortraitImageReplacementPaths';
    if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) return;
    const numPaths = game.settings.get(MODULE.ID, numSetting) ?? 1;
    for (let i = 1; i <= numPaths; i++) {
        const pathKey = `portraitImageReplacementPath${i}`;
        const nameKey = `portraitImageReplacementPathName${i}`;
        if (!game.settings.settings.has(`${MODULE.ID}.${pathKey}`)) {
            game.settings.register(MODULE.ID, pathKey, { name: `Library ${i} Path`, hint: '', type: String, config: true, scope: 'world', default: '', filePicker: 'folder', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(pathKey, `Library ${i} Path`);
        }
        if (!game.settings.settings.has(`${MODULE.ID}.${nameKey}`)) {
            game.settings.register(MODULE.ID, nameKey, { name: `Library ${i} Label (Optional)`, hint: '', type: String, config: true, scope: 'world', default: '', requiresReload: false, group: GROUP });
        } else {
            _setSettingName(nameKey, `Library ${i} Label (Optional)`);
        }
    }
    _reorderLibrarySettings('portraitImageReplacementPath', 'portraitImageReplacementPathName', numPaths);
}

export function getTokenImagePaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numImageReplacementPaths') ?? 1;
    const paths = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `tokenImageReplacementPath${i}`) || '';
        if (path && path.trim() !== '') paths.push(path.trim());
    }
    return paths;
}

export function getPortraitImagePaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numPortraitImageReplacementPaths') ?? 1;
    const paths = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `portraitImageReplacementPath${i}`) || '';
        if (path && path.trim() !== '') paths.push(path.trim());
    }
    return paths;
}

export function getTileImagePaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numTileImagePaths') ?? 1;
    const paths = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `tileImagePath${i}`) || '';
        if (path && path.trim() !== '') paths.push(path.trim());
    }
    return paths;
}

function _getPathName(settingKey) {
    try {
        if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) return '';
        return game.settings.get(MODULE.ID, settingKey) || '';
    } catch { return ''; }
}

function _pathToLabel(path, nameOverride) {
    if (nameOverride?.trim()) return nameOverride.trim();
    const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

export function getTokenLibraries() {
    const numPaths = game.settings.get(MODULE.ID, 'numImageReplacementPaths') ?? 1;
    const libraries = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `tokenImageReplacementPath${i}`) || '';
        if (!path.trim()) continue;
        const name = _getPathName(`tokenImageReplacementPathName${i}`);
        libraries.push({ path: path.trim(), label: _pathToLabel(path, name) });
    }
    return libraries;
}

export function getPortraitLibraries() {
    const numPaths = game.settings.get(MODULE.ID, 'numPortraitImageReplacementPaths') ?? 1;
    const libraries = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `portraitImageReplacementPath${i}`) || '';
        if (!path.trim()) continue;
        const name = _getPathName(`portraitImageReplacementPathName${i}`);
        libraries.push({ path: path.trim(), label: _pathToLabel(path, name) });
    }
    return libraries;
}

export function getTileLibraries() {
    const numPaths = game.settings.get(MODULE.ID, 'numTileImagePaths') ?? 1;
    const libraries = [];
    for (let i = 1; i <= numPaths; i++) {
        const path = game.settings.get(MODULE.ID, `tileImagePath${i}`) || '';
        if (!path.trim()) continue;
        const name = _getPathName(`tileImagePathName${i}`);
        libraries.push({ path: path.trim(), label: _pathToLabel(path, name) });
    }
    return libraries;
}

export function getTokenImageReplacementCacheStats() {
    return game.settings.get(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus') || '';
}

/**
 * Register all Curator settings. Call from ready hook; pass Blacksmith API for sound choices.
 * @param {Object} [blacksmithApi] - Blacksmith module.api; used for arrSoundChoices on dead token sound settings.
 */
async function _getLootTableChoices(blacksmithApi) {
    const none = { none: '-- Choose a Compendium Table --' };
    const compendiums = blacksmithApi?.compendiums;
    if (typeof compendiums?.getAllPacks !== 'function') return none;

    try {
        const choices = { ...none };
        const packs = compendiums.getAllPacks('RollTable');
        const indexes = await Promise.all(packs.map(async packInfo => {
            const pack = game.packs.get(packInfo.id);
            if (!pack) return [];
            const index = await pack.getIndex({ fields: ['name'] });
            return Array.from(index).map(entry => ({ packInfo, pack, entry }));
        }));
        const tables = indexes.flat().sort((a, b) => {
            const sourceCompare = a.packInfo.displayLabel.localeCompare(b.packInfo.displayLabel);
            return sourceCompare || a.entry.name.localeCompare(b.entry.name);
        });
        for (const { packInfo, pack, entry } of tables) {
            const uuid = entry.uuid ?? `Compendium.${pack.id}.${pack.documentName}.${entry._id}`;
            choices[uuid] = `${packInfo.displayLabel} — ${entry.name}`;
        }
        return choices;
    } catch (error) {
        console.warn(`${MODULE.TITLE} | Could not load compendium RollTable choices.`, error);
        return none;
    }
}

export async function registerSettings(blacksmithApi) {
    const soundChoices = window.BlacksmithConstants?.arrSoundChoices || blacksmithApi?.BLACKSMITH?.arrSoundChoices || { none: 'None' };
    const tableChoices = await _getLootTableChoices(blacksmithApi);

    // Dynamic update for choices if they arrive later via blacksmithUpdated hook
    Hooks.on('blacksmithUpdated', (data) => {
        if (data.type === 'ready') {
            const api = window.BlacksmithConstants || game.modules.get('coffee-pub-blacksmith')?.api?.BLACKSMITH;
            if (!api) return;

            if (api.arrSoundChoices) {
                const sChoices = api.arrSoundChoices;
                const soundSettings = ['deadTokenSoundNPC', 'deadTokenSoundPC', 'deadTokenSoundStable', 'tokenLootSound'];
                for (const key of soundSettings) {
                    const setting = game.settings.settings.get(`${MODULE.ID}.${key}`);
                    if (setting) setting.choices = sChoices;
                }
            }
        }
    });

    // ----- Dead Tokens -----
    registerHeader('DeadTokens', 'headingH2DeadTokens-Label', 'headingH2DeadTokens-Hint', 'H2', GROUP, 'world');
    registerHeader('DeadConfiguration', 'headingH3DeadConfiguration-Label', 'headingH3DeadConfiguration-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'enableDeadTokenReplacement', {
        name: MODULE.ID + '.enableDeadTokenReplacement-Label',
        hint: MODULE.ID + '.enableDeadTokenReplacement-Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenCreatureTypeFilter', {
        name: MODULE.ID + '.deadTokenCreatureTypeFilter-Label',
        hint: MODULE.ID + '.deadTokenCreatureTypeFilter-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: false,
        group: GROUP
    });

    registerHeader('DeadExperience', 'headingH3DeadExperience-Label', 'headingH3DeadExperience-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'deadTokenImagePath', {
        name: MODULE.ID + '.deadTokenImagePath-Label',
        hint: MODULE.ID + '.deadTokenImagePath-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp',
        requiresReload: false,
        filePicker: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundNPC', {
        name: MODULE.ID + '.deadTokenSoundNPC-Label',
        hint: MODULE.ID + '.deadTokenSoundNPC-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenImagePathPC', {
        name: MODULE.ID + '.deadTokenImagePathPC-Label',
        hint: MODULE.ID + '.deadTokenImagePathPC-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp',
        requiresReload: false,
        filePicker: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundPC', {
        name: MODULE.ID + '.deadTokenSoundPC-Label',
        hint: MODULE.ID + '.deadTokenSoundPC-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'deadTokenSoundStable', {
        name: MODULE.ID + '.deadTokenSoundStable-Label',
        hint: MODULE.ID + '.deadTokenSoundStable-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'none',
        group: GROUP
    });

    // ----- Loot Tokens -----
    registerHeader('LootTokens', 'headingH2LootTokens-Label', 'headingH2LootTokens-Hint', 'H2', GROUP, 'world');
    registerHeader('LootConfiguration', 'headingH3LootConfiguration-Label', 'headingH3LootConfiguration-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenConvertDeadToLoot', {
        name: MODULE.ID + '.tokenConvertDeadToLoot-Label',
        hint: MODULE.ID + '.tokenConvertDeadToLoot-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenConvertDelay', {
        name: MODULE.ID + '.tokenConvertDelay-Label',
        hint: MODULE.ID + '.tokenConvertDelay-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 5, max: 60, step: 1 },
        default: 10,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootPileImage', {
        name: MODULE.ID + '.tokenLootPileImage-Label',
        hint: MODULE.ID + '.tokenLootPileImage-Hint',
        scope: 'world',
        config: true,
        type: String,
        requiresReload: false,
        default: 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp',
        filePicker: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootSound', {
        name: MODULE.ID + '.tokenLootSound-Label',
        hint: MODULE.ID + '.tokenLootSound-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: String,
        choices: soundChoices,
        default: 'modules/coffee-pub-blacksmith/sounds/clatter.mp3',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootChatMessage', {
        name: MODULE.ID + '.tokenLootChatMessage-Label',
        hint: MODULE.ID + '.tokenLootChatMessage-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });

    registerHeader('LootTreasure', 'headingH3LootTreasure-Label', 'headingH3LootTreasure-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenLootAddCoins', {
        name: MODULE.ID + '.tokenLootAddCoins-Label',
        hint: MODULE.ID + '.tokenLootAddCoins-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootMaxPlatinumAmount', {
        name: MODULE.ID + '.tokenLootMaxPlatinumAmount-Label',
        hint: MODULE.ID + '.tokenLootMaxPlatinumAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 0,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootMaxGoldAmount', {
        name: MODULE.ID + '.tokenLootMaxGoldAmount-Label',
        hint: MODULE.ID + '.tokenLootMaxGoldAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 5,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootMaxSilverAmount', {
        name: MODULE.ID + '.tokenLootMaxSilverAmount-Label',
        hint: MODULE.ID + '.tokenLootMaxSilverAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 5,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootMaxElectrumAmount', {
        name: MODULE.ID + '.tokenLootMaxElectrumAmount-Label',
        hint: MODULE.ID + '.tokenLootMaxElectrumAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 0,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootMaxCopperAmount', {
        name: MODULE.ID + '.tokenLootMaxCopperAmount-Label',
        hint: MODULE.ID + '.tokenLootMaxCopperAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 100, step: 1 },
        default: 5,
        group: GROUP
    });

    registerHeader('LootGeneral', 'headingH3LootGeneral-Label', 'headingH3LootGeneral-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenLootTableGeneral', {
        name: MODULE.ID + '.tokenLootTableGeneral-Label',
        hint: MODULE.ID + '.tokenLootTableGeneral-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'none',
        choices: tableChoices,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableGeneralAmount', {
        name: MODULE.ID + '.tokenLootTableGeneralAmount-Label',
        hint: MODULE.ID + '.tokenLootTableGeneralAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: true,
        type: Number,
        range: { min: 0, max: 30, step: 1 },
        default: 3,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableGeneralQuantity', {
        name: MODULE.ID + '.tokenLootTableGeneralQuantity-Label',
        hint: MODULE.ID + '.tokenLootTableGeneralQuantity-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 30, step: 1 },
        default: 1,
        group: GROUP
    });

    registerHeader('LootGear', 'headingH3LootGear-Label', 'headingH3LootGear-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenLootTableGear', {
        name: MODULE.ID + '.tokenLootTableGear-Label',
        hint: MODULE.ID + '.tokenLootTableGear-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'none',
        choices: tableChoices,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableGearAmount', {
        name: MODULE.ID + '.tokenLootTableGearAmount-Label',
        hint: MODULE.ID + '.tokenLootTableGearAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 10, step: 1 },
        default: 2,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableGearQuantity', {
        name: MODULE.ID + '.tokenLootTableGearQuantity-Label',
        hint: MODULE.ID + '.tokenLootTableGearQuantity-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 30, step: 1 },
        default: 1,
        group: GROUP
    });

    registerHeader('LootTablesTreasure', 'headingH3LootTablesTreasure-Label', 'headingH3LootTablesTreasure-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenLootTableTreasure', {
        name: MODULE.ID + '.tokenLootTableTreasure-Label',
        hint: MODULE.ID + '.tokenLootTableTreasure-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'none',
        choices: tableChoices,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableTreasureAmount', {
        name: MODULE.ID + '.tokenLootTableTreasureAmount-Label',
        hint: MODULE.ID + '.tokenLootTableTreasureAmount-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 10, step: 1 },
        default: 1,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableTreasureQuantity', {
        name: MODULE.ID + '.tokenLootTableTreasureQuantity-Label',
        hint: MODULE.ID + '.tokenLootTableTreasureQuantity-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 30, step: 1 },
        default: 1,
        group: GROUP
    });

    registerHeader('LootEpic', 'headingH3LootEpic-Label', 'headingH3LootEpic-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenLootTableEpic', {
        name: MODULE.ID + '.tokenLootTableEpic-Label',
        hint: MODULE.ID + '.tokenLootTableEpic-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        default: 'none',
        choices: tableChoices,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenLootTableEpicOdds', {
        name: MODULE.ID + '.tokenLootTableEpicOdds-Label',
        hint: MODULE.ID + '.tokenLootTableEpicOdds-Hint',
        scope: 'world',
        config: true,
        requiresReload: false,
        type: Number,
        range: { min: 0, max: 1000, step: 1 },
        default: 0,
        group: GROUP
    });

    // ----- Token and Portrait Image Replacement -----
    registerHeader('TokenImagePortraitReplacement', 'headingH2TokenImagePortraitReplacement-Label', 'headingH2TokenImagePortraitReplacement-Hint', 'H2', GROUP, 'world');
    registerHeader('headingH3TokenReplaceShared', 'headingH3TokenReplaceShared-Label', 'headingH3TokenReplaceShared-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementShowInCoffeePubToolbar', {
        name: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Label',
        hint: MODULE.ID + '.tokenImageReplacementShowInCoffeePubToolbar-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementShowInFoundryToolbar', {
        name: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Label',
        hint: MODULE.ID + '.tokenImageReplacementShowInFoundryToolbar-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementCategoryStyle', {
        name: MODULE.ID + '.tokenImageReplacementCategoryStyle-Label',
        hint: MODULE.ID + '.tokenImageReplacementCategoryStyle-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { buttons: 'Buttons', tabs: 'Tabs' },
        default: 'buttons',
        requiresReload: true,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementTagSortMode', {
        name: MODULE.ID + '.tokenImageReplacementTagSortMode-Label',
        hint: MODULE.ID + '.tokenImageReplacementTagSortMode-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { count: 'Count (by frequency)', alpha: 'Alpha (alphabetical)', hidden: 'Hidden (hide tags)' },
        default: 'count',
        requiresReload: false,
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'tokenImageReplacementLastMode', {
        scope: 'world',
        config: false,
        type: String,
        default: 'token',
        choices: { token: 'Token', portrait: 'Portrait' },
        group: GROUP
    });

    registerHeader('TokenImageReplacementDataWeights', 'headingH3TokenImageReplacementDataWeights-Label', 'headingH3TokenImageReplacementDataWeights-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementMonsterMapping', {
        type: Object,
        config: false,
        scope: 'world',
        default: {},
        group: GROUP
    });

    const weight = (key, def) => ({
        name: MODULE.ID + '.' + key + '-Label',
        hint: MODULE.ID + '.' + key + '-Hint',
        type: Number,
        config: true,
        scope: 'world',
        range: { min: 0, max: 100, step: 5 },
        default: def,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightActorName', weight('tokenImageReplacementWeightActorName', 90));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTokenName', weight('tokenImageReplacementWeightTokenName', 70));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', weight('tokenImageReplacementWeightRepresentedActor', 50));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureType', weight('tokenImageReplacementWeightCreatureType', 15));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureSubtype', weight('tokenImageReplacementWeightCreatureSubtype', 15));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightEquipment', weight('tokenImageReplacementWeightEquipment', 10));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightSize', weight('tokenImageReplacementWeightSize', 3));
    game.settings.register(MODULE.ID, 'tokenImageReplacementWeightTags', weight('tokenImageReplacementWeightTags', 25));

    registerHeader('TokenImageReplacementIgnored', 'TokenImageReplacementIgnored-Label', 'TokenImageReplacementIgnored-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredFolders', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredFolders-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '.DS_Store',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementDeprioritizedWords', {
        name: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Label',
        hint: MODULE.ID + '.tokenImageReplacementDeprioritizedWords-Hint',
        type: String,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: 'spirit',
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredWords', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredWords-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredWords-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementIgnoredTagPatterns', {
        name: MODULE.ID + '.tokenImageReplacementIgnoredTagPatterns-Label',
        hint: MODULE.ID + '.tokenImageReplacementIgnoredTagPatterns-Hint',
        scope: 'world',
        config: true,
        type: String,
        default: '',
        requiresReload: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementFilterGarbageTags', {
        name: MODULE.ID + '.tokenImageReplacementFilterGarbageTags-Label',
        hint: MODULE.ID + '.tokenImageReplacementFilterGarbageTags-Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
        group: GROUP
    });

    registerHeader('headingH3TokenReplacement', 'headingH3TokenReplacement-Label', 'headingH3TokenReplacement-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementEnabled', {
        name: MODULE.ID + '.tokenImageReplacementEnabled-Label',
        hint: MODULE.ID + '.tokenImageReplacementEnabled-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateDropped', {
        name: MODULE.ID + '.tokenImageReplacementUpdateDropped-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateDropped-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementThreshold', {
        name: MODULE.ID + '.tokenImageReplacementThreshold-Label',
        hint: MODULE.ID + '.tokenImageReplacementThreshold-Hint',
        type: Number,
        config: true,
        requiresReload: false,
        scope: 'world',
        range: { min: 0.1, max: 1.0, step: 0.05 },
        default: 0.3,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementFuzzySearch', {
        name: MODULE.ID + '.tokenImageReplacementFuzzySearch-Label',
        hint: MODULE.ID + '.tokenImageReplacementFuzzySearch-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementVariability', {
        name: MODULE.ID + '.tokenImageReplacementVariability-Label',
        hint: MODULE.ID + '.tokenImageReplacementVariability-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateMonsters', {
        name: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateMonsters-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateNPCs', {
        name: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateNPCs-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateVehicles', {
        name: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateVehicles-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementUpdateActors', {
        name: MODULE.ID + '.tokenImageReplacementUpdateActors-Label',
        hint: MODULE.ID + '.tokenImageReplacementUpdateActors-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementSkipLinked', {
        name: MODULE.ID + '.tokenImageReplacementSkipLinked-Label',
        hint: MODULE.ID + '.tokenImageReplacementSkipLinked-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    registerHeader('TokenImageReplacementCache', 'headingH3TokenImageReplacementCache-Label', 'headingH3TokenImageReplacementCache-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tokenImageReplacementCache', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: false
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementWindowState', {
        scope: 'client',
        config: false,
        type: Object,
        default: {},
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenImageReplacementDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        group: GROUP
    });

    game.settings.register(MODULE.ID, 'portraitImageReplacementCache', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: false
    });

    game.settings.register(MODULE.ID, 'numImageReplacementPaths', {
        name: MODULE.ID + '.numImageReplacementPaths-Label',
        hint: MODULE.ID + '.numImageReplacementPaths-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 0, max: 15, step: 1 },
        requiresReload: true,
        group: GROUP
    });
    registerImageReplacementPaths();

    registerHeader('PortraitImageReplacement', 'headingH3PortraitImageReplacement-Label', 'headingH3PortraitImageReplacement-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'portraitImageReplacementEnabled', {
        name: MODULE.ID + '.portraitImageReplacementEnabled-Label',
        hint: MODULE.ID + '.portraitImageReplacementEnabled-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateDropped', {
        name: MODULE.ID + '.portraitImageReplacementUpdateDropped-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateDropped-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementThreshold', {
        name: MODULE.ID + '.portraitImageReplacementThreshold-Label',
        hint: MODULE.ID + '.portraitImageReplacementThreshold-Hint',
        type: Number,
        config: true,
        requiresReload: false,
        scope: 'world',
        range: { min: 0.1, max: 1.0, step: 0.05 },
        default: 0.3,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementFuzzySearch', {
        name: MODULE.ID + '.portraitImageReplacementFuzzySearch-Label',
        hint: MODULE.ID + '.portraitImageReplacementFuzzySearch-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementVariability', {
        name: MODULE.ID + '.portraitImageReplacementVariability-Label',
        hint: MODULE.ID + '.portraitImageReplacementVariability-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateMonsters', {
        name: MODULE.ID + '.portraitImageReplacementUpdateMonsters-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateMonsters-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateNPCs', {
        name: MODULE.ID + '.portraitImageReplacementUpdateNPCs-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateNPCs-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateVehicles', {
        name: MODULE.ID + '.portraitImageReplacementUpdateVehicles-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateVehicles-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementUpdateActors', {
        name: MODULE.ID + '.portraitImageReplacementUpdateActors-Label',
        hint: MODULE.ID + '.portraitImageReplacementUpdateActors-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'portraitImageReplacementSkipLinked', {
        name: MODULE.ID + '.portraitImageReplacementSkipLinked-Label',
        hint: MODULE.ID + '.portraitImageReplacementSkipLinked-Hint',
        type: Boolean,
        config: true,
        requiresReload: false,
        scope: 'world',
        default: true,
        group: GROUP
    });

    registerHeader('PortraitImageReplacementCache', 'headingH3PortraitImageReplacementCache-Label', 'headingH3PortraitImageReplacementCache-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'numPortraitImageReplacementPaths', {
        name: MODULE.ID + '.numPortraitImageReplacementPaths-Label',
        hint: MODULE.ID + '.numPortraitImageReplacementPaths-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 0, max: 15, step: 1 },
        requiresReload: true,
        group: GROUP
    });
    registerPortraitImageReplacementPaths();

    // ----- Tile / Map Image Placement -----
    registerHeader('TileImagePlacement', 'headingH2TileImagePlacement-Label', 'headingH2TileImagePlacement-Hint', 'H2', GROUP, 'world');
    registerHeader('headingH3TileImagePaths', 'headingH3TileImagePaths-Label', 'headingH3TileImagePaths-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'numTileImagePaths', {
        name: MODULE.ID + '.numTileImagePaths-Label',
        hint: MODULE.ID + '.numTileImagePaths-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 0, max: 15, step: 1 },
        requiresReload: true,
        group: GROUP
    });
    registerTileImagePaths();

    registerHeader('headingH3TileImageDefaults', 'headingH3TileImageDefaults-Label', 'headingH3TileImageDefaults-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tileDefaultAssetGridSize', {
        name: MODULE.ID + '.tileDefaultAssetGridSize-Label',
        hint: MODULE.ID + '.tileDefaultAssetGridSize-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 100,
        range: { min: 16, max: 1000, step: 1 },
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultRotation', {
        name: MODULE.ID + '.tileDefaultRotation-Label',
        hint: MODULE.ID + '.tileDefaultRotation-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 0,
        range: { min: 0, max: 359, step: 1 },
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultAlpha', {
        name: MODULE.ID + '.tileDefaultAlpha-Label',
        hint: MODULE.ID + '.tileDefaultAlpha-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1.0,
        range: { min: 0.1, max: 1.0, step: 0.05 },
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultTint', {
        type: String, config: false, scope: 'world', default: '#ffffff', group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultLocked', {
        name: MODULE.ID + '.tileDefaultLocked-Label',
        hint: MODULE.ID + '.tileDefaultLocked-Hint',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultHidden', {
        name: MODULE.ID + '.tileDefaultHidden-Label',
        hint: MODULE.ID + '.tileDefaultHidden-Hint',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultForeground', {
        type: Boolean, config: false, scope: 'world', default: false, group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDefaultElevation', {
        name: MODULE.ID + '.tileDefaultElevation-Label',
        hint: MODULE.ID + '.tileDefaultElevation-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 0,
        range: { min: -10, max: 100, step: 1 },
        requiresReload: false,
        group: GROUP
    });

    registerHeader('headingH3TileImageSearch', 'headingH3TileImageSearch-Label', 'headingH3TileImageSearch-Hint', 'H3', GROUP, 'world');

    game.settings.register(MODULE.ID, 'tileImageFuzzySearch', {
        name: MODULE.ID + '.tileImageFuzzySearch-Label',
        hint: MODULE.ID + '.tileImageFuzzySearch-Hint',
        type: Boolean,
        config: true,
        scope: 'world',
        default: false,
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileDropShadow', {
        name: MODULE.ID + '.tileDropShadow-Label',
        hint: MODULE.ID + '.tileDropShadow-Hint',
        type: Boolean,
        config: false,
        scope: 'world',
        default: true,
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tilePlacementLastMode', {
        type: Boolean, config: false, scope: 'world', default: false, group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultSize', {
        type: Number, config: false, scope: 'world', default: 200, group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultShape', {
        type: String, config: false, scope: 'world', default: 'square', group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultBorderColor', {
        type: String, config: false, scope: 'world', default: '#ffffff', group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultBorderWidth', {
        type: Number, config: false, scope: 'world', default: 10, group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultImageFit', {
        type: String, config: false, scope: 'world', default: 'cover', group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultImageZoom', {
        type: Number, config: false, scope: 'world', default: 1.0, group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultVisibility', {
        type: String, config: false, scope: 'world', default: 'observer', group: GROUP
    });
    game.settings.register(MODULE.ID, 'pinDefaultDropShadow', {
        type: Boolean, config: false, scope: 'world', default: true, group: GROUP
    });
    game.settings.register(MODULE.ID, 'tokenDropShadow', {
        name: MODULE.ID + '.tokenDropShadow-Label',
        hint: MODULE.ID + '.tokenDropShadow-Hint',
        type: Boolean,
        config: false,
        scope: 'world',
        default: false,
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileImageTagSortMode', {
        name: MODULE.ID + '.tileImageTagSortMode-Label',
        hint: MODULE.ID + '.tileImageTagSortMode-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { count: 'Count (by frequency)', alpha: 'Alpha (alphabetical)', hidden: 'Hidden (hide tags)' },
        default: 'count',
        requiresReload: false,
        group: GROUP
    });
    game.settings.register(MODULE.ID, 'tileImageCategoryStyle', {
        name: MODULE.ID + '.tileImageCategoryStyle-Label',
        hint: MODULE.ID + '.tileImageCategoryStyle-Hint',
        scope: 'world',
        config: true,
        type: String,
        choices: { buttons: 'Buttons', tabs: 'Tabs' },
        default: 'buttons',
        requiresReload: true,
        group: GROUP
    });

    // Hidden / non-config tile settings
    game.settings.register(MODULE.ID, 'tileImageCache', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        requiresReload: false
    });
    game.settings.register(MODULE.ID, 'tileImageDisplayCacheStatus', {
        scope: 'world',
        config: false,
        type: String,
        default: '',
        group: GROUP
    });
}
