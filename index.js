const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    REST,
    Routes
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ============================================================
// SERVERSPOT
// Production Discord Bot
// ============================================================

// -------------------------
// Environment
// -------------------------

const TOKEN =
    process.env.TOKEN ||
    process.env.DISCORD_TOKEN ||
    process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("==========================================");
    console.error("SERVERSPOT ERROR");
    console.error("==========================================");
    console.error("No Discord bot token was found.");
    console.error("");
    console.error("Add this environment variable in Render:");
    console.error("TOKEN");
    console.error("");
    console.error("The bot also accepts DISCORD_TOKEN or BOT_TOKEN.");
    console.error("==========================================");

    process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;

// ServerSpot red
const COLOUR = 0xE00000;

// Other colours
const SUCCESS = 0x22C55E;
const WARNING = 0xF59E0B;
const DARK = 0x555555;

// Files
const CONFIG_FILE = "./serverspot-config.json";
const ADS_FILE = "./serverspot-advertisements.json";

// ============================================================
// WEB SERVER
// Required for Render Web Service
// ============================================================

const webServer = http.createServer((req, res) => {

    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("ServerSpot is online.");
});

webServer.listen(PORT, "0.0.0.0", () => {
    console.log(`ServerSpot web server listening on port ${PORT}`);
});

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel
    ]
});

// ============================================================
// STORAGE
// ============================================================

let configurations = {};
let advertisements = {};

function loadJSON(file, fallback = {}) {

    try {

        if (!fs.existsSync(file)) {
            return fallback;
        }

        const data = fs.readFileSync(file, "utf8");

        if (!data.trim()) {
            return fallback;
        }

        return JSON.parse(data);

    } catch (error) {

        console.error(`Could not read ${file}:`, error);

        return fallback;
    }
}

function saveJSON(file, data) {

    try {

        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 2),
            "utf8"
        );

    } catch (error) {

        console.error(`Could not save ${file}:`, error);
    }
}

function loadData() {

    configurations = loadJSON(CONFIG_FILE, {});
    advertisements = loadJSON(ADS_FILE, {});

    console.log("ServerSpot data loaded.");
}

function saveConfig() {
    saveJSON(CONFIG_FILE, configurations);
}

function saveAdvertisements() {
    saveJSON(ADS_FILE, advertisements);
}

loadData();

// ============================================================
// HELPERS
// ============================================================

function getConfig(guildId) {
    return configurations[guildId] || null;
}

function isAdministrator(interaction) {

    return interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
    );
}

function isStaff(interaction, config) {

    if (isAdministrator(interaction)) {
        return true;
    }

    if (!config?.staffRole) {
        return false;
    }

    return interaction.member?.roles?.cache?.has(
        config.staffRole
    );
}

function cleanText(text, maxLength = 1000) {

    if (!text) {
        return "";
    }

    return text
        .replace(/@everyone/gi, "@ everyone")
        .replace(/@here/gi, "@ here")
        .trim()
        .slice(0, maxLength);
}

