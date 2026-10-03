const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   SERVERSPOT
   Discover. Advertise. Connect.
   ========================================================= */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
    console.error("[ServerSpot] Missing TOKEN environment variable.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("[ServerSpot] Missing CLIENT_ID environment variable.");
    process.exit(1);
}

const BRAND = "#E00000";
const DB_FILE = path.join(__dirname, "serverspot.json");

/* =========================================================
   DATABASE
   ========================================================= */

const defaultDatabase = {
    guilds: {},
    advertisements: {},
    counters: {
        advertisement: 0
    }
};

function loadDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(
                DB_FILE,
                JSON.stringify(defaultDatabase, null, 2)
            );
            return structuredClone(defaultDatabase);
        }

        const raw = fs.readFileSync(DB_FILE, "utf8");

        if (!raw.trim()) {
            return structuredClone(defaultDatabase);
        }

        const parsed = JSON.parse(raw);

        return {
            guilds: parsed.guilds || {},
            advertisements: parsed.advertisements || {},
            counters: parsed.counters || { advertisement: 0 }
        };
    } catch (error) {
        console.error("[Database] Failed to load database:", error);

        try {
            fs.writeFileSync(
                DB_FILE,
                JSON.stringify(defaultDatabase, null, 2)
            );
        } catch (writeError) {
            console.error("[Database] Failed to recreate database:", writeError);
        }

        return structuredClone(defaultDatabase);
    }
}

let db = loadDatabase();

function saveDatabase() {
    try {
        const temporaryFile = `${DB_FILE}.tmp`;

        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(db, null, 2)
        );

        fs.renameSync(temporaryFile, DB_FILE);
    } catch (error) {
        console.error("[Database] Failed to save:", error);
    }
}

/* =========================================================
   CLIENT
   ========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.GuildMember,
        Partials.Channel,
        Partials.Message
    ]
});

/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

function timestamp() {
    return new Date().toISOString();
}

function log(message) {
    console.log(`[${timestamp()}] ${message}`);
}

function cleanText(text, max = 1000) {
    if (!text) return "";
    return String(text)
        .replace(/@everyone/gi, "@ everyone")
        .replace(/@here/gi, "@ here")
        .slice(0, max)
        .trim();
}

function isValidURL(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function normaliseInvite(value) {
    value = value.trim();

    if (!value.startsWith("http://") && !value.startsWith("https://")) {
        value = `https://discord.gg/${value}`;
    }

    return value;
}

function extractInviteCode(value) {
    try {
        const url = new URL(normaliseInvite(value));

        if (
            url.hostname === "discord.gg" ||
            url.hostname === "www.discord.gg" ||
            url.hostname === "discord.com" ||
            url.hostname === "www.discord.com"
        ) {
            const parts = url.pathname.split("/").filter(Boolean);

            if (parts[0] === "invite" && parts[1]) {
                return parts[1];
            }

            if (parts[0]) {
                return parts[0];
            }
        }
    } catch {}

    return null;
}

function inviteURL(code) {
    return `https://discord.gg/${code}`;
}

function generateAdvertisementID() {
    db.counters.advertisement =
        Number(db.counters.advertisement || 0) + 1;

    return `SS-${String(db.counters.advertisement).padStart(6, "0")}`;
}

function isStaff(member) {
    if (!member || !member.permissions) return false;

    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild)
    );
}

function guildConfig(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            advertisementLogs: null,
            featuredServers: null,
            moderationLogs: null,
            announcements: null
        };
    }

    return db.guilds[guildId];
}

function getStatusEmoji(status) {
    const s = status.toLowerCase();

    if (s.includes("open")) return "Open";
    if (s.includes("full")) return "Full";
    if (s.includes("closed")) return "Closed";

    return status;
}

function truncate(text, length = 900) {
    text = cleanText(text, 5000);

    if (text.length <= length) return text;

    return `${text.slice(0, length - 3)}...`;
}

async function safeReply(interaction, data) {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp(data);
        }

        return await interaction.reply(data);
    } catch (error) {
        if (error?.code === 10062) {
            log("Ignored expired/unknown interaction.");
            return null;
        }

        console.error("[Interaction] Reply error:", error);
        return null;
    }
}

async function safeUpdate(interaction, data) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(data);
        }

        return await interaction.update(data);
    } catch (error) {
        if (error?.code === 10062) {
            log("Ignored expired/unknown interaction update.");
            return null;
        }

        console.error("[Interaction] Update error:", error);
        return null;
    }
}

async function safeDefer(interaction, ephemeral = false) {
    try {
        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return true;
        }

        await interaction.deferReply({
            ephemeral
        });

        return true;
    } catch (error) {
        if (error?.code === 10062) {
            log("Interaction expired before defer.");
            return false;
        }

        console.error("[Interaction] Defer error:", error);
        return false;
    }
}

/* =========================================================
   DISCORD INVITE INFORMATION
   ========================================================= */

