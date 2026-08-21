// ================================================================== 
// ===== TOKEN IMAGE UTILITIES ======================================
// ================================================================== 

import '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { notify } from './notifications.js';
import { MODULE } from './const.js';
import { ImageCacheManager } from './manager-image-cache.js';
import { LootUtilities } from './loot-utilities.js';
import { LootManager } from './manager-loot.js';
import { HookManager } from './manager-hooks.js';
import { isTokenAlive } from './document-liveness.js';

/**
 * Token Image Utilities
 * Handles dead token functionality and other token enhancements
 */
export class TokenImageUtilities {
    // Death save overlay management
    static _deathSaveOverlays = new Map(); // Map of tokenId -> graphics object
    static _deathSaveStates = new Map(); // Map of actorId -> {wasStable: bool, wasHealed: bool} for tracking state changes
    
    // Loot conversion timeout management
    static _lootConversionTimeouts = new Map(); // Map of tokenId -> setTimeout ID for cleanup
    static _canvasReadyTimeout = null; // Track canvasReady setTimeout for cleanup

    /**
     * Store the original image for a token before any updates
     */
    static async storeOriginalImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        const src = tokenDocument.texture?.src ?? tokenDocument.texture?.path ?? null;
        if (src == null || typeof src !== 'string') {
            return;
        }
        const originalImage = {
            path: src,
            name: src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'originalImage', originalImage);
    }

    /**
     * Get the original image for a token
     */
    static getOriginalImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'originalImage') || null;
    }

    /**
     * Store the previous image for a token before applying dead token
     * This allows restoration to the replaced image (not original) when revived
     */
    static async storePreviousImage(tokenDocument) {
        if (!tokenDocument || !tokenDocument.texture) {
            return;
        }
        
        const previousImage = {
            path: tokenDocument.texture.src,
            name: tokenDocument.texture.src.split('/').pop(),
            timestamp: Date.now()
        };
        
        // Store in token flags for persistence
        await tokenDocument.setFlag(MODULE.ID, 'previousImage', previousImage);
    }

    /**
     * Get the previous image for a token (image before dead token was applied)
     */
    static getPreviousImage(tokenDocument) {
        if (!tokenDocument) {
            return null;
        }
        
        // Get from token flags for persistence
        return tokenDocument.getFlag(MODULE.ID, 'previousImage') || null;
    }

    /**
     * Restore the previous token image (used when token is revived)
     */
    static async restorePreviousTokenImage(tokenDocument) {
        if (!tokenDocument) {
            return;
        }
        
        const previousImage = TokenImageUtilities.getPreviousImage(tokenDocument);
        if (previousImage) {
            try {
                await tokenDocument.update({ 'texture.src': previousImage.path });
                // Clear dead token flag
                await tokenDocument.unsetFlag(MODULE.ID, 'isDeadTokenApplied');
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Restored previous image for ${tokenDocument.name}`, "", true, false);
            } catch (error) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Replacement: Error restoring previous image: ${error.message}`, "", true, false);
            }
        }
    }

    /**
     * Get the dead token image path based on character type
     * @param {boolean} isPlayerCharacter - Whether this is a player character
     * @returns {string} Path to the appropriate dead token image
     */
    static getDeadTokenImagePath(isPlayerCharacter = false) {
        let deadTokenPath;
        
        if (isPlayerCharacter) {
            // PC has failed 3 death saves - use PC-specific dead token from setting
            deadTokenPath = BlacksmithUtils.getSettingSafely(MODULE.ID, 'deadTokenImagePathPC', 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-pc.webp');
        } else {
            // NPC/Monster - use existing setting
            deadTokenPath = BlacksmithUtils.getSettingSafely(MODULE.ID, 'deadTokenImagePath', 'modules/coffee-pub-blacksmith/images/tokens/death/pog-round-npc.webp');
        }
        
        // Check if the file exists in our cache (only if cache is available)
        if (ImageCacheManager.cache && ImageCacheManager.cache.files) {
            const fileName = deadTokenPath.split('/').pop();
            const cachedFile = ImageCacheManager.cache.files.get(fileName.toLowerCase());
            
            if (cachedFile) {
                return cachedFile.fullPath;
            }
        }
        
        // If not in cache or cache not available, return the path as-is
        return deadTokenPath;
    }

    /**
     * Unified token image management - based on working dead token code
     * @param {TokenDocument} tokenDocument - The token document
     * @param {string} mode - 'dead', 'loot', or 'restore'
     * @param {object} options - Additional options (actor, isPlayerCharacter)
     */
    static async updateTokenImage(tokenDocument, mode, options = {}) {
        if (!tokenDocument) return;
        
        // RESTORE MODE
        if (mode === 'restore') {
            const currentImage = tokenDocument.getFlag(MODULE.ID, 'currentImage');
            if (currentImage) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - BEFORE update - current texture: ${tokenDocument.texture.src}`, "", true, false);
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - Attempting to restore to: ${currentImage}`, "", true, false);
                
                try {
                    // Use the object form for the update to ensure it works with unlinked tokens
                    const updateData = { 'texture.src': currentImage };
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - BEFORE current image for ${tokenDocument.name} to: ${currentImage}`, "", true, false);
                    await tokenDocument.update(updateData, { render: true, diff: false });
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - AFTER update - new texture: ${tokenDocument.texture.src}`, "", true, false);
                    
                    // Clear all flags
                    await tokenDocument.unsetFlag(MODULE.ID, 'currentImage');
                    await tokenDocument.unsetFlag(MODULE.ID, 'currentImageStored');
                    await tokenDocument.unsetFlag(MODULE.ID, 'imageState');
                    await tokenDocument.unsetFlag(MODULE.ID, 'isDeadTokenApplied');
                    
                } catch (error) {
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: updateTokenImage - ERROR restoring image: ${error.message}`, "", false, false);
                }
            }
            return;
        }
        
        // STORE CURRENT IMAGE (only once)
        const alreadyStored = tokenDocument.getFlag(MODULE.ID, 'currentImageStored');
        if (!alreadyStored) {
            const currentImage = tokenDocument.texture.src;
            await tokenDocument.setFlag(MODULE.ID, 'currentImage', currentImage);
            await tokenDocument.setFlag(MODULE.ID, 'currentImageStored', true);
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Stored current image for ${tokenDocument.name}: ${currentImage}`, "", true, false);
        } else {
            const storedImage = tokenDocument.getFlag(MODULE.ID, 'currentImage');
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Current image already stored for ${tokenDocument.name}: ${storedImage}`, "", false, false);
        }
        
        // DEAD MODE
        if (mode === 'dead') {
            const isPlayerCharacter = options.isPlayerCharacter || false;
            
            // Check if dead token is already applied
            const isDeadTokenApplied = tokenDocument.getFlag(MODULE.ID, 'isDeadTokenApplied');
            if (isDeadTokenApplied) {
                return; // Already showing dead token
            }
            
            // Get the appropriate token image path
            const deadTokenPath = TokenImageUtilities.getDeadTokenImagePath(isPlayerCharacter);
            
            if (deadTokenPath) {
                // Several awaits have already run above -- the stored-image writes -- and
                // a token can die in any of them. Re-checked here rather than trusting
                // the check at the top of the function, which proved something about a
                // different moment.
                if (!isTokenAlive(tokenDocument)) {
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Skipping dead token image - token was removed", "", true, false);
                    return;
                }
                try {
                    await tokenDocument.update({ 'texture.src': deadTokenPath });
                    // And again between each write, for the same reason.
                    if (!isTokenAlive(tokenDocument)) return;
                    await tokenDocument.setFlag(MODULE.ID, 'isDeadTokenApplied', true);
                    if (!isTokenAlive(tokenDocument)) return;
                    await tokenDocument.setFlag(MODULE.ID, 'imageState', 'dead');
                   
                    // Play death sound based on character type
                    const soundSetting = isPlayerCharacter ? 'deadTokenSoundPC' : 'deadTokenSoundNPC';
                    const sound = BlacksmithUtils.getSettingSafely(MODULE.ID, soundSetting, 'none');
                    if (sound && sound !== 'none') {
                        await BlacksmithUtils.playSound(sound, 0.7, false, true);
                    }
                } catch (error) {
                    // A token deleted *inside* one of those awaits lands here however
                    // many checks precede it: a synchronous check cannot cover the
                    // asynchronous gap after it. That is the outcome we wanted -- do
                    // not dress it up as a failure.
                    if (!isTokenAlive(tokenDocument)) {
                        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, "Token Image Utilities: Token was removed while applying its dead image", "", true, false);
                    } else {
                        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Error applying dead token: ${error.message}`, "", false, false);
                    }
                }
            }
        }
        
        // LOOT MODE
        if (mode === 'loot') {
            const lootImagePath = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenLootPileImage', 'modules/coffee-pub-blacksmith/images/tokens/death/splat-round-loot-sack.webp');
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: LOOT MODE - updating ${tokenDocument.name} to: ${lootImagePath}`, "", true, false);
            
            try {
                await tokenDocument.update({ 'texture.src': lootImagePath });
                await tokenDocument.setFlag(MODULE.ID, 'imageState', 'loot');
            } catch (error) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Error applying loot token: ${error.message}`, "", false, false);
            }
        }
    }

    /**
     * Convert token to dead (handles creature type filtering and image change)
     * @param {TokenDocument} tokenDocument - The token document
     * @param {Actor} actor - The actor
     */
    static async _convertTokenToDead(tokenDocument, actor) {
        // Determine if this is a player character
        const isPlayerCharacter = actor.type === 'character';
        
        // Check creature type filter (skip for player characters)
        if (!isPlayerCharacter) {
            const creatureType = actor?.system?.details?.type?.value?.toLowerCase() || '';
            const allowedTypes = BlacksmithUtils.getSettingSafely(MODULE.ID, 'deadTokenCreatureTypeFilter', '');
            
            if (allowedTypes && allowedTypes.trim() !== '') {
                const types = allowedTypes.split(',').map(t => t.trim().toLowerCase());
                if (!types.includes(creatureType)) {
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Skipping dead token for ${tokenDocument.name} - creature type ${creatureType} not in filter`, "", true, false);
                    return;
                }
            }
        }
        
        // Use unified function
        await TokenImageUtilities.updateTokenImage(tokenDocument, 'dead', { isPlayerCharacter });
    }

    /**
     * Convert token to loot pile (moved from manager-canvas.js)
     */
    static async _convertTokenToLoot(token) {
        try {
            // Check if user has permission to update tokens
            if (!game.user.isGM) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, "Only Game Masters can convert tokens to loot.", "", true, false);
                return;
            }
            
            const generationId = await LootManager.markPreparing(token.document);
            
            // Check if loot has already been added to this token
            const lootAlreadyAdded = token.document.getFlag(MODULE.ID, 'blnLootAdded');
            
            if (!lootAlreadyAdded) {
                await LootUtilities.addLootToActor(token.actor);
                // Mark that loot has been added
                await token.document.setFlag(MODULE.ID, 'blnLootAdded', true);
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Added loot to ${token.name}`, "", true, false);
            } else {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Loot already added to ${token.name}, skipping loot generation`, "", true, false);
            }

            // Epic loot roll is handled by addLootToActor when called above (first time); no second call here.

            // Loot generation awaits; the body may be gone by now.
            if (!isTokenAlive(token.document)) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: ${token.name} was removed before loot was ready`, "", true, false);
                return;
            }

            const settled = await LootManager.markReady(token.document, generationId);

            // Nothing new dropped on a re-death: generation is once per token, so the
            // body is only offering leftovers. Announcing it again would send players
            // back to something they already emptied, and combat healing makes a
            // creature dying twice ordinary rather than rare.
            if (lootAlreadyAdded || settled !== LootManager.STATES.READY) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: ${token.name} settled as ${settled || 'stale'}; no new loot announced`, "", true, false);
                return;
            }

            // Play sound
            const sound = game.settings.get(MODULE.ID, 'tokenLootSound');
            if (sound && sound !== 'none' && sound !== 'sound-none') {
                await BlacksmithUtils.playSound(sound, 0.5, false, true);
            }

            // Curator's own card rather than Blacksmith's shared loot-drop block, so
            // Curator owns its own message. Announcement only.
            if (game.settings.get(MODULE.ID, 'tokenLootChatMessage')) {
                // The token name is a literal: names are renamable in play, so
                // "Bugbear *Chief*" must show its asterisks rather than italicise
                // the rest of the sentence, and an @UUID in a name must not be
                // obeyed by the enricher. `mark` keeps the bold regardless.
                const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
                await chatCards.post({
                    moduleId: MODULE.ID,
                    type: 'loot-drop',
                    parts: [
                        { part: 'header', icon: 'fa-solid fa-coins', title: 'Loot Dropped!' },
                        { part: 'prose', blocks: [{ type: 'paragraph', text: [
                            { literal: token.name, mark: 'strong' },
                            ' has been defeated and dropped their belongings!'
                        ] }] },
                        // No `uuid`: that builds a document link to the token, which
                        // opens the actor sheet rather than the body. `clickable` makes
                        // the whole row the way in to the loot window instead. Without a
                        // uuid the label is ordinary consumer text, so the name needs its
                        // literal here as much as the sentence above does.
                        { part: 'rows', items: [{
                            img: token.actor?.img ?? token.document.texture.src,
                            label: { literal: token.name },
                            moduleId: MODULE.ID,
                            action: 'open-loot',
                            value: token.document.uuid,
                            clickable: true,
                            tooltip: 'Open the loot window'
                        }] }
                    ]
                });
            }
        } catch (error) {
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Error converting token to loot: ${error.message}`, "", true, false);
        }
    }

    /**
     * Centralized HP monitoring function - handles all HP-related state changes
     */
    static async onActorHPChange(actor, changes, options, userId) {
        // Only GMs can update tokens
        if (!game.user.isGM) {
            return;
        }
        
        // Check if HP or death saves changed
        const hpChanged = changes.system?.attributes?.hp !== undefined;
        const deathSavesChanged = changes.system?.attributes?.death !== undefined;
        
        if (!hpChanged && !deathSavesChanged) {
            return;
        }
        
        // Get current HP
        const currentHP = actor.system.attributes.hp.value;
        
        // Determine if this is a player character
        const isPlayerCharacter = actor.type === 'character';
        
        // Find all tokens for this actor on current scene
        if (!canvas.scene) {
            return;
        }
        
        const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
        
        // CRITICAL FIX: Only process tokens that actually have the updated HP value
        // This prevents all tokens of the same actor from getting updated when only one changes
        const updatedTokens = tokens.filter(token => {
            const tokenHP = token.actor?.system?.attributes?.hp?.value;
            return tokenHP === currentHP;
        });
        
        // If no tokens match the current HP, fall back to all tokens (for safety)
        const tokensToProcess = updatedTokens.length > 0 ? updatedTokens : tokens;
        
        
        for (const token of tokensToProcess) {
            if (currentHP <= 0) {

                // *** SET IMAGE MODE ***

                // Token at 0 HP or below - check dead token settings
                // DEAD TOKEN MODE CHECK
                const deadTokenEnabled = BlacksmithUtils.getSettingSafely(MODULE.ID, 'enableDeadTokenReplacement', false);
                if (deadTokenEnabled) {
                    // For player characters, check death saves
                    let hasFailed3DeathSaves = false;
                    if (isPlayerCharacter) {
                        const deathSaves = actor.system.attributes.death;
                        if (deathSaves) {
                            hasFailed3DeathSaves = (deathSaves.failure >= 3);
                        }
                    }
                    
                    // Apply dead token based on character type and death save
                    if (isPlayerCharacter) {
                        if (hasFailed3DeathSaves) {
                            // PC has failed 3 death saves - apply dead token
                            await TokenImageUtilities._convertTokenToDead(token.document, actor);
                        }
                        // Otherwise: PC is unconscious but not dead - DO NOT change token (keep original)
                    } else {
                        // NPC at 0 HP - apply dead token immediately
                        await TokenImageUtilities._convertTokenToDead(token.document, actor);
                    }
                }
                
                // LOOT MODE CHECK
                // Check if loot conversion is enabled (NPCs only)
                const lootEnabled = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenConvertDeadToLoot', false);
                const delay = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenConvertDelay', 5) * 1000;
                const tokenId = token.id; // Capture the specific token ID

                // If NPC and loot conversion is enabled, schedule loot actions after delay
                if (!isPlayerCharacter && lootEnabled) {
                    // Clear any existing timeout for this token
                    const existingTimeout = TokenImageUtilities._lootConversionTimeouts.get(tokenId);
                    if (existingTimeout) {
                        clearTimeout(existingTimeout);
                    }

                    // Deferred until the encounter ends. Marked on the document rather
                    // than held in memory so a reload mid-combat does not lose the body.
                    // Branch rather than return: the overlay refresh at the end of this
                    // function still has to run.
                    const afterCombat = BlacksmithUtils.getSettingSafely(MODULE.ID, 'tokenConvertAfterCombat', false);
                    const holdForCombat = afterCombat && game.combat?.started;
                    if (holdForCombat) {
                        await token.document.setFlag(MODULE.ID, 'lootAwaitingCombatEnd', true);
                        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Holding loot conversion for ${token.name} until combat ends`, "", true, false);
                    } else {
                        // Schedule loot actions after delay
                        const timeoutId = setTimeout(async () => {
                            // Find the SPECIFIC token by ID, not just any token with the same actor
                            const lootToken = canvas.tokens.placeables.find(t => t.id === tokenId);
                            TokenImageUtilities._lootConversionTimeouts.delete(tokenId);

                            // Everything below uses the re-found token, never the
                            // reference captured before the delay: the body may have
                            // been removed while the timer ran.
                            if (!lootToken || !isTokenAlive(lootToken.document)) return;

                            if (Number(lootToken.actor?.system?.attributes?.hp?.value ?? 1) <= 0) {
                                await TokenImageUtilities._convertTokenToLoot(lootToken);
                            }

                            if (!isTokenAlive(lootToken.document)) return;
                            await TokenImageUtilities.updateTokenImage(lootToken.document, 'loot');
                        }, delay);

                        // Store the timeout ID for cleanup
                        TokenImageUtilities._lootConversionTimeouts.set(tokenId, timeoutId);
                    }
                }
            } else {
                // *** RESTORE IMAGE MODE ***
                // Token was revived (HP > 0) - restore current image if any state was applied
                const imageState = token.document.getFlag(MODULE.ID, 'imageState');
                const storedImage = token.document.getFlag(MODULE.ID, 'currentImage');
                
                // Cancel any pending loot conversion for this token
                const pendingTimeout = TokenImageUtilities._lootConversionTimeouts.get(token.id);
                if (pendingTimeout) {
                    clearTimeout(pendingTimeout);
                    TokenImageUtilities._lootConversionTimeouts.delete(token.id);
                }

                await LootManager.clear(token.document);
                if (token.document.getFlag(MODULE.ID, 'lootAwaitingCombatEnd') !== undefined) {
                    await token.document.unsetFlag(MODULE.ID, 'lootAwaitingCombatEnd');
                }
                
                if (imageState && (imageState === 'dead' || imageState === 'loot')) {
                    // Re-resolve: the loot flag clear above may have replaced the document
                    const freshToken = canvas.tokens.get(token.id);
                    if (freshToken) {
                        // Restore the current image using unified function with fresh reference
                        await TokenImageUtilities.updateTokenImage(freshToken.document, 'restore');
                    }
                }

            }
        }
        
        // Update death save overlays for all tokens
        TokenImageUtilities.updateDeathSaveOverlays();
    }

    // ================================================================== 
    // ===== DEATH SAVE OVERLAY FUNCTIONALITY ===========================
    // ==================================================================
    
    /**
     * Update death save overlays for all tokens at 0 HP
     */
    static updateDeathSaveOverlays() {
        if (!canvas.scene) return;
        
        // Check all tokens in the scene
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            if (!actor) continue;
            
            // Only show for player characters
            if (actor.type !== 'character') {
                // Remove overlay if it exists for non-PCs
                this._removeDeathSaveOverlay(token.id);
                continue;
            }
            
            const currentHP = actor.system?.attributes?.hp?.value || 0;
            const deathSaves = actor.system?.attributes?.death;
            const isStable = actor.system?.attributes?.hp?.stable || false;
            
            // Get previous state for this actor
            const previousState = this._deathSaveStates.get(actor.id) || { wasStable: false, wasAt0HP: false };
            
            if (currentHP <= 0 && deathSaves) {
                const successes = deathSaves.success || 0;
                const failures = deathSaves.failure || 0;
                
                // Check if they're stable (either by flag OR by 3 successes) or have 3 failures (dead)
                const isActuallyStable = isStable || successes >= 3;
                
                // Debug logging
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: ${actor.name} - successes: ${successes}, failures: ${failures}, isStable: ${isStable}, isActuallyStable: ${isActuallyStable}`, "", true, false);
                
                if (failures >= 3) {
                    // Remove overlay - they're dead
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Removing overlay for ${actor.name} - dead`, "", true, false);
                    this._removeDeathSaveOverlay(token.id);
                    // Update state
                    this._deathSaveStates.set(actor.id, { wasStable: false, wasAt0HP: true });
                } else {
                    // Check if they just became stable (wasn't stable before, is stable now)
                    if (isActuallyStable && !previousState.wasStable) {
                        // Play stable sound
                        const stableSound = BlacksmithUtils.getSettingSafely(MODULE.ID, 'deadTokenSoundStable', 'none');
                        if (stableSound && stableSound !== 'none') {
                            BlacksmithUtils.playSound(stableSound, 0.7, false, true);
                        }
                    }
                    
                    // Show/update overlay (either dying or stable)
                    BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: Showing overlay for ${actor.name} - ${isActuallyStable ? 'stable' : 'dying'}`, "", true, false);
                    this._createOrUpdateDeathSaveOverlay(token, successes, failures, isActuallyStable);
                    
                    // Update state
                    this._deathSaveStates.set(actor.id, { wasStable: isActuallyStable, wasAt0HP: true });
                }
            } else {
                // Check if they were just healed (was at 0 HP, now > 0)
                if (previousState.wasAt0HP && currentHP > 0) {
                    // Play stable/heal sound
                    const stableSound = BlacksmithUtils.getSettingSafely(MODULE.ID, 'deadTokenSoundStable', 'none');
                    if (stableSound && stableSound !== 'none') {
                        BlacksmithUtils.playSound(stableSound, 0.7, false, true);
                    }
                }
                
                // Remove overlay if HP > 0
                this._removeDeathSaveOverlay(token.id);
                // Update state
                this._deathSaveStates.set(actor.id, { wasStable: false, wasAt0HP: false });
            }
        }
    }
    
    /**
     * Create or update death save overlay for a token
     */
    static _createOrUpdateDeathSaveOverlay(token, successes, failures, isStable) {
        // Check if overlay already exists and is valid (not destroyed)
        const existingGraphics = this._deathSaveOverlays.get(token.id);
        if (existingGraphics) {
            const isValid = !existingGraphics.destroyed && existingGraphics.parent;
            BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: DEBUG - Existing overlay found for ${token.name}, destroyed: ${existingGraphics.destroyed}, hasParent: ${!!existingGraphics.parent}, isValid: ${isValid}`, "", true, false);
            if (isValid) {
                return;
            }
        }
        
        BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Token Image Utilities: DEBUG - Creating overlay for ${token.name}`, "", true, false);
        
        // Remove existing overlay if present (even if destroyed, to clean up the map)
        this._removeDeathSaveOverlay(token.id);
        
        const graphics = new PIXI.Graphics();
        // Configuration
        const ringOutterRadius = 8;
        const ringOpacity = 0.4;
        const ringBackgroundOpacity = 0.4;
        const dotRadius = 2; // Dot radius
        const dotSpacingNumSegments = 18;
        const dotColorBorder = 0xFBF8DA;
        const dotBorderThickness = 1;
        const dotBorderOpacity = 0.7;
        const dotColorSuccess = 0x03C602;
        const dotColorFailure = 0xCB1B1C;
        const dotColorEmpty = 0xFBF8DA;
        const dotColorOpacity = 0.7;
        
        // Animation settings
        const heartbeatSpeed = 0.003; // Animation speed multiplier (lower = slower)
        const heartbeatCycleDuration = 10; // Total cycle duration in seconds
        const heartbeatFirstPulseDuration = 0.9; // First pulse duration
        const heartbeatSecondPulseDuration = 0.9; // Second pulse duration
        const heartbeatRestDuration = heartbeatCycleDuration - heartbeatFirstPulseDuration - heartbeatSecondPulseDuration; // Rest duration
        const heartbeatMinOpacity = 0.3; // Minimum background opacity
        const heartbeatMaxOpacity = 1.0; // Maximum background opacity
        
        // Death save state colors
        const dyingRingColor = 0x240B0B; // Red for dying
        const dyingBackgroundColor = 0x9B1819; // Red background for dying
        const stableRingColor = 0x0B240B; // Green for stable
        const stableBackgroundColor = 0x189B18; // Green background for stable
        
        const ringRadius = Math.max(token.document.width, token.document.height) * canvas.grid.size / 2 + ringOutterRadius; // Ring around token
        const dotDistance = ringRadius + 0; // Distance from token center to dots
        
        // Calculate token center
        const center = this._calculateTokenCenter(token);
        
        // Determine death save state
        let currentRingColor, currentBackgroundColor, shouldAnimate, shouldShowDots;
        if (isStable) {
            // Stable - actor.system.attributes.hp.stable = true
            currentRingColor = stableRingColor;
            currentBackgroundColor = stableBackgroundColor;
            shouldAnimate = true; // Keep heartbeat animation for stable
            shouldShowDots = false; // No dots for stable
        } else {
            // Dying - still making death saves (failures >= 3 case is handled by removing overlay)
            currentRingColor = dyingRingColor;
            currentBackgroundColor = dyingBackgroundColor;
            shouldAnimate = true; // Animate for dying
            shouldShowDots = true; // Show dots for dying
        }
        
        // Draw ring around token (at 0,0 - will be positioned later)
        graphics.lineStyle(ringOutterRadius, currentRingColor, ringOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        
        // Fill the center with semi-transparent color
        graphics.beginFill(currentBackgroundColor, ringBackgroundOpacity);
        graphics.drawCircle(0, 0, ringRadius);
        graphics.endFill();
        
        // Draw dots only if not stable
        if (shouldShowDots) {
            // Draw success dots (top half of ring) - center dot at top, others on sides
        for (let i = 0; i < 3; i++) {
            let angle;
            if (i === 0) {
                angle = Math.PI / 2; // 90Â° - directly at top
            } else if (i === 1) {
                angle = Math.PI / 2 + Math.PI / dotSpacingNumSegments; // 120Â° - top right
            } else {
                angle = Math.PI / 2 - Math.PI / dotSpacingNumSegments; // 60Â° - top left
            }
            const dotX = Math.cos(angle) * dotDistance;
            const dotY = Math.sin(angle) * dotDistance;
            
            graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity); 
            if (i < successes) {
                graphics.beginFill(dotColorSuccess, dotColorOpacity);
            } else {
                graphics.beginFill(dotColorEmpty, dotColorOpacity); 
            }
            graphics.drawCircle(dotX, dotY, dotRadius);
            graphics.endFill();
        }
        
        // Draw failure dots (bottom half of ring) - center dot at bottom, others on sides
        for (let i = 0; i < 3; i++) {
            let angle;
            if (i === 0) {
                angle = Math.PI / 2 + Math.PI; // 270Â° - directly at bottom
            } else if (i === 1) {
                angle = Math.PI / 2 + Math.PI + Math.PI / dotSpacingNumSegments; // 300Â° - bottom right
            } else {
                angle = Math.PI / 2 + Math.PI - Math.PI / dotSpacingNumSegments; // 240Â° - bottom left
            }
            const dotX = Math.cos(angle) * dotDistance;
            const dotY = Math.sin(angle) * dotDistance;
            
            graphics.lineStyle(dotBorderThickness, dotColorBorder, 1);
            if (i < failures) {
                graphics.beginFill(dotColorFailure, dotColorOpacity);
            } else {
                graphics.beginFill(dotColorEmpty, dotColorOpacity);
            }
            graphics.drawCircle(dotX, dotY, dotRadius);
            graphics.endFill();
        }
        } // Close shouldShowDots conditional
        
        // Add heartbeat animation to the background (only for dying state)
        const heartbeatAnimation = (delta) => {
            // Safety check: if graphics object is destroyed, stop animation
            if (!graphics || graphics.destroyed) {
                canvas.app.ticker.remove(heartbeatAnimation);
                return;
            }
            
            // Only animate if character is dying
            if (!shouldAnimate) {
                return;
            }
            
            const time = Date.now() * heartbeatSpeed; // Use configurable speed
            // Heartbeat pattern: quick pulse, pause, quick pulse, longer pause
            let heartbeat;
            const cycle = time % heartbeatCycleDuration; // Use configurable cycle duration
            if (cycle < heartbeatFirstPulseDuration) {
                // First quick pulse
                heartbeat = heartbeatMinOpacity + (heartbeatMaxOpacity - heartbeatMinOpacity) * Math.sin(cycle * Math.PI / heartbeatFirstPulseDuration);
            } else if (cycle < heartbeatFirstPulseDuration + heartbeatSecondPulseDuration) {
                // Second quick pulse
                const pulseTime = (cycle - heartbeatFirstPulseDuration) / heartbeatSecondPulseDuration;
                heartbeat = heartbeatMinOpacity + (heartbeatMaxOpacity - heartbeatMinOpacity) * Math.sin(pulseTime * Math.PI);
            } else if (cycle < heartbeatFirstPulseDuration + heartbeatSecondPulseDuration + heartbeatRestDuration) {
                // Rest period
                heartbeat = heartbeatMinOpacity;
            } else {
                // Should never reach here, but fallback to rest
                heartbeat = heartbeatMinOpacity;
            }
            
            // Clear and redraw with animated background opacity
            graphics.clear();
            
            // Redraw ring (at 0,0 - graphics object is positioned at center)
            graphics.lineStyle(ringOutterRadius, currentRingColor, ringOpacity);
            graphics.drawCircle(0, 0, ringRadius);
            
            // Redraw background with heartbeat animation
            graphics.beginFill(currentBackgroundColor, ringBackgroundOpacity * heartbeat);
            graphics.drawCircle(0, 0, ringRadius);
            graphics.endFill();
            
            // Redraw dots only if not stable
            if (shouldShowDots) {
                // Redraw success dots
                for (let i = 0; i < 3; i++) {
                let angle;
                if (i === 0) {
                    angle = Math.PI / 2; // 90Â° - directly at top
                } else if (i === 1) {
                    angle = Math.PI / 2 + Math.PI / dotSpacingNumSegments; // 120Â° - top right
                } else {
                    angle = Math.PI / 2 - Math.PI / dotSpacingNumSegments; // 60Â° - top left
                }
                const dotX = Math.cos(angle) * dotDistance;
                const dotY = Math.sin(angle) * dotDistance;
                
                graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity); 
                if (i < successes) {
                    graphics.beginFill(dotColorSuccess, dotColorOpacity);
                } else {
                    graphics.beginFill(dotColorEmpty, dotColorOpacity); 
                }
                graphics.drawCircle(dotX, dotY, dotRadius);
                graphics.endFill();
            }
            
            // Redraw failure dots
            for (let i = 0; i < 3; i++) {
                let angle;
                if (i === 0) {
                    angle = Math.PI / 2 + Math.PI; // 270Â° - directly at bottom
                } else if (i === 1) {
                    angle = Math.PI / 2 + Math.PI + Math.PI / dotSpacingNumSegments; // 300Â° - bottom right
                } else {
                    angle = Math.PI / 2 + Math.PI - Math.PI / dotSpacingNumSegments; // 240Â° - bottom left
                }
                const dotX = Math.cos(angle) * dotDistance;
                const dotY = Math.sin(angle) * dotDistance;
                
                graphics.lineStyle(dotBorderThickness, dotColorBorder, dotBorderOpacity);
                if (i < failures) {
                    graphics.beginFill(dotColorFailure, dotColorOpacity);
                } else {
                    graphics.beginFill(dotColorEmpty, dotColorOpacity);
                }
                graphics.drawCircle(dotX, dotY, dotRadius);
                graphics.endFill();
            }
            } // Close shouldShowDots conditional in animation
        }; // Close the heartbeatAnimation function
        
        // Start the heartbeat animation
        canvas.app.ticker.add(heartbeatAnimation);
        
        // Store animation reference for cleanup
        graphics._heartbeatAnimation = heartbeatAnimation;
        
        // Position at token center
        graphics.position.set(center.x, center.y);
        
        // Set zIndex to render above turn indicator (higher = on top)
        graphics.zIndex = 100;
        
        // Enable sortable children for canvas.interface to support zIndex
        if (canvas?.interface) {
            canvas.interface.sortableChildren = true;
        }
        
        // Add to canvas
        canvas.interface.addChild(graphics);
        this._deathSaveOverlays.set(token.id, graphics);
    } // Close _createOrUpdateDeathSaveOverlay function
    
    /**
     * Remove death save overlay for a token
     */
    static _removeDeathSaveOverlay(tokenId) {
        const graphics = this._deathSaveOverlays.get(tokenId);
        if (graphics) {
            // Remove heartbeat animation if it exists
            if (graphics._heartbeatAnimation && canvas?.app?.ticker) {
                canvas.app.ticker.remove(graphics._heartbeatAnimation);
            }
            
            // Safely remove from canvas
            if (canvas?.interface && graphics.parent) {
                canvas.interface.removeChild(graphics);
            }
            
            // Only destroy if not already destroyed
            if (!graphics.destroyed) {
                graphics.destroy();
            }
            
            this._deathSaveOverlays.delete(tokenId);
        }
    }
    
    /**
     * Remove all death save overlays
     */
    static _removeAllDeathSaveOverlays() {
        for (const [tokenId, graphics] of this._deathSaveOverlays) {
            // Remove heartbeat animation if it exists
            if (graphics._heartbeatAnimation && canvas?.app?.ticker) {
                canvas.app.ticker.remove(graphics._heartbeatAnimation);
            }
            
            // Safely remove from canvas
            if (canvas?.interface && graphics.parent) {
                canvas.interface.removeChild(graphics);
            }
            
            // Only destroy if not already destroyed
            if (!graphics.destroyed) {
                graphics.destroy();
            }
        }
        this._deathSaveOverlays.clear();
    }
    
    /**
     * Update death save overlay position (for token movement)
     */
    static _updateDeathSaveOverlayPosition(tokenId, changes = null) {
        const graphics = this._deathSaveOverlays.get(tokenId);
        if (!graphics) return;
        
        const token = canvas.tokens.get(tokenId);
        if (!token) return;
        
        // Calculate new center position using the same helper as turn indicator
        const center = TokenImageUtilities._calculateTokenCenter(token, changes);
        
        // Update PIXI graphics position (smooth movement, no recreation)
        graphics.x = center.x;
        graphics.y = center.y;
    }

    // ================================================================== 
    // ===== TURN INDICATOR FUNCTIONALITY ===============================
    /**
     * Initialize token image utilities. No-op for Curator; dead token and
     * image replacement hooks are registered by ImageCacheManager.initialize().
     */
    static initialize() {
        // Dead token and image replacement hooks are registered by ImageCacheManager.initialize()
        HookManager.registerHook({
            name: 'deleteCombat',
            description: 'Curator: convert bodies held back during the encounter',
            context: 'curator-loot-combat',
            key: 'curator-loot-after-combat',
            priority: 3,
            callback: (combat) => void TokenImageUtilities._convertPendingAfterCombat(combat)
        });
    }

    /**
     * Convert every body that died during the encounter, once it ends.
     *
     * Runs on the GM only: conversion writes to the Token and the Actor. A body that
     * was revived before the encounter finished has had its flag cleared already and
     * is skipped here by the HP re-check as well.
     */
    static async _convertPendingAfterCombat(combat) {
        if (!game.user.isGM) return;
        const scene = combat?.scene ?? canvas.scene;
        if (!scene) return;

        const waiting = scene.tokens.filter((tokenDocument) => tokenDocument.getFlag(MODULE.ID, 'lootAwaitingCombatEnd') === true);
        if (!waiting.length) return;

        for (const tokenDocument of waiting) {
            try {
                await tokenDocument.unsetFlag(MODULE.ID, 'lootAwaitingCombatEnd');
                const token = canvas.tokens?.placeables.find((placeable) => placeable.id === tokenDocument.id);
                if (!token) continue;
                if (Number(token.actor?.system?.attributes?.hp?.value ?? 1) > 0) continue;
                await TokenImageUtilities._convertTokenToLoot(token);
                await TokenImageUtilities.updateTokenImage(tokenDocument, 'loot');
            } catch (error) {
                BlacksmithUtils.postConsoleAndNotification(MODULE.NAME, `Error converting ${tokenDocument.name} after combat:`, error, false, false);
            }
        }
    }

    /**
     * Calculate token center position, handling changes if provided
     * @param {Token} token - The token to calculate position for
     * @param {Object} changes - Optional changes object with x/y coordinates
     * @returns {Object} - Object with x and y center coordinates
     */
    static _calculateTokenCenter(token, changes = null) {
        const tokenWidth = token.document.width * canvas.grid.size;
        const tokenHeight = token.document.height * canvas.grid.size;

        const tokenX = changes?.x !== undefined ? changes.x : token.x;
        const tokenY = changes?.y !== undefined ? changes.y : token.y;

        return {
            x: tokenX + tokenWidth / 2,
            y: tokenY + tokenHeight / 2
        };
    }
}