function isValidURL(value) {

    try {

        const url = new URL(value);

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {
        return false;
    }
}

function isDiscordInvite(value) {

    if (!isValidURL(value)) {
        return false;
    }

    try {

        const url = new URL(value);
        const host = url.hostname.toLowerCase();

        return (
            host === "discord.gg" ||
            host === "www.discord.gg" ||
            host === "discord.com" ||
            host === "www.discord.com" ||
            host === "discordapp.com" ||
            host === "www.discordapp.com"
        );

    } catch {
        return false;
    }
}

function truncate(text, length = 1024) {

    if (!text) {
        return "Not provided";
    }

    if (text.length <= length) {
        return text;
    }

    return `${text.slice(0, length - 3)}...`;
}

function getStatusEmoji(status) {

    const lower = status.toLowerCase();

    if (
        lower.includes("open") ||
        lower.includes("active")
    ) {
        return "Active";
    }

    if (
        lower.includes("closed") ||
        lower.includes("inactive")
    ) {
        return "Inactive";
    }

    if (
        lower.includes("recruit")
    ) {
        return "Recruiting";
    }

    return status;
}

function getMemberCount(guild) {

    if (!guild) {
        return "Unknown";
    }

    if (guild.approximateMemberCount) {
        return Number(
            guild.approximateMemberCount
        ).toLocaleString();
    }

    if (guild.memberCount) {
        return Number(
            guild.memberCount
        ).toLocaleString();
    }

    return "Unknown";
}

// ============================================================
// COMMANDS
// ============================================================

const commandData = [

    // ========================================================
    // USER COMMANDS
    // ========================================================

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription(
            "Submit your Discord server for review."
        ),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription(
            "View information about this ServerSpot server."
        ),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription(
            "Check ServerSpot's response time."
        ),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription(
            "View ServerSpot's commands and features."
        ),

    // ========================================================
    // STAFF COMMANDS
    // ========================================================

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription(
            "Configure ServerSpot advertisement channels and staff."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addChannelOption(option =>
            option
                .setName("logs")
                .setDescription(
                    "Advertisement review/log channel."
                )
                .addChannelTypes(
                    ChannelType.GuildText
                )
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("featured")
                .setDescription(
                    "Channel for approved advertisements."
                )
                .addChannelTypes(
                    ChannelType.GuildText
                )
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("staff")
                .setDescription(
                    "Role allowed to review advertisements."
                )
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription(
            "View the current ServerSpot configuration."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName("stats")
        .setDescription(
            "View ServerSpot statistics."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )

].map(command => command.toJSON());

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {

    try {

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        console.log("Registering ServerSpot commands...");

        for (const guild of client.guilds.cache.values()) {

            try {

                await rest.put(
                    Routes.applicationGuildCommands(
                        client.user.id,
                        guild.id
                    ),
                    {
                        body: commandData
                    }
                );

                console.log(
                    `Commands registered in: ${guild.name}`
                );

            } catch (error) {

                console.error(
                    `Command registration failed in ${guild.name}:`,
                    error.message
                );
            }
        }

        console.log(
            "ServerSpot commands registered successfully."
        );

    } catch (error) {

        console.error(
            "Global command registration error:",
            error
        );
    }
}

// ============================================================
// READY
// ============================================================

client.once("clientReady", async () => {

    console.log("==========================================");
    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(
        `Serving ${client.guilds.cache.size} server(s).`
    );
    console.log("==========================================");

    await registerCommands();
});

// ============================================================
// GUILD JOIN
// ============================================================

client.on("guildCreate", async guild => {

    console.log(
        `ServerSpot joined a new server: ${guild.name}`
    );

    try {

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationGuildCommands(
                client.user.id,
                guild.id
            ),
            {
                body: commandData
            }
        );

        console.log(
            `Commands registered in new server: ${guild.name}`
        );

    } catch (error) {

        console.error(
            "Could not register commands in new server:",
            error
        );
    }
});

// ============================================================
// INTERACTION HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {

    try {

        // ====================================================
        // SLASH COMMANDS
        // ====================================================

        if (interaction.isChatInputCommand()) {

            // =================================================
            // PING
            // =================================================

            if (interaction.commandName === "ping") {

                const start = Date.now();

                await interaction.deferReply({
                    ephemeral: true
                });

                const latency =
                    Date.now() - start;

                const websocket =
                    Math.round(
                        client.ws.ping
                    );

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle(
                                "ServerSpot"
                            )
                            .setDescription(
                                "ServerSpot is online and operating normally."
                            )
                            .addFields(
                                {
                                    name: "Response",
                                    value: `${latency}ms`,
                                    inline: true
                                },
                                {
                                    name: "Discord",
                                    value: `${websocket}ms`,
                                    inline: true
                                }
                            )
                            .setFooter({
                                text:
                                    "ServerSpot • Discover. Advertise. Connect."
                            })
                    ]
                });
            }

            // =================================================
            // HELP
            // =================================================

            if (interaction.commandName === "help") {

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle(
                                "ServerSpot Commands"
                            )
                            .setDescription(
                                "ServerSpot helps communities discover, advertise and connect with new Discord servers."
                            )
                            .addFields(
                                {
                                    name: "User Commands",
                                    value:
                                        "`/advertise` — Submit a server advertisement.\n" +
                                        "`/serverinfo` — View information about ServerSpot.\n" +
                                        "`/ping` — Check bot response time."
                                },
                                {
                                    name: "Staff Commands",
                                    value:
                                        "`/setup` — Configure ServerSpot.\n" +
                                        "`/config` — View the current configuration.\n" +
                                        "`/stats` — View ServerSpot statistics."
                                }
                            )
                            .setFooter({
                                text:
                                    "ServerSpot • Discover. Advertise. Connect."
                            })
                    ],
                    ephemeral: true
                });
            }

            // =================================================
            // SERVER INFO
            // =================================================

            if (
                interaction.commandName ===
                "serverinfo"
            ) {

                const guild =
                    interaction.guild;

                const icon =
                    guild.iconURL({
                        size: 512
                    });

                const embed =
                    new EmbedBuilder()
                        .setColor(COLOUR)
                        .setTitle(
                            "ServerSpot"
                        )
                        .setDescription(
                            "A platform for discovering and showcasing Discord communities."
                        )
                        .addFields(
                            {
                                name: "Servers",
                                value:
                                    client.guilds.cache.size.toLocaleString(),
                                inline: true
                            },
                            {
                                name: "Members",
                                value:
                                    client.guilds.cache
                                        .reduce(
                                            (total, g) =>
                                                total +
                                                (
                                                    g.memberCount ||
                                                    0
                                                ),
                                            0
                                        )
                                        .toLocaleString(),
                                inline: true
                            },
                            {
                                name: "Current Server",
                                value:
                                    guild.name,
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "ServerSpot • Discover. Advertise. Connect."
                        });

                if (icon) {
                    embed.setThumbnail(icon);
                }

                return interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            // =================================================
            // SETUP
            // =================================================

            if (
                interaction.commandName ===
                "setup"
            ) {

                if (!isAdministrator(interaction)) {

                    return interaction.reply({
                        content:
                            "You need Administrator permissions to configure ServerSpot.",
                        ephemeral: true
                    });
                }

                const logs =
                    interaction.options.getChannel(
                        "logs"
                    );

                const featured =
                    interaction.options.getChannel(
                        "featured"
                    );

                const staff =
                    interaction.options.getRole(
                        "staff"
                    );

                configurations[
                    interaction.guild.id
                ] = {

                    logsChannel:
                        logs.id,

                    featuredChannel:
                        featured.id,

                    staffRole:
                        staff.id,

                    updatedAt:
                        new Date().toISOString(),

                    updatedBy:
                        interaction.user.id
                };

                saveConfig();

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(SUCCESS)
                            .setTitle(
                                "ServerSpot Setup Complete"
                            )
                            .setDescription(
                                "ServerSpot is now configured and ready to receive advertisements."
                            )
                            .addFields(
                                {
                                    name:
                                        "Advertisement Logs",
                                    value:
                                        `${logs}`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Featured Servers",
                                    value:
                                        `${featured}`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Staff Role",
                                    value:
                                        `${staff}`,
                                    inline: true
                                }
                            )
                            .setFooter({
                                text:
                                    "ServerSpot configuration"
                            })
                    ],
                    ephemeral: true
                });
            }

            // =================================================
            // CONFIG
            // =================================================

            if (
                interaction.commandName ===
                "config"
            ) {

                if (!isAdministrator(interaction)) {

                    return interaction.reply({
                        content:
                            "You need Administrator permissions to view the configuration.",
                        ephemeral: true
                    });
                }

                const config =
                    getConfig(
                        interaction.guild.id
                    );

                if (!config) {

                    return interaction.reply({
                        content:
                            "ServerSpot has not been configured yet. Use `/setup` first.",
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle(
                                "ServerSpot Configuration"
                            )
                            .addFields(
                                {
                                    name:
                                        "Advertisement Logs",
                                    value:
                                        `<#${config.logsChannel}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Featured Servers",
                                    value:
                                        `<#${config.featuredChannel}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Staff Role",
                                    value:
                                        `<@&${config.staffRole}>`,
                                    inline: true
                                }
                            )
                    ],
                    ephemeral: true
                });
            }

            // =================================================
            // STATS
            // =================================================

            if (
                interaction.commandName ===
                "stats"
            ) {

                const config =
                    getConfig(
                        interaction.guild.id
                    );

                if (
                    !isStaff(
                        interaction,
                        config
                    )
                ) {

                    return interaction.reply({
                        content:
                            "You do not have permission to use this command.",
                        ephemeral: true
                    });
                }

                const guildAds =
                    Object.values(
                        advertisements
                    ).filter(
                        ad =>
                            ad.guildId ===
                            interaction.guild.id
                    );

                const accepted =
                    guildAds.filter(
                        ad =>
                            ad.status ===
                            "accepted"
                    ).length;

                const declined =
                    guildAds.filter(
                        ad =>
                            ad.status ===
                            "declined"
                    ).length;

                const pending =
                    guildAds.filter(
                        ad =>
                            ad.status ===
                            "pending"
                    ).length;

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle(
                                "ServerSpot Statistics"
                            )
                            .addFields(
                                {
                                    name:
                                        "Total Submissions",
                                    value:
                                        `${guildAds.length}`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Accepted",
                                    value:
                                        `${accepted}`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Declined",
                                    value:
                                        `${declined}`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Pending",
                                    value:
                                        `${pending}`,
                                    inline: true
                                }
                            )
                    ],
                    ephemeral: true
                });
            }

            // =================================================
            // ADVERTISE
            // =================================================

            if (
                interaction.commandName ===
                "advertise"
            ) {

                const config =
                    getConfig(
                        interaction.guild.id
                    );

                if (
                    !config ||
                    !config.logsChannel ||
                    !config.featuredChannel ||
                    !config.staffRole
                ) {

                    return interaction.reply({
                        content:
                            "ServerSpot has not been configured yet. Please ask a server administrator to run `/setup`.",
                        ephemeral: true
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            "serverspot_advertise"
                        )
                        .setTitle(
                            "ServerSpot Advertisement"
                        );

                const invite =
                    new TextInputBuilder()
                        .setCustomId(
                            "invite"
                        )
                        .setLabel(
                            "Discord Invite Link"
                        )
                        .setPlaceholder(
                            "https://discord.gg/example"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(200);

                const group =
                    new TextInputBuilder()
                        .setCustomId(
                            "group"
                        )
                        .setLabel(
                            "Group / Website Link"
                        )
                        .setPlaceholder(
                            "https://example.com"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(500);

                const image =
                    new TextInputBuilder()
                        .setCustomId(
                            "image"
                        )
                        .setLabel(
                            "Server Image URL"
                        )
                        .setPlaceholder(
                            "https://example.com/image.png"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(false)
                        .setMaxLength(500);

                const description =
                    new TextInputBuilder()
                        .setCustomId(
                            "description"
                        )
                        .setLabel(
                            "Server Description"
                        )
                        .setPlaceholder(
                            "Tell people what makes your server great..."
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(1000);

                const status =
                    new TextInputBuilder()
                        .setCustomId(
                            "status"
                        )
                        .setLabel(
                            "Server Status"
                        )
                        .setPlaceholder(
                            "Active • Recruiting • Open"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(100);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(
                            invite
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            group
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            image
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            description
                        ),
                    new ActionRowBuilder()
                        .addComponents(
                            status
                        )
                );

                return interaction.showModal(
                    modal
                );
            }
        }

        // ====================================================
        // ADVERTISEMENT MODAL
        // ====================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                "serverspot_advertise"
        ) {

            // IMPORTANT:
            // Acknowledge immediately.
            // This prevents Discord interaction expiry.

            await interaction.deferReply({
                ephemeral: true
            });

            const config =
                getConfig(
                    interaction.guild.id
                );

            if (!config) {

                return interaction.editReply(
                    "ServerSpot has not been configured yet. Please ask an administrator to run `/setup`."
                );
            }

            // ------------------------------------------------
            // Read form
            // ------------------------------------------------

            const invite =
                interaction.fields.getTextInputValue(
                    "invite"
                ).trim();

            const group =
                interaction.fields.getTextInputValue(
                    "group"
                ).trim();

            const image =
                interaction.fields.getTextInputValue(
                    "image"
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
                    100
                );

            // ------------------------------------------------
            // Validate invite
            // ------------------------------------------------

            if (!isDiscordInvite(invite)) {

                return interaction.editReply(
                    "The Discord invite link you entered is not valid."
                );
            }

            // ------------------------------------------------
            // Validate group link
            // ------------------------------------------------

            if (!isValidURL(group)) {

                return interaction.editReply(
                    "The group or website link you entered is not a valid URL."
                );
            }

            // ------------------------------------------------
            // Validate image
            // ------------------------------------------------

            let imageURL = null;

            if (image) {

                if (!isValidURL(image)) {

                    return interaction.editReply(
                        "The server image URL is not a valid URL."
                    );
                }

                imageURL = image;
            }

            // ------------------------------------------------
            // Fetch Discord invite
            // ------------------------------------------------

            let inviteData = null;

            try {

                inviteData =
                    await client.fetchInvite(
                        invite,
                        {
                            withCounts: true
                        }
                    );

            } catch (error) {

                console.log(
                    "Invite lookup failed:",
                    error.message
                );

                return interaction.editReply(
                    "I couldn't verify that Discord invite. Please make sure the invite is valid and still active."
                );
            }

            // ------------------------------------------------
            // Server details
            // ------------------------------------------------

            const targetGuild =
                inviteData.guild;

            if (!targetGuild) {

                return interaction.editReply(
                    "Discord did not provide information about that server. Please use a valid server invite."
                );
            }

            const serverName =
                targetGuild.name ||
                "Unknown Server";

            const memberCount =
                inviteData.approximateMemberCount
                    ? Number(
                        inviteData.approximateMemberCount
                    ).toLocaleString()
                    : "Unknown";

            // ------------------------------------------------
            // Automatic server icon
            // ------------------------------------------------

            if (
                !imageURL &&
                targetGuild.icon
            ) {

                imageURL =
                    `https://cdn.discordapp.com/icons/${targetGuild.id}/${targetGuild.icon}.png?size=512`;
            }

            // ------------------------------------------------
            // Advertisement ID
            // ------------------------------------------------

            const advertisementId =
                `${Date.now()}-${interaction.user.id}`;

            // ------------------------------------------------
            // Store advertisement
            // ------------------------------------------------

            advertisements[
                advertisementId
            ] = {

                id:
                    advertisementId,

                guildId:
                    interaction.guild.id,

                advertiserId:
                    interaction.user.id,

                serverName,

                invite,

                group,

                image:
                    imageURL,

                description,

                status:
                    getStatusEmoji(status),

                members:
                    memberCount,

                state:
                    "pending",

                submittedAt:
                    new Date().toISOString(),

                reviewedAt:
                    null,

                reviewerId:
                    null
            };

            saveAdvertisements();

            // ------------------------------------------------
            // Log embed
            // ------------------------------------------------

            const logEmbed =
                new EmbedBuilder()
                    .setColor(COLOUR)
                    .setTitle(
                        "New Server Advertisement"
                    )
                    .setDescription(
                        "A new advertisement is waiting for staff review."
                    )
                    .addFields(

                        {
                            name:
                                "Server",
                            value:
                                truncate(
                                    serverName,
                                    1024
                                ),
                            inline: true
                        },

                        {
                            name:
                                "Members",
                            value:
                                memberCount,
                            inline: true
                        },

                        {
                            name:
                                "Status",
                            value:
                                status,
                            inline: true
                        },

                        {
                            name:
                                "Submitted By",
                            value:
                                `<@${interaction.user.id}>`,
                            inline: true
                        },

                        {
                            name:
                                "Discord Invite",
                            value:
                                `[Join Server](${invite})`,
                            inline: false
                        },

                        {
                            name:
                                "Group / Website",
                            value:
                                `[Open Link](${group})`,
                            inline: false
                        },

                        {
                            name:
                                "Description",
                            value:
                                truncate(
                                    description
                                ),
                            inline: false
                        },

                        {
                            name:
                                "Advertisement ID",
                            value:
                                `\`${advertisementId}\``,
                            inline: false
                        }
                    )
                    .setFooter({
                        text:
                            "ServerSpot • Awaiting staff review"
                    })
                    .setTimestamp();

            if (imageURL) {
                logEmbed.setThumbnail(
                    imageURL
                );
            }

            // ------------------------------------------------
            // Buttons
            // ------------------------------------------------

            const buttons =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `serverspot_accept:${advertisementId}`
                            )
                            .setLabel(
                                "Accept"
                            )
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `serverspot_decline:${advertisementId}`
                            )
                            .setLabel(
                                "Decline"
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            )

                    );

            // ------------------------------------------------
            // Find logs channel
            // ------------------------------------------------

            const logsChannel =
                await interaction.guild.channels.fetch(
                    config.logsChannel
                ).catch(() => null);

            if (
                !logsChannel ||
                !logsChannel.isTextBased()
            ) {

                delete advertisements[
                    advertisementId
                ];

                saveAdvertisements();

                return interaction.editReply(
                    "The configured advertisement logs channel could not be found. Please ask an administrator to run `/setup` again."
                );
            }

            // ------------------------------------------------
            // Send review
            // ------------------------------------------------

            let logMessage;

            try {

                logMessage =
                    await logsChannel.send({
                        embeds: [
                            logEmbed
                        ],
                        components: [
                            buttons
                        ]
                    });

            } catch (error) {

                console.error(
                    "Could not send advertisement log:",
                    error
                );

                delete advertisements[
                    advertisementId
                ];

                saveAdvertisements();

                return interaction.editReply(
                    "I couldn't send your advertisement to the review channel. Please contact ServerSpot staff."
                );
            }

            // ------------------------------------------------
            // Store log message ID
            // ------------------------------------------------

            advertisements[
                advertisementId
            ].logMessageId =
                logMessage.id;

            saveAdvertisements();

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(SUCCESS)
                        .setTitle(
                            "Advertisement Submitted"
                        )
                        .setDescription(
                            "Your advertisement has been successfully submitted to ServerSpot staff for review."
                        )
                        .addFields(
                            {
                                name:
                                    "Server",
                                value:
                                    serverName,
                                inline: true
                            },
                            {
                                name:
                                    "Status",
                                value:
                                    "Awaiting Review",
                                inline: true
                            }
                        )
                        .setFooter({
                            text:
                                "ServerSpot • Thank you for using ServerSpot"
                        })
                ]
            });
        }

        // ====================================================
        // BUTTONS
        // ====================================================

        if (
            interaction.isButton()
        ) {

            const parts =
                interaction.customId.split(":");

            const action =
                parts[0];

            const advertisementId =
                parts.slice(1).join(":");

            if (
                action !==
                    "serverspot_accept" &&
                action !==
                    "serverspot_decline"
            ) {
                return;
            }

            const advertisement =
                advertisements[
                    advertisementId
                ];

            if (!advertisement) {

                return interaction.reply({
                    content:
                        "This advertisement could not be found. It may have expired or been removed.",
                    ephemeral: true
                });
            }

            const config =
                getConfig(
                    interaction.guild.id
                );

            if (
                !isStaff(
                    interaction,
                    config
                )
            ) {

                return interaction.reply({
                    content:
                        "You do not have permission to review advertisements.",
                    ephemeral: true
                });
            }

            // ------------------------------------------------
            // Prevent double processing
            // ------------------------------------------------

            if (
                advertisement.state !==
                "pending"
            ) {

                return interaction.reply({
                    content:
                        `This advertisement has already been ${advertisement.state}.`,
                    ephemeral: true
                });
            }

            // ------------------------------------------------
            // ACCEPT
            // ------------------------------------------------

            if (
                action ===
                "serverspot_accept"
            ) {

                await interaction.deferUpdate();

                advertisement.state =
                    "accepted";

                advertisement.reviewedAt =
                    new Date().toISOString();

                advertisement.reviewerId =
                    interaction.user.id;

                saveAdvertisements();

                // --------------------------------------------
                // Featured channel
                // --------------------------------------------

                const featuredChannel =
                    await interaction.guild.channels.fetch(
                        config.featuredChannel
                    ).catch(() => null);

                if (
                    !featuredChannel ||
                    !featuredChannel.isTextBased()
                ) {

                    advertisement.state =
                        "pending";

                    advertisement.reviewedAt =
                        null;

                    advertisement.reviewerId =
                        null;

                    saveAdvertisements();

                    return interaction.followUp({
                        content:
                            "The Featured Servers channel could not be found. The advertisement has been returned to pending.",
                        ephemeral: true
                    });
                }

                // --------------------------------------------
                // Featured embed
                // --------------------------------------------

                const featuredEmbed =
                    new EmbedBuilder()
                        .setColor(COLOUR)
                        .setTitle(
                            advertisement.serverName
                        )
                        .setDescription(
                            advertisement.description
                        )
                        .addFields(

                            {
                                name:
                                    "Status",
                                value:
                                    advertisement.status,
                                inline: true
                            },

                            {
                                name:
                                    "Members",
                                value:
                                    advertisement.members,
                                inline: true
                            },

                            {
                                name:
                                    "Discord",
                                value:
                                    `[Join Server](${advertisement.invite})`,
                                inline: true
                            },

                            {
                                name:
                                    "Group / Website",
                                value:
                                    `[Open Link](${advertisement.group})`,
                                inline: true
                            }

                        )
                        .setFooter({
                            text:
                                "ServerSpot • Featured Server"
                        })
                        .setTimestamp();

                // Server image as thumbnail
                if (
                    advertisement.image
                ) {

                    featuredEmbed.setThumbnail(
                        advertisement.image
                    );
                }

                // --------------------------------------------
                // Send featured advertisement
                // --------------------------------------------

                let featuredMessage;

                try {

                    featuredMessage =
                        await featuredChannel.send({
                            embeds: [
                                featuredEmbed
                            ]
                        });

                } catch (error) {

                    console.error(
                        "Could not post featured advertisement:",
                        error
                    );

                    advertisement.state =
                        "pending";

                    advertisement.reviewedAt =
                        null;

                    advertisement.reviewerId =
                        null;

                    saveAdvertisements();

                    return interaction.followUp({
                        content:
                            "I couldn't post the advertisement in the Featured Servers channel. The advertisement has been returned to pending.",
                        ephemeral: true
                    });
                }

                advertisement.featuredMessageId =
                    featuredMessage.id;

                saveAdvertisements();

                // --------------------------------------------
                // Update log
                // --------------------------------------------

                const updatedLog =
                    EmbedBuilder.from(
                        interaction.message.embeds[0]
                    )
                        .setColor(SUCCESS)
                        .setFooter({
                            text:
                                `Accepted by ${interaction.user.tag}`
                        });

                await interaction.message.edit({
                    embeds: [
                        updatedLog
                    ],
                    components: []
                }).catch(() => {});

                // --------------------------------------------
                // Notify advertiser
                // --------------------------------------------

                try {

                    const advertiser =
                        await client.users.fetch(
                            advertisement.advertiserId
                        );

                    await advertiser.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(SUCCESS)
                                .setTitle(
                                    "Advertisement Approved"
                                )
                                .setDescription(
                                    `Your advertisement for **${advertisement.serverName}** has been approved and is now featured on ServerSpot.`
                                )
                                .addFields(
                                    {
                                        name:
                                            "Status",
                                        value:
                                            "Approved",
                                        inline: true
                                    },
                                    {
                                        name:
                                            "Members",
                                        value:
                                            advertisement.members,
                                        inline: true
                                    }
                                )
                                .setFooter({
                                    text:
                                        "ServerSpot"
                                })
                        ]
                    });

                } catch {
                    console.log(
                        `Could not DM advertiser ${advertisement.advertiserId}.`
                    );
                }

                return;
            }

            // ------------------------------------------------
            // DECLINE
            // ------------------------------------------------

            if (
                action ===
                "serverspot_decline"
            ) {

                await interaction.deferUpdate();

                advertisement.state =
                    "declined";

                advertisement.reviewedAt =
                    new Date().toISOString();

                advertisement.reviewerId =
                    interaction.user.id;

                saveAdvertisements();

                const declinedLog =
                    EmbedBuilder.from(
                        interaction.message.embeds[0]
                    )
                        .setColor(DARK)
                        .setFooter({
                            text:
                                `Declined by ${interaction.user.tag}`
                        });

                await interaction.message.edit({
                    embeds: [
                        declinedLog
                    ],
                    components: []
                }).catch(() => {});

                // --------------------------------------------
                // Notify advertiser
                // --------------------------------------------

                try {

                    const advertiser =
                        await client.users.fetch(
                            advertisement.advertiserId
                        );

                    await advertiser.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLOUR)
                                .setTitle(
                                    "Advertisement Declined"
                                )
                                .setDescription(
                                    `Your advertisement for **${advertisement.serverName}** was not approved by the ServerSpot moderation team.`
                                )
                                .addFields(
                                    {
                                        name:
                                            "What happens next?",
                                        value:
                                            "You can make any necessary changes and submit a new advertisement using `/advertise`."
                                    }
                                )
                                .setFooter({
                                    text:
                                        "ServerSpot"
                                })
                        ]
                    });

                } catch {
                    console.log(
                        `Could not DM advertiser ${advertisement.advertiserId}.`
                    );
                }

                return;
            }
        }

    } catch (error) {

        console.error(
            "=========================================="
        );

        console.error(
            "ServerSpot interaction error:"
        );

        console.error(error);

        console.error(
            "=========================================="
        );

        // ----------------------------------------------------
        // Safely respond if possible
        // ----------------------------------------------------

        try {

            if (
                interaction.deferred &&
                !interaction.replied
            ) {

                await interaction.editReply({
                    content:
                        "Something went wrong while processing your request. Please try again."
                });

            } else if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({
                    content:
                        "Something went wrong while processing your request. Please try again.",
                    ephemeral: true
                });

            }

        } catch {
            // Discord interaction has already expired.
        }
    }
});

// ============================================================
// DISCORD CLIENT ERRORS
// ============================================================

client.on("error", error => {

    console.error(
        "Discord client error:",
        error
    );
});

client.on("warn", warning => {

    console.warn(
        "Discord warning:",
        warning
    );
});

process.on("unhandledRejection", error => {

    console.error(
        "Unhandled promise rejection:",
        error
    );
});

process.on("uncaughtException", error => {

    console.error(
        "Uncaught exception:",
        error
    );
});

// ============================================================
// LOGIN
// ============================================================

console.log("Starting ServerSpot...");

client.login(TOKEN)
    .then(() => {
        console.log(
            "Discord login successful."
        );
    })
    .catch(error => {

        console.error(
            "Discord login failed:"
        );

        console.error(
            error
        );

        process.exit(1);
    });