async function getInviteInformation(inviteInput) {
    const code = extractInviteCode(inviteInput);

    if (!code) {
        throw new Error("INVALID_INVITE");
    }

    try {
        const invite = await client.fetchInvite(code, {
            withCounts: true
        });

        const guild = invite.guild;

        let icon = null;

        if (guild?.icon) {
            icon = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=256`;
        }

        return {
            code,
            invite: inviteURL(code),
            guildId: guild?.id || null,
            guildName: guild?.name || null,
            icon,
            memberCount:
                invite.approximateMemberCount ??
                invite.memberCount ??
                null
        };
    } catch (error) {
        console.error("[Invite] Failed:", error);
        throw new Error("INVALID_INVITE");
    }
}

/* =========================================================
   EMBEDS
   ========================================================= */

function advertisementEmbed(ad, inviteInfo = null) {
    const embed = new EmbedBuilder()
        .setColor(BRAND)
        .setTitle(ad.serverName)
        .setDescription(ad.description)
        .addFields(
            {
                name: "Status",
                value: ad.status || "Not specified",
                inline: true
            },
            {
                name: "Members",
                value: ad.memberCount
                    ? ad.memberCount.toLocaleString()
                    : "Unavailable",
                inline: true
            },
            {
                name: "Category",
                value: ad.category || "Other",
                inline: true
            },
            {
                name: "Advertisement ID",
                value: ad.id,
                inline: true
            },
            {
                name: "Submitted By",
                value: `<@${ad.userId}>`,
                inline: true
            },
            {
                name: "Status",
                value: ad.reviewStatus,
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Discover. Advertise. Connect."
        })
        .setTimestamp(new Date(ad.createdAt));

    const icon = ad.serverIcon || inviteInfo?.icon;

    if (icon) {
        embed.setThumbnail(icon);
    }

    return embed;
}

function featuredEmbed(ad) {
    const embed = new EmbedBuilder()
        .setColor(BRAND)
        .setTitle(ad.serverName)
        .setDescription(ad.description)
        .addFields(
            {
                name: "Status",
                value: ad.status || "Not specified",
                inline: true
            },
            {
                name: "Members",
                value: ad.memberCount
                    ? ad.memberCount.toLocaleString()
                    : "Unavailable",
                inline: true
            },
            {
                name: "Category",
                value: ad.category || "Other",
                inline: true
            },
            {
                name: "Listing ID",
                value: ad.id,
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Discover. Advertise. Connect."
        })
        .setTimestamp(new Date(ad.approvedAt || ad.createdAt));

    if (ad.serverIcon) {
        embed.setThumbnail(ad.serverIcon);
    }

    return embed;
}

function advertisementButtons(ad, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve:${ad.id}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`decline:${ad.id}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setLabel("View Server")
            .setStyle(ButtonStyle.Link)
            .setURL(ad.invite)
    );
}

function featuredButtons(ad) {
    const row = new ActionRowBuilder();

    if (ad.invite) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel("Join Server")
                .setStyle(ButtonStyle.Link)
                .setURL(ad.invite)
        );
    }

    if (ad.website) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel("Website")
                .setStyle(ButtonStyle.Link)
                .setURL(ad.website)
        );
    }

    return row;
}

/* =========================================================
   COMMAND DEFINITIONS
   ========================================================= */

const commands = [
    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit your Discord server to ServerSpot."),

    new SlashCommandBuilder()
        .setName("discover")
        .setDescription("Browse approved ServerSpot communities."),

    new SlashCommandBuilder()
        .setName("random")
        .setDescription("Discover a random ServerSpot community."),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("Search for an advertised server.")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name to search for.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about this Discord server."),

    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View ServerSpot statistics."),

    new SlashCommandBuilder()
        .setName("recent")
        .setDescription("View recently approved ServerSpot servers."),

    new SlashCommandBuilder()
        .setName("popular")
        .setDescription("View popular advertised servers."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View the ServerSpot help centre."),

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot for this server.")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("pending")
        .setDescription("Review pending advertisements.")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("review")
        .setDescription("Review an advertisement by ID.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("advertisements")
        .setDescription("Open the ServerSpot advertisement dashboard.")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove an approved ServerSpot listing.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for removal.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("announce")
        .setDescription("Send an announcement.")
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Announcement content.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("servercheck")
        .setDescription("Inspect an advertised server.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        ),

    new SlashCommandBuilder()
        .setName("health")
        .setDescription("View ServerSpot health.")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        )
].map(command => command.toJSON());

/* =========================================================
   COMMAND REGISTRATION
   ========================================================= */

async function registerCommands() {
    try {
        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        log("Registering ServerSpot commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        log("ServerSpot commands registered successfully.");
    } catch (error) {
        console.error("[Commands] Registration failed:", error);
    }
}

/* =========================================================
   ADVERTISEMENT MODAL
   ========================================================= */

function createAdvertisementModal() {
    return new ModalBuilder()
        .setCustomId("advertisement_modal")
        .setTitle("ServerSpot Advertisement")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("server_name")
                    .setLabel("Server Name")
                    .setPlaceholder("Enter your server name")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("invite")
                    .setLabel("Discord Invite")
                    .setPlaceholder("https://discord.gg/example")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(200)
                    .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("website")
                    .setLabel("Website / Group Link")
                    .setPlaceholder("https://example.com")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(300)
                    .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Server Description")
                    .setPlaceholder("Tell people what your community is about...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1000)
                    .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("status")
                    .setLabel("Server Status")
                    .setPlaceholder("Open, Full, Recruiting, etc.")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(50)
                    .setRequired(true)
            )
        );
}

/* =========================================================
   DISCOVERY
   ========================================================= */

function approvedAds() {
    return Object.values(db.advertisements)
        .filter(ad => ad.reviewStatus === "Approved");
}

function createDiscoveryEmbed(ad) {
    return new EmbedBuilder()
        .setColor(BRAND)
        .setTitle(ad.serverName)
        .setDescription(ad.description)
        .addFields(
            {
                name: "Status",
                value: ad.status || "Not specified",
                inline: true
            },
            {
                name: "Members",
                value: ad.memberCount
                    ? ad.memberCount.toLocaleString()
                    : "Unavailable",
                inline: true
            },
            {
                name: "Category",
                value: ad.category || "Other",
                inline: true
            }
        )
        .setThumbnail(ad.serverIcon || null)
        .setFooter({
            text: "ServerSpot • Discover. Advertise. Connect."
        });
}

function discoveryButtons(index, total, ad) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`discover_prev:${index}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index <= 0),

        new ButtonBuilder()
            .setCustomId(`discover_random`)
            .setLabel("Random")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(total <= 1),

        new ButtonBuilder()
            .setCustomId(`discover_next:${index}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(index >= total - 1),

        new ButtonBuilder()
            .setCustomId(`discover_close`)
            .setLabel("Close")
            .setStyle(ButtonStyle.Danger)
    );
}

