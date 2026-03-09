// ==================================================================
// ===== CURATOR CONSTANTS ======================================
// ==================================================================

const moduleData = {
    id: "coffee-pub-curator",
    title: "Coffee Pub Curator",
    version: "13.0.0",
    authors: [{ name: "COFFEE PUB" }]
};

export const MODULE = {
    ID: moduleData.id,
    NAME: "CURATOR",
    TITLE: moduleData.title,
    VERSION: moduleData.version,
    AUTHOR: moduleData.authors[0]?.name || "COFFEE PUB",
    APIVERSION: "13.0.0"
};
