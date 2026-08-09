// ==================================================================
// ===== DOCUMENT LIVENESS ==========================================
// ==================================================================
//
// Anything that writes to a Token, or to an Actor that belongs to one, after an
// `await` must re-check that it still exists. A guard at the top of an async
// function proves nothing ten awaits later, and Foundry reports the failure as
// `undefined id [...] does not exist in the EmbeddedCollection`, which reads as a
// collection problem rather than a lifetime one.
//
// This bit Curator and Blacksmith on the same day, in code neither was thinking
// about. It surfaces under test harnesses that create and delete documents within
// a few hundred milliseconds — a timing no human produces by hand, which is why
// ordinary play hides it for months.
//
// A try/catch around the write is the backstop, not the fix: it tells you the
// write failed, not that it should never have run.

/**
 * Whether an embedded document is still present in its parent collection.
 *
 * Works for any embedded type — Tokens and Tiles both reach this, and both are
 * written to on a delay by the drop-shadow path.
 */
export function isEmbeddedAlive(doc) {
    if (!doc) return false;
    const collection = doc.collectionName ?? doc.constructor?.collectionName;
    if (!collection) return false;
    return Boolean(doc.parent?.[collection]?.get(doc.id));
}

/** Whether a Token document is still present in its scene. */
export function isTokenAlive(tokenDocument) {
    return isEmbeddedAlive(tokenDocument);
}

/**
 * Whether an Actor is still reachable.
 *
 * An unlinked token's Actor is synthetic and dies with its token, so a write to it
 * lands on the token's embedded document. Checking the Actor alone never catches
 * that — you have to check its token.
 */
export function isActorAlive(actor) {
    if (!actor) return false;
    if (actor.isToken) return isTokenAlive(actor.token);
    return Boolean(game.actors.get(actor.id));
}
