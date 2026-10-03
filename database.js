const Database = require("better-sqlite3");

const db = new Database("serverspot.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    logs_channel_id TEXT,
    featured_channel_id TEXT,
    moderation_channel_id TEXT,
    announcements_channel_id TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS advertisements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    server_name TEXT NOT NULL,
    invite TEXT NOT NULL,
    website TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    category TEXT NOT NULL,
    members INTEGER,
    icon TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    reviewer_id TEXT,
    review_reason TEXT,
    submitted_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    logs_message_id TEXT,
    featured_message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ads_state
ON advertisements(state);

CREATE INDEX IF NOT EXISTS idx_ads_guild
ON advertisements(guild_id);

CREATE INDEX IF NOT EXISTS idx_ads_user
ON advertisements(user_id);

CREATE INDEX IF NOT EXISTS idx_ads_server
ON advertisements(server_name);
`);

function getConfig(guildId) {
    return db.prepare(`
        SELECT * FROM guild_config
        WHERE guild_id = ?
    `).get(guildId);
}

function saveConfig(guildId, values) {
    db.prepare(`
        INSERT INTO guild_config (
            guild_id,
            logs_channel_id,
            featured_channel_id,
            moderation_channel_id,
            announcements_channel_id,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
            logs_channel_id = excluded.logs_channel_id,
            featured_channel_id = excluded.featured_channel_id,
            moderation_channel_id = excluded.moderation_channel_id,
            announcements_channel_id = excluded.announcements_channel_id,
            updated_at = excluded.updated_at
    `).run(
        guildId,
        values.logs_channel_id || null,
        values.featured_channel_id || null,
        values.moderation_channel_id || null,
        values.announcements_channel_id || null,
        Date.now()
    );
}

function resetConfig(guildId) {
    db.prepare(`
        DELETE FROM guild_config
        WHERE guild_id = ?
    `).run(guildId);
}

function createAdvertisement(data) {
    const result = db.prepare(`
        INSERT INTO advertisements (
            public_id,
            guild_id,
            user_id,
            server_name,
            invite,
            website,
            description,
            status,
            category,
            members,
            icon,
            state,
            submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
        data.public_id,
        data.guild_id,
        data.user_id,
        data.server_name,
        data.invite,
        data.website || null,
        data.description,
        data.status,
        data.category,
        data.members || null,
        data.icon || null,
        Date.now()
    );

    return db.prepare(`
        SELECT * FROM advertisements
        WHERE id = ?
    `).get(result.lastInsertRowid);
}

function getAdvertisement(id) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE public_id = ?
    `).get(id);
}

function getAdvertisementByDatabaseId(id) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE id = ?
    `).get(id);
}

function updateAdvertisement(id, values) {
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(values)) {
        fields.push(`${key} = ?`);
        params.push(value);
    }

    if (!fields.length) return;

    params.push(id);

    db.prepare(`
        UPDATE advertisements
        SET ${fields.join(", ")}
        WHERE public_id = ?
    `).run(...params);
}

function findDuplicate(guildId, invite) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        AND invite = ?
        AND state IN ('pending', 'approved')
        LIMIT 1
    `).get(guildId, invite);
}

function listAdvertisements(guildId, state = null, limit = 50) {
    if (state) {
        return db.prepare(`
            SELECT * FROM advertisements
            WHERE guild_id = ?
            AND state = ?
            ORDER BY submitted_at DESC
            LIMIT ?
        `).all(guildId, state, limit);
    }

    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        ORDER BY submitted_at DESC
        LIMIT ?
    `).all(guildId, limit);
}

function searchAdvertisements(guildId, name) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        AND state = 'approved'
        AND server_name LIKE ?
        ORDER BY submitted_at DESC
        LIMIT 25
    `).all(guildId, `%${name}%`);
}

function randomAdvertisement(guildId) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        AND state = 'approved'
        ORDER BY RANDOM()
        LIMIT 1
    `).get(guildId);
}

function recentAdvertisements(guildId) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        AND state = 'approved'
        ORDER BY submitted_at DESC
        LIMIT 10
    `).all(guildId);
}

function popularAdvertisements(guildId) {
    return db.prepare(`
        SELECT * FROM advertisements
        WHERE guild_id = ?
        AND state = 'approved'
        ORDER BY COALESCE(members, 0) DESC
        LIMIT 10
    `).all(guildId);
}

function statistics(guildId) {
    return {
        total: db.prepare(`
            SELECT COUNT(*) AS count
            FROM advertisements
            WHERE guild_id = ?
        `).get(guildId).count,

        pending: db.prepare(`
            SELECT COUNT(*) AS count
            FROM advertisements
            WHERE guild_id = ?
            AND state = 'pending'
        `).get(guildId).count,

        approved: db.prepare(`
            SELECT COUNT(*) AS count
            FROM advertisements
            WHERE guild_id = ?
            AND state = 'approved'
        `).get(guildId).count,

        declined: db.prepare(`
            SELECT COUNT(*) AS count
            FROM advertisements
            WHERE guild_id = ?
            AND state = 'declined'
        `).get(guildId).count
    };
}

module.exports = {
    db,
    getConfig,
    saveConfig,
    resetConfig,
    createAdvertisement,
    getAdvertisement,
    getAdvertisementByDatabaseId,
    updateAdvertisement,
    findDuplicate,
    listAdvertisements,
    searchAdvertisements,
    randomAdvertisement,
    recentAdvertisements,
    popularAdvertisements,
    statistics
};
