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

/** Whether a Token document is still present in its scene. */
export function isTokenAlive(tokenDocument) {
    if (!tokenDocument) return false;
    return Boolean(tokenDocument.parent?.tokens?.get(tokenDocument.id));
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