function discoveryMessage(index) {
    const ads = approvedAds();

    if (!ads.length) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(BRAND)
                    .setTitle("ServerSpot Discovery")
                    .setDescription(
                        "There are currently no approved communities listed on ServerSpot."
                    )
                    .setFooter({
                        text: "ServerSpot"
                    })
            ],
            components: []
        };
    }

    const safeIndex =
        Math.max(0, Math.min(index, ads.length - 1));

    const ad = ads[safeIndex];

    return {
        embeds: [createDiscoveryEmbed(ad)],
        components: [
            discoveryButtons(
                safeIndex,
                ads.length,
                ad
            ),
            featuredButtons(ad)
        ]
    };
}

/* =========================================================
   SETUP PANEL
   ========================================================= */

function setupEmbed(guild) {
    const config = guildConfig(guild.id);

    return new EmbedBuilder()
        .setColor(BRAND)
        .setTitle("ServerSpot Setup")
        .setDescription(
            "Configure the channels ServerSpot should use in this server.\n\n" +
            "**Advertisement Logs**\n" +
            `${config.advertisementLogs ? `<#${config.advertisementLogs}>` : "Not configured"}\n\n` +
            "**Featured Servers**\n" +
            `${config.featuredServers ? `<#${config.featuredServers}>` : "Not configured"}\n\n` +
            "**Moderation Logs**\n" +
            `${config.moderationLogs ? `<#${config.moderationLogs}>` : "Optional / not configured"}\n\n` +
            "**Announcements**\n" +
            `${config.announcements ? `<#${config.announcements}>` : "Optional / not configured"}`
        )
        .setFooter({
            text: "ServerSpot Configuration"
        });
}

function setupComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("setup_advertisement_logs")
                .setPlaceholder("Select Advertisement Logs")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("setup_featured_servers")
                .setPlaceholder("Select Featured Servers")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("setup_moderation_logs")
                .setPlaceholder("Select Moderation Logs")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("setup_announcements")
                .setPlaceholder("Select Announcements")
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("setup_save")
                .setLabel("Save")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("setup_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("setup_reset")
                .setLabel("Reset")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

/* =========================================================
   COOLDOWN
   ========================================================= */

const advertisementCooldowns = new Map();

const AD_COOLDOWN = 5 * 60 * 1000;

function checkAdvertisementCooldown(userId) {
    const last = advertisementCooldowns.get(userId);

    if (!last) return 0;

    const remaining = AD_COOLDOWN - (Date.now() - last);

    return Math.max(0, remaining);
}

/* =========================================================
   CLIENT READY
   ========================================================= */

client.once("clientReady", async () => {
    log(`ServerSpot is online as ${client.user.tag}`);
    log(`Serving ${client.guilds.cache.size} server(s).`);

    client.user.setPresence({
        activities: [
            {
                name: "Discover. Advertise. Connect.",
                type: ActivityType.Watching
            }
        ],
        status: "online"
    });

    await registerCommands();
});

/* =========================================================
   SLASH COMMANDS
   ========================================================= */

client.on("interactionCreate", async interaction => {
    try {
        /* -------------------------------------------------
           COMMANDS
           ------------------------------------------------- */

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "advertise") {

                const remaining =
                    checkAdvertisementCooldown(interaction.user.id);

                if (remaining > 0) {
                    const minutes =
                        Math.ceil(remaining / 60000);

                    return safeReply(interaction, {
                        content:
                            `You already submitted an advertisement recently. Please wait approximately ${minutes} minute(s).`,
                        ephemeral: true
                    });
                }

                return safeReply(interaction, {
                    content:
                        "Complete the form below to submit your ServerSpot advertisement.",
                    components: [],
                    ephemeral: true
                }).then(async () => {
                    try {
                        await interaction.followUp({
                            content: " ",
                            components: [],
                            ephemeral: true
                        });
                    } catch {}

                    try {
                        await interaction.showModal(
                            createAdvertisementModal()
                        );
                    } catch (error) {
                        console.error(
                            "[Advertise] Modal error:",
                            error
                        );
                    }
                });
            }

            if (interaction.commandName === "discover") {
                return safeReply(
                    interaction,
                    discoveryMessage(0)
                );
            }

            if (interaction.commandName === "random") {
                const ads = approvedAds();

                if (!ads.length) {
                    return safeReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor(BRAND)
                                .setTitle("No Servers Available")
                                .setDescription(
                                    "There are currently no approved communities available."
                                )
                        ],
                        ephemeral: true
                    });
                }

                const random =
                    ads[Math.floor(Math.random() * ads.length)];

                return safeReply(interaction, {
                    embeds: [
                        createDiscoveryEmbed(random)
                    ],
                    components: [
                        featuredButtons(random),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("discover_random")
                                .setLabel("Another Server")
                                .setStyle(ButtonStyle.Primary)
                        )
                    ]
                });
            }

            if (interaction.commandName === "server") {
                const query =
                    interaction.options
                        .getString("name")
                        .toLowerCase();

                const results =
                    approvedAds().filter(ad =>
                        ad.serverName
                            .toLowerCase()
                            .includes(query)
                    );

                if (!results.length) {
                    return safeReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor(BRAND)
                                .setTitle("Server Not Found")
                                .setDescription(
                                    `No approved ServerSpot listing matched **${cleanText(query, 100)}**.`
                                )
                        ],
                        ephemeral: true
                    });
                }

                return safeReply(interaction, {
                    embeds: [
                        createDiscoveryEmbed(results[0])
                    ],
                    components: [
                        featuredButtons(results[0])
                    ]
                });
            }

            if (interaction.commandName === "recent") {
                const ads = approvedAds()
                    .sort(
                        (a, b) =>
                            new Date(b.approvedAt || b.createdAt) -
                            new Date(a.approvedAt || a.createdAt)
                    )
                    .slice(0, 10);

                if (!ads.length) {
                    return safeReply(interaction, {
                        content:
                            "There are currently no approved listings.",
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(BRAND)
                    .setTitle("Recently Added")
                    .setDescription(
                        ads.map((ad, i) =>
                            `**${i + 1}. ${ad.serverName}**\n` +
                            `${truncate(ad.description, 150)}\n` +
                            `Members: ${ad.memberCount ? ad.memberCount.toLocaleString() : "Unavailable"}`
                        ).join("\n\n")
                    )
                    .setFooter({
                        text: "ServerSpot"
                    });

                return safeReply(interaction, {
                    embeds: [embed]
                });
            }

            if (interaction.commandName === "popular") {
                const ads = approvedAds()
                    .filter(ad => Number(ad.memberCount) > 0)
                    .sort(
                        (a, b) =>
                            Number(b.memberCount) -
                            Number(a.memberCount)
                    )
                    .slice(0, 10);

                if (!ads.length) {
                    return safeReply(interaction, {
                        content:
                            "There is not enough member information to display popular servers yet.",
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(BRAND)
                    .setTitle("Popular Communities")
                    .setDescription(
                        ads.map((ad, i) =>
                            `**${i + 1}. ${ad.serverName}** — ${Number(ad.memberCount).toLocaleString()} members`
                        ).join("\n")
                    )
                    .setFooter({
                        text: "Based on available Discord member counts."
                    });

                return safeReply(interaction, {
                    embeds: [embed]
                });
            }

            if (interaction.commandName === "serverinfo") {
                const guild = interaction.guild;

                const embed = new EmbedBuilder()
                    .setColor(BRAND)
                    .setTitle(guild.name)
                    .setDescription(
                        `Information about **${guild.name}**`
                    )
                    .addFields(
                        {
                            name: "Members",
                            value: guild.memberCount.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "Channels",
                            value: guild.channels.cache.size.toString(),
                            inline: true
                        },
                        {
                            name: "Roles",
                            value: guild.roles.cache.size.toString(),
                            inline: true
                        },
                        {
                            name: "Owner",
                            value: `<@${guild.ownerId}>`,
                            inline: true
                        },
                        {
                            name: "Boost Level",
                            value: `Level ${guild.premiumTier}`,
                            inline: true
                        },
                        {
                            name: "Created",
                            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
                            inline: true
                        }
                    );

                const icon =
                    guild.iconURL({
                        size: 256,
                        extension: "png"
                    });

                if (icon) {
                    embed.setThumbnail(icon);
                }

                return safeReply(interaction, {
                    embeds: [embed]
                });
            }

            if (interaction.commandName === "stats") {
                const all =
                    Object.values(db.advertisements);

                const approved =
                    all.filter(
                        ad => ad.reviewStatus === "Approved"
                    ).length;

                const pending =
                    all.filter(
                        ad => ad.reviewStatus === "Pending"
                    ).length;

                const declined =
                    all.filter(
                        ad => ad.reviewStatus === "Declined"
                    ).length;

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("ServerSpot Statistics")
                            .addFields(
                                {
                                    name: "Total Advertisements",
                                    value: all.length.toString(),
                                    inline: true
                                },
                                {
                                    name: "Approved",
                                    value: approved.toString(),
                                    inline: true
                                },
                                {
                                    name: "Pending",
                                    value: pending.toString(),
                                    inline: true
                                },
                                {
                                    name: "Declined",
                                    value: declined.toString(),
                                    inline: true
                                },
                                {
                                    name: "Communities Listed",
                                    value: approved.toString(),
                                    inline: true
                                }
                            )
                            .setFooter({
                                text: "ServerSpot"
                            })
                    ]
                });
            }

            if (interaction.commandName === "help") {
                const embed = new EmbedBuilder()
                    .setColor(BRAND)
                    .setTitle("ServerSpot Help")
                    .setDescription(
                        "Discover. Advertise. Connect.\n\n" +
                        "ServerSpot helps Discord communities discover new servers and promote their own."
                    )
                    .addFields(
                        {
                            name: "Discovery",
                            value:
                                "`/discover` — Browse communities\n" +
                                "`/random` — Find a random server\n" +
                                "`/server` — Search listings\n" +
                                "`/recent` — Recently added\n" +
                                "`/popular` — Popular communities"
                        },
                        {
                            name: "Advertising",
                            value:
                                "`/advertise` — Submit your server"
                        },
                        {
                            name: "Information",
                            value:
                                "`/serverinfo` — View server information\n" +
                                "`/stats` — ServerSpot statistics"
                        },
                        {
                            name: "Staff",
                            value:
                                "`/setup` — Configure ServerSpot\n" +
                                "`/pending` — Review pending ads\n" +
                                "`/review` — Review an advertisement\n" +
                                "`/advertisements` — Staff dashboard\n" +
                                "`/remove` — Remove a listing\n" +
                                "`/announce` — Send an announcement\n" +
                                "`/servercheck` — Inspect a listing\n" +
                                "`/health` — System health"
                        }
                    );

                return safeReply(interaction, {
                    embeds: [embed]
                });
            }

            /* STAFF */

            if (!isStaff(interaction.member)) {
                return safeReply(interaction, {
                    content:
                        "You do not have permission to use this command.",
                    ephemeral: true
                });
            }

            if (interaction.commandName === "setup") {
                guildConfig(interaction.guild.id);

                return safeReply(interaction, {
                    embeds: [
                        setupEmbed(interaction.guild)
                    ],
                    components: setupComponents(),
                    ephemeral: true
                });
            }

            if (interaction.commandName === "pending") {
                const pending =
                    Object.values(db.advertisements)
                        .filter(
                            ad =>
                                ad.reviewStatus === "Pending"
                        )
                        .slice(0, 25);

                if (!pending.length) {
                    return safeReply(interaction, {
                        content:
                            "There are no pending advertisements.",
                        ephemeral: true
                    });
                }

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId("pending_select")
                        .setPlaceholder(
                            "Select an advertisement to review"
                        )
                        .addOptions(
                            pending.map(ad =>
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(
                                        `${ad.serverName}`.slice(0, 100)
                                    )
                                    .setDescription(
                                        `${ad.id} • ${ad.status}`.slice(0, 100)
                                    )
                                    .setValue(ad.id)
                            )
                        );

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("Pending Advertisements")
                            .setDescription(
                                "Select an advertisement below to review it."
                            )
                    ],
                    components: [
                        new ActionRowBuilder().addComponents(menu)
                    ],
                    ephemeral: true
                });
            }

            if (interaction.commandName === "review") {
                const id =
                    interaction.options
                        .getString("id")
                        .toUpperCase();

                const ad = db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            `Advertisement **${id}** was not found.`,
                        ephemeral: true
                    });
                }

                return safeReply(interaction, {
                    embeds: [
                        advertisementEmbed(ad)
                    ],
                    components:
                        ad.reviewStatus === "Pending"
                            ? [advertisementButtons(ad)]
                            : []
                });
            }

            if (interaction.commandName === "advertisements") {
                const ads =
                    Object.values(db.advertisements);

                const pending =
                    ads.filter(
                        ad => ad.reviewStatus === "Pending"
                    ).length;

                const approved =
                    ads.filter(
                        ad => ad.reviewStatus === "Approved"
                    ).length;

                const declined =
                    ads.filter(
                        ad => ad.reviewStatus === "Declined"
                    ).length;

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("ServerSpot Advertisement Dashboard")
                            .addFields(
                                {
                                    name: "Pending",
                                    value: pending.toString(),
                                    inline: true
                                },
                                {
                                    name: "Approved",
                                    value: approved.toString(),
                                    inline: true
                                },
                                {
                                    name: "Declined",
                                    value: declined.toString(),
                                    inline: true
                                },
                                {
                                    name: "Total",
                                    value: ads.length.toString(),
                                    inline: true
                                }
                            )
                    ],
                    ephemeral: true
                });
            }

            if (interaction.commandName === "remove") {
                const id =
                    interaction.options
                        .getString("id")
                        .toUpperCase();

                const reason =
                    interaction.options
                        .getString("reason");

                const ad = db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            "That advertisement does not exist.",
                        ephemeral: true
                    });
                }

                if (ad.reviewStatus !== "Approved") {
                    return safeReply(interaction, {
                        content:
                            "Only approved advertisements can be removed.",
                        ephemeral: true
                    });
                }

                ad.reviewStatus = "Removed";
                ad.removedAt = timestamp();
                ad.removedBy = interaction.user.id;
                ad.removalReason = cleanText(reason, 500);

                saveDatabase();

                return safeReply(interaction, {
                    content:
                        `Advertisement **${ad.id}** has been removed from ServerSpot.`,
                    ephemeral: true
                });
            }

            if (interaction.commandName === "announce") {
                const config =
                    guildConfig(interaction.guild.id);

                if (!config.announcements) {
                    return safeReply(interaction, {
                        content:
                            "The announcements channel has not been configured. Use `/setup` first.",
                        ephemeral: true
                    });
                }

                const channel =
                    interaction.guild.channels.cache.get(
                        config.announcements
                    );

                if (!channel) {
                    return safeReply(interaction, {
                        content:
                            "The configured announcements channel no longer exists.",
                        ephemeral: true
                    });
                }

                const message =
                    interaction.options.getString("message");

                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("ServerSpot Announcement")
                            .setDescription(
                                cleanText(message, 4000)
                            )
                            .setFooter({
                                text: "ServerSpot"
                            })
                            .setTimestamp()
                    ]
                });

                return safeReply(interaction, {
                    content:
                        "Announcement sent successfully.",
                    ephemeral: true
                });
            }

            if (interaction.commandName === "servercheck") {
                const id =
                    interaction.options
                        .getString("id")
                        .toUpperCase();

                const ad = db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            "Advertisement not found.",
                        ephemeral: true
                    });
                }

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle(`Server Check • ${ad.serverName}`)
                            .setThumbnail(
                                ad.serverIcon || null
                            )
                            .addFields(
                                {
                                    name: "Advertisement ID",
                                    value: ad.id,
                                    inline: true
                                },
                                {
                                    name: "Status",
                                    value: ad.reviewStatus,
                                    inline: true
                                },
                                {
                                    name: "Members",
                                    value:
                                        ad.memberCount
                                            ? ad.memberCount.toLocaleString()
                                            : "Unavailable",
                                    inline: true
                                },
                                {
                                    name: "Advertiser",
                                    value: `<@${ad.userId}>`,
                                    inline: true
                                },
                                {
                                    name: "Submitted",
                                    value: `<t:${Math.floor(new Date(ad.createdAt).getTime() / 1000)}:F>`,
                                    inline: true
                                },
                                {
                                    name: "Invite",
                                    value: ad.invite,
                                    inline: false
                                }
                            )
                    ],
                    ephemeral: true
                });
            }

            if (interaction.commandName === "health") {
                const memory =
                    process.memoryUsage();

                const config =
                    guildConfig(interaction.guild.id);

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("ServerSpot Health")
                            .addFields(
                                {
                                    name: "Bot Latency",
                                    value: `${client.ws.ping}ms`,
                                    inline: true
                                },
                                {
                                    name: "Guilds",
                                    value:
                                        client.guilds.cache.size.toString(),
                                    inline: true
                                },
                                {
                                    name: "Uptime",
                                    value:
                                        `${Math.floor(process.uptime() / 60)} minutes`,
                                    inline: true
                                },
                                {
                                    name: "Memory",
                                    value:
                                        `${Math.round(memory.rss / 1024 / 1024)} MB`,
                                    inline: true
                                },
                                {
                                    name: "Database",
                                    value: fs.existsSync(DB_FILE)
                                        ? "Operational"
                                        : "Unavailable",
                                    inline: true
                                },
                                {
                                    name: "Configuration",
                                    value:
                                        config.advertisementLogs &&
                                        config.featuredServers
                                            ? "Configured"
                                            : "Incomplete",
                                    inline: true
                                }
                            )
                    ],
                    ephemeral: true
                });
            }
        }

        /* -------------------------------------------------
           MODAL SUBMISSION
           ------------------------------------------------- */

        if (interaction.isModalSubmit()) {

            if (
                interaction.customId ===
                "advertisement_modal"
            ) {
                const remaining =
                    checkAdvertisementCooldown(
                        interaction.user.id
                    );

                if (remaining > 0) {
                    return safeReply(interaction, {
                        content:
                            "You have recently submitted an advertisement. Please wait before submitting another.",
                        ephemeral: true
                    });
                }

                const serverName =
                    cleanText(
                        interaction.fields.getTextInputValue(
                            "server_name"
                        ),
                        100
                    );

                const inviteInput =
                    interaction.fields.getTextInputValue(
                        "invite"
                    ).trim();

                const website =
                    interaction.fields.getTextInputValue(
                        "website"
                    ).trim();

                const description =
                    cleanText(
                        interaction.fields.getTextInputValue(
                            "description"
                        ),
                        1000
                    );

                const status =
                    cleanText(
                        interaction.fields.getTextInputValue(
                            "status"
                        ),
                        50
                    );

                if (!serverName || !description || !status) {
                    return safeReply(interaction, {
                        content:
                            "Please complete every required field.",
                        ephemeral: true
                    });
                }

                if (!isValidURL(website)) {
                    return safeReply(interaction, {
                        content:
                            "The website/group link is not a valid URL.",
                        ephemeral: true
                    });
                }

                let inviteInfo;

                try {
                    inviteInfo =
                        await getInviteInformation(
                            inviteInput
                        );
                } catch {
                    return safeReply(interaction, {
                        content:
                            "The Discord invite could not be verified. Please check that the invite is valid and try again.",
                        ephemeral: true
                    });
                }

                const existing =
                    Object.values(db.advertisements)
                        .find(ad =>
                            ad.inviteCode ===
                            inviteInfo.code &&
                            (
                                ad.reviewStatus === "Pending" ||
                                ad.reviewStatus === "Approved"
                            )
                        );

                if (existing) {
                    return safeReply(interaction, {
                        content:
                            `This server already has a **${existing.reviewStatus.toLowerCase()}** ServerSpot advertisement (${existing.id}).`,
                        ephemeral: true
                    });
                }

                const id =
                    generateAdvertisementID();

                const ad = {
                    id,
                    guildId: interaction.guildId,
                    userId: interaction.user.id,
                    serverName,
                    invite: inviteInfo.invite,
                    inviteCode: inviteInfo.code,
                    website,
                    description,
                    status,
                    category: "Other",
                    memberCount:
                        inviteInfo.memberCount,
                    serverIcon:
                        inviteInfo.icon,
                    reviewStatus: "Pending",
                    createdAt: timestamp(),
                    approvedAt: null,
                    approvedBy: null,
                    declinedAt: null,
                    declinedBy: null,
                    declineReason: null,
                    featuredMessageId: null
                };

                db.advertisements[id] = ad;
                saveDatabase();

                advertisementCooldowns.set(
                    interaction.user.id,
                    Date.now()
                );

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                if (!config.advertisementLogs) {
                    return safeReply(interaction, {
                        content:
                            `Your advertisement was created as **${id}**, but this server has not configured an Advertisement Logs channel yet. Please ask staff to run \`/setup\`.`,
                        ephemeral: true
                    });
                }

                const logsChannel =
                    interaction.guild.channels.cache.get(
                        config.advertisementLogs
                    );

                if (!logsChannel) {
                    return safeReply(interaction, {
                        content:
                            `Your advertisement **${id}** was saved, but the configured Advertisement Logs channel no longer exists.`,
                        ephemeral: true
                    });
                }

                try {
                    await logsChannel.send({
                        embeds: [
                            advertisementEmbed(ad)
                        ],
                        components: [
                            advertisementButtons(ad)
                        ]
                    });

                    log(
                        `Advertisement ${id} submitted by ${interaction.user.tag}.`
                    );
                } catch (error) {
                    console.error(
                        "[Advertisement] Failed to send logs message:",
                        error
                    );
                }

                return safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor(BRAND)
                            .setTitle("Advertisement Submitted")
                            .setDescription(
                                "Your server has been submitted successfully and is now awaiting staff review."
                            )
                            .addFields({
                                name: "Advertisement ID",
                                value: id
                            })
                            .setFooter({
                                text: "ServerSpot"
                            })
                    ],
                    ephemeral: true
                });
            }

            if (
                interaction.customId.startsWith(
                    "decline_modal:"
                )
            ) {
                if (!isStaff(interaction.member)) {
                    return safeReply(interaction, {
                        content:
                            "You do not have permission to do this.",
                        ephemeral: true
                    });
                }

                const id =
                    interaction.customId.split(":")[1];

                const ad =
                    db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            "This advertisement no longer exists.",
                        ephemeral: true
                    });
                }

                if (ad.reviewStatus !== "Pending") {
                    return safeReply(interaction, {
                        content:
                            `This advertisement has already been ${ad.reviewStatus.toLowerCase()}.`,
                        ephemeral: true
                    });
                }

                const reason =
                    cleanText(
                        interaction.fields.getTextInputValue(
                            "decline_reason"
                        ),
                        500
                    );

                ad.reviewStatus = "Declined";
                ad.declinedAt = timestamp();
                ad.declinedBy = interaction.user.id;
                ad.declineReason =
                    reason || "No reason provided.";

                saveDatabase();

                if (ad.logsMessageId) {
                    try {
                        const config =
                            guildConfig(
                                interaction.guild.id
                            );

                        const channel =
                            interaction.guild.channels.cache.get(
                                config.advertisementLogs
                            );

                        const message =
                            channel
                                ? await channel.messages.fetch(
                                    ad.logsMessageId
                                )
                                : null;

                        if (message) {
                            await message.edit({
                                embeds: [
                                    advertisementEmbed(ad)
                                ],
                                components: [
                                    advertisementButtons(
                                        ad,
                                        true
                                    )
                                ]
                            });
                        }
                    } catch {}
                }

                try {
                    const user =
                        await client.users.fetch(
                            ad.userId
                        );

                    await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(BRAND)
                                .setTitle("Advertisement Declined")
                                .setDescription(
                                    "Your ServerSpot advertisement was not approved."
                                )
                                .addFields(
                                    {
                                        name: "Advertisement ID",
                                        value: ad.id
                                    },
                                    {
                                        name: "Reason",
                                        value:
                                            ad.declineReason
                                    }
                                )
                        ]
                    });
                } catch {}

                log(
                    `Advertisement ${id} declined by ${interaction.user.tag}.`
                );

                return safeReply(interaction, {
                    content:
                        `Advertisement **${id}** has been declined.`,
                    ephemeral: true
                });
            }
        }

        /* -------------------------------------------------
           BUTTONS
           ------------------------------------------------- */

        if (interaction.isButton()) {

            /* DISCOVERY */

            if (
                interaction.customId.startsWith(
                    "discover_prev:"
                )
            ) {
                const current =
                    Number(
                        interaction.customId.split(":")[1]
                    );

                return safeUpdate(
                    interaction,
                    discoveryMessage(
                        Math.max(0, current - 1)
                    )
                );
            }

            if (
                interaction.customId.startsWith(
                    "discover_next:"
                )
            ) {
                const current =
                    Number(
                        interaction.customId.split(":")[1]
                    );

                return safeUpdate(
                    interaction,
                    discoveryMessage(current + 1)
                );
            }

            if (
                interaction.customId ===
                "discover_random"
            ) {
                const ads =
                    approvedAds();

                if (!ads.length) {
                    return safeUpdate(
                        interaction,
                        discoveryMessage(0)
                    );
                }

                const index =
                    Math.floor(
                        Math.random() *
                        ads.length
                    );

                return safeUpdate(
                    interaction,
                    discoveryMessage(index)
                );
            }

            if (
                interaction.customId ===
                "discover_close"
            ) {
                return safeUpdate(
                    interaction,
                    {
                        content:
                            "ServerSpot discovery closed.",
                        embeds: [],
                        components: []
                    }
                );
            }

            /* SETUP */

            if (
                interaction.customId ===
                    "setup_save" ||
                interaction.customId ===
                    "setup_cancel" ||
                interaction.customId ===
                    "setup_reset"
            ) {
                if (!isStaff(interaction.member)) {
                    return safeReply(interaction, {
                        content:
                            "You do not have permission to use this panel.",
                        ephemeral: true
                    });
                }

                if (
                    interaction.customId ===
                    "setup_reset"
                ) {
                    db.guilds[
                        interaction.guild.id
                    ] = {
                        advertisementLogs: null,
                        featuredServers: null,
                        moderationLogs: null,
                        announcements: null
                    };

                    saveDatabase();

                    return safeUpdate(
                        interaction,
                        {
                            embeds: [
                                setupEmbed(
                                    interaction.guild
                                )
                            ],
                            components:
                                setupComponents()
                        }
                    );
                }

                if (
                    interaction.customId ===
                    "setup_cancel"
                ) {
                    return safeUpdate(
                        interaction,
                        {
                            content:
                                "ServerSpot setup closed.",
                            embeds: [],
                            components: []
                        }
                    );
                }

                return safeUpdate(
                    interaction,
                    {
                        embeds: [
                            setupEmbed(
                                interaction.guild
                            )
                        ],
                        components:
                            setupComponents()
                    }
                );
            }

            /* APPROVE */

            if (
                interaction.customId.startsWith(
                    "approve:"
                )
            ) {
                if (!isStaff(interaction.member)) {
                    return safeReply(interaction, {
                        content:
                            "You do not have permission to approve advertisements.",
                        ephemeral: true
                    });
                }

                const id =
                    interaction.customId.split(":")[1];

                const ad =
                    db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            "This advertisement no longer exists.",
                        ephemeral: true
                    });
                }

                if (ad.reviewStatus !== "Pending") {
                    return safeReply(interaction, {
                        content:
                            `This advertisement has already been ${ad.reviewStatus.toLowerCase()}.`,
                        ephemeral: true
                    });
                }

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                if (!config.featuredServers) {
                    return safeReply(interaction, {
                        content:
                            "The Featured Servers channel has not been configured. Run `/setup` first.",
                        ephemeral: true
                    });
                }

                const channel =
                    interaction.guild.channels.cache.get(
                        config.featuredServers
                    );

                if (!channel) {
                    return safeReply(interaction, {
                        content:
                            "The configured Featured Servers channel no longer exists.",
                        ephemeral: true
                    });
                }

                ad.reviewStatus = "Approved";
                ad.approvedAt = timestamp();
                ad.approvedBy = interaction.user.id;

                saveDatabase();

                try {
                    const message =
                        await channel.send({
                            embeds: [
                                featuredEmbed(ad)
                            ],
                            components: [
                                featuredButtons(ad)
                            ]
                        });

                    ad.featuredMessageId =
                        message.id;

                    saveDatabase();
                } catch (error) {
                    console.error(
                        "[Featured] Failed:",
                        error
                    );

                    ad.reviewStatus =
                        "Pending";
                    ad.approvedAt = null;
                    ad.approvedBy = null;

                    saveDatabase();

                    return safeReply(
                        interaction,
                        {
                            content:
                                "The advertisement could not be published. The approval has been cancelled.",
                            ephemeral: true
                        }
                    );
                }

                try {
                    await interaction.message.edit({
                        embeds: [
                            advertisementEmbed(ad)
                        ],
                        components: [
                            advertisementButtons(
                                ad,
                                true
                            )
                        ]
                    });
                } catch {}

                try {
                    const user =
                        await client.users.fetch(
                            ad.userId
                        );

                    await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(BRAND)
                                .setTitle(
                                    "Advertisement Approved"
                                )
                                .setDescription(
                                    "Your server has been approved and is now listed on ServerSpot."
                                )
                                .addFields({
                                    name:
                                        "Advertisement ID",
                                    value:
                                        ad.id
                                })
                        ]
                    });
                } catch {}

                log(
                    `Advertisement ${id} approved by ${interaction.user.tag}.`
                );

                return safeReply(
                    interaction,
                    {
                        content:
                            `Advertisement **${id}** has been approved and published.`,
                        ephemeral: true
                    }
                );
            }

            /* DECLINE */

            if (
                interaction.customId.startsWith(
                    "decline:"
                )
            ) {
                if (!isStaff(interaction.member)) {
                    return safeReply(interaction, {
                        content:
                            "You do not have permission to decline advertisements.",
                        ephemeral: true
                    });
                }

                const id =
                    interaction.customId.split(":")[1];

                const ad =
                    db.advertisements[id];

                if (!ad) {
                    return safeReply(interaction, {
                        content:
                            "This advertisement no longer exists.",
                        ephemeral: true
                    });
                }

                if (ad.reviewStatus !== "Pending") {
                    return safeReply(interaction, {
                        content:
                            "This advertisement has already been processed.",
                        ephemeral: true
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `decline_modal:${id}`
                        )
                        .setTitle(
                            "Decline Advertisement"
                        )
                        .addComponents(
                            new ActionRowBuilder()
                                .addComponents(
                                    new TextInputBuilder()
                                        .setCustomId(
                                            "decline_reason"
                                        )
                                        .setLabel(
                                            "Reason for decline"
                                        )
                                        .setPlaceholder(
                                            "Explain why this advertisement is being declined..."
                                        )
                                        .setStyle(
                                            TextInputStyle.Paragraph
                                        )
                                        .setMaxLength(
                                            500
                                        )
                                        .setRequired(
                                            true
                                        )
                                )
                        );

                try {
                    await interaction.showModal(
                        modal
                    );
                } catch (error) {
                    if (error?.code !== 10062) {
                        console.error(
                            "[Decline] Modal error:",
                            error
                        );
                    }
                }

                return;
            }

            /* ANOTHER RANDOM SERVER */

            if (
                interaction.customId ===
                "discover_random"
            ) {
                const ads =
                    approvedAds();

                if (!ads.length) {
                    return safeUpdate(
                        interaction,
                        discoveryMessage(0)
                    );
                }

                const random =
                    ads[
                        Math.floor(
                            Math.random() *
                            ads.length
                        )
                    ];

                return safeUpdate(
                    interaction,
                    {
                        embeds: [
                            createDiscoveryEmbed(
                                random
                            )
                        ],
                        components: [
                            featuredButtons(
                                random
                            ),
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(
                                            "discover_random"
                                        )
                                        .setLabel(
                                            "Another Server"
                                        )
                                        .setStyle(
                                            ButtonStyle.Primary
                                        )
                                ]
                        ]
                    }
                );
            }
        }

        /* -------------------------------------------------
           CHANNEL SELECT MENUS
           ------------------------------------------------- */

        if (
            interaction.isChannelSelectMenu()
        ) {
            if (!isStaff(interaction.member)) {
                return safeReply(interaction, {
                    content:
                        "You do not have permission to use this panel.",
                    ephemeral: true
                });
            }

            const config =
                guildConfig(
                    interaction.guild.id
                );

            const channelId =
                interaction.values[0];

            if (
                interaction.customId ===
                "setup_advertisement_logs"
            ) {
                config.advertisementLogs =
                    channelId;
            }

            if (
                interaction.customId ===
                "setup_featured_servers"
            ) {
                config.featuredServers =
                    channelId;
            }

            if (
                interaction.customId ===
                "setup_moderation_logs"
            ) {
                config.moderationLogs =
                    channelId;
            }

            if (
                interaction.customId ===
                "setup_announcements"
            ) {
                config.announcements =
                    channelId;
            }

            saveDatabase();

            return safeUpdate(
                interaction,
                {
                    embeds: [
                        setupEmbed(
                            interaction.guild
                        )
                    ],
                    components:
                        setupComponents()
                }
            );
        }

        /* -------------------------------------------------
           PENDING SELECT
           ------------------------------------------------- */

        if (
            interaction.isStringSelectMenu() &&
            interaction.customId ===
                "pending_select"
        ) {
            if (!isStaff(interaction.member)) {
                return safeReply(interaction, {
                    content:
                        "You do not have permission to review advertisements.",
                    ephemeral: true
                });
            }

            const id =
                interaction.values[0];

            const ad =
                db.advertisements[id];

            if (!ad) {
                return safeReply(interaction, {
                    content:
                        "That advertisement no longer exists.",
                    ephemeral: true
                });
            }

            return safeUpdate(
                interaction,
                {
                    embeds: [
                        advertisementEmbed(ad)
                    ],
                    components:
                        ad.reviewStatus === "Pending"
                            ? [
                                advertisementButtons(
                                    ad
                                )
                            ]
                            : []
                }
            );
        }

    } catch (error) {
        console.error(
            "[Interaction] Unhandled error:",
            error
        );

        try {
            await safeReply(interaction, {
                content:
                    "Something went wrong while processing your request. Please try again.",
                ephemeral: true
            });
        } catch {}
    }
});

/* =========================================================
   ERROR HANDLING
   ========================================================= */

client.on("error", error => {
    console.error(
        "[Discord Client Error]",
        error
    );
});

client.on("warn", warning => {
    console.warn(
        "[Discord Warning]",
        warning
    );
});

process.on("unhandledRejection", error => {
    console.error(
        "[Unhandled Promise Rejection]",
        error
    );
});

process.on("uncaughtException", error => {
    console.error(
        "[Uncaught Exception]",
        error
    );
});

/* =========================================================
   START
   ========================================================= */

process.on("SIGTERM", () => {
    log("SIGTERM received. Shutting down.");
    client.destroy();
    process.exit(0);
});

process.on("SIGINT", () => {
    log("SIGINT received. Shutting down.");
    client.destroy();
    process.exit(0);
});

client.login(TOKEN);
