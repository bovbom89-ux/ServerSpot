const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// =====================================================
// CONFIGURATION
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const EMBED_COLOR = 0xE00000;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
    console.error("Missing DISCORD_TOKEN or CLIENT_ID environment variable.");
    process.exit(1);
}

// =====================================================
// PERSISTENT DATA
// =====================================================

const DATA_FILE = path.join(__dirname, "serverspot-data.json");

let data = {
    guilds: {},
    advertisements: {},
    featured: [],
    blacklisted: []
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const file = fs.readFileSync(DATA_FILE, "utf8");
            data = JSON.parse(file);

            if (!data.guilds) data.guilds = {};
            if (!data.advertisements) data.advertisements = {};
            if (!data.featured) data.featured = [];
            if (!data.blacklisted) data.blacklisted = [];
        }

        console.log("ServerSpot data loaded.");
    } catch (error) {
        console.error("Could not load ServerSpot data:", error);
    }
}

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error("Could not save ServerSpot data:", error);
    }
}

loadData();

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// =====================================================
// HTTP SERVER FOR RENDER
// =====================================================

http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("ServerSpot is online.");
}).listen(PORT, "0.0.0.0", () => {
    console.log(`Web server listening on port ${PORT}`);
});

// =====================================================
// COMMANDS
// =====================================================

const commands = [

    // USER

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server advertisement"),

    new SlashCommandBuilder()
        .setName("browse")
        .setDescription("Browse approved server advertisements"),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search approved server advertisements")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("Search for a server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("View a server advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("featured")
        .setDescription("View featured servers"),

    new SlashCommandBuilder()
        .setName("categories")
        .setDescription("View server categories"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands"),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View ServerSpot guidelines"),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn about ServerSpot"),

    // STAFF

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot")
        .addChannelOption(option =>
            option
                .setName("logs")
                .setDescription("Advertisement logs channel")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("advertisements")
                .setDescription("Public advertisement channel")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("review")
        .setDescription("View pending advertisements"),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove an advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("feature")
        .setDescription("Feature a server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unfeature")
        .setDescription("Remove featured status")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("blacklist")
        .setDescription("Blacklist a server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unblacklist")
        .setDescription("Remove a server from the blacklist")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View ServerSpot statistics"),

    new SlashCommandBuilder()
        .setName("announce")
        .setDescription("Send a ServerSpot announcement")
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Announcement message")
                .setRequired(true)
        )

].map(command => command.toJSON());

// =====================================================
// STAFF CHECK
// =====================================================

function isStaff(interaction) {
    return interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
    );
}

// =====================================================
// URL CHECK
// =====================================================

function validURL(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" ||
            url.protocol === "http:"
        );
    } catch {
        return false;
    }
}

// =====================================================
// DISCORD INVITE CHECK
// =====================================================

function validDiscordInvite(value) {
    return /^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\/.+/i.test(
        value
    );
}

// =====================================================
// REGISTER COMMANDS
// =====================================================

async function registerCommands() {
    try {
        console.log("Registering ServerSpot commands...");

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log("ServerSpot commands registered successfully.");
    } catch (error) {
        console.error("Command registration failed:", error);
    }
}

// =====================================================
// READY
// =====================================================

client.once("clientReady", async () => {
    console.log(
        `ServerSpot is online as ${client.user.tag}`
    );

    console.log(
        `Serving ${client.guilds.cache.size} server(s).`
    );

    await registerCommands();
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on("interactionCreate", async interaction => {

    try {

        // =================================================
        // ACCEPT BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith("serverspot_accept_")
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "You do not have permission to accept advertisements.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Acknowledge immediately
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const id = interaction.customId.replace(
                "serverspot_accept_",
                ""
            );

            const ad = data.advertisements[id];

            if (!ad) {
                return interaction.editReply(
                    "This advertisement could not be found."
                );
            }

            if (ad.status !== "Pending") {
                return interaction.editReply(
                    `This advertisement has already been ${ad.status.toLowerCase()}.`
                );
            }

            const settings = data.guilds[ad.guildId];

            if (!settings) {
                return interaction.editReply(
                    "ServerSpot has not been configured correctly. Please run `/setup` again."
                );
            }

            const channel = await client.channels.fetch(
                settings.advertisementChannel
            ).catch(() => null);

            if (!channel) {
                return interaction.editReply(
                    "The advertisement channel could not be found."
                );
            }

            ad.status = "Approved";
            ad.approvedBy = interaction.user.id;
            ad.approvedAt = Date.now();

            saveData();

            const publicEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(ad.name)
                .setDescription(ad.description)
                .addFields(
                    {
                        name: "Category",
                        value: ad.category,
                        inline: true
                    },
                    {
                        name: "Discord",
                        value: `[Join Server](${ad.invite})`,
                        inline: true
                    },
                    {
                        name: "Group",
                        value: `[View Group](${ad.group})`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "ServerSpot • Discover. Advertise. Connect."
                })
                .setTimestamp();

            await channel.send({
                embeds: [publicEmbed]
            });

            const approvedEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle("Advertisement Approved")
                .addFields(
                    {
                        name: "Server",
                        value: ad.name
                    },
                    {
                        name: "Submitted By",
                        value: `<@${ad.userId}>`
                    },
                    {
                        name: "Approved By",
                        value: `<@${interaction.user.id}>`
                    },
                    {
                        name: "Status",
                        value: "Approved"
                    }
                )
                .setTimestamp();

            await interaction.message.edit({
                embeds: [approvedEmbed],
                components: []
            });

            try {
                const user = await client.users.fetch(ad.userId);

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(EMBED_COLOR)
                            .setTitle("Advertisement Approved")
                            .setDescription(
                                `Your ServerSpot advertisement for **${ad.name}** has been approved and published.`
                            )
                    ]
                });
            } catch {
                console.log("Could not DM advertiser.");
            }

            return interaction.editReply(
                "Advertisement accepted and published."
            );
        }

        // =================================================
        // DECLINE BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith("serverspot_decline_")
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "You do not have permission to decline advertisements.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const id = interaction.customId.replace(
                "serverspot_decline_",
                ""
            );

            const ad = data.advertisements[id];

            if (!ad) {
                return interaction.reply({
                    content: "This advertisement could not be found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (ad.status !== "Pending") {
                return interaction.reply({
                    content:
                        `This advertisement has already been ${ad.status.toLowerCase()}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const modal = new ModalBuilder()
                .setCustomId(
                    `serverspot_decline_modal_${id}`
                )
                .setTitle("Decline Advertisement");

            const reason = new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Reason for declining")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(
                    "Explain why this advertisement is being declined..."
                )
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(reason)
            );

            return interaction.showModal(modal);
        }

        // =================================================
        // DECLINE MODAL
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                "serverspot_decline_modal_"
            )
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "You do not have permission to decline advertisements.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Acknowledge immediately
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const id = interaction.customId.replace(
                "serverspot_decline_modal_",
                ""
            );

            const ad = data.advertisements[id];

            if (!ad) {
                return interaction.editReply(
                    "This advertisement could not be found."
                );
            }

            if (ad.status !== "Pending") {
                return interaction.editReply(
                    `This advertisement has already been ${ad.status.toLowerCase()}.`
                );
            }

            const reason = interaction.fields.getTextInputValue(
                "reason"
            );

            ad.status = "Declined";
            ad.declinedBy = interaction.user.id;
            ad.declineReason = reason;
            ad.declinedAt = Date.now();

            saveData();

            const declinedEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle("Advertisement Declined")
                .addFields(
                    {
                        name: "Server",
                        value: ad.name
                    },
                    {
                        name: "Submitted By",
                        value: `<@${ad.userId}>`
                    },
                    {
                        name: "Declined By",
                        value: `<@${interaction.user.id}>`
                    },
                    {
                        name: "Reason",
                        value: reason
                    },
                    {
                        name: "Status",
                        value: "Declined"
                    }
                )
                .setTimestamp();

            await interaction.message.edit({
                embeds: [declinedEmbed],
                components: []
            });

            try {
                const user = await client.users.fetch(ad.userId);

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(EMBED_COLOR)
                            .setTitle("Advertisement Declined")
                            .setDescription(
                                `Your ServerSpot advertisement for **${ad.name}** was declined.`
                            )
                            .addFields({
                                name: "Reason",
                                value: reason
                            })
                    ]
                });
            } catch {
                console.log("Could not DM advertiser.");
            }

            return interaction.editReply(
                "Advertisement declined. The advertiser has been notified."
            );
        }

        // =================================================
        // /ADVERTISE
        // =================================================

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === "advertise"
        ) {

            const settings =
                data.guilds[interaction.guild.id];

            if (!settings) {
                return interaction.reply({
                    content:
                        "ServerSpot has not been configured yet. Please ask an administrator to run `/setup`.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Make sure channels still exist
            const logsChannel = await client.channels.fetch(
                settings.logsChannel
            ).catch(() => null);

            const advertisementChannel = await client.channels.fetch(
                settings.advertisementChannel
            ).catch(() => null);

            if (!logsChannel || !advertisementChannel) {
                return interaction.reply({
                    content:
                        "ServerSpot's configured channels could not be found. Please ask an administrator to run `/setup` again.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // FORM

            const modal = new ModalBuilder()
                .setCustomId("serverspot_advertise")
                .setTitle("ServerSpot Advertisement");

            const name = new TextInputBuilder()
                .setCustomId("server_name")
                .setLabel("Server Name")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Example Community")
                .setRequired(true)
                .setMaxLength(100);

            const invite = new TextInputBuilder()
                .setCustomId("invite")
                .setLabel("Discord Invite Link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://discord.gg/example")
                .setRequired(true)
                .setMaxLength(300);

            const group = new TextInputBuilder()
                .setCustomId("group")
                .setLabel("Group Link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://example.com/group")
                .setRequired(true)
                .setMaxLength(300);

            const description = new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Server Description")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(
                    "Tell people about your server..."
                )
                .setRequired(true)
                .setMaxLength(1000);

            const category = new TextInputBuilder()
                .setCustomId("category")
                .setLabel("Category")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(
                    "Gaming, Social, Roleplay..."
                )
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(
                new ActionRowBuilder().addComponents(name),
                new ActionRowBuilder().addComponents(invite),
                new ActionRowBuilder().addComponents(group),
                new ActionRowBuilder().addComponents(description),
                new ActionRowBuilder().addComponents(category)
            );

            // IMPORTANT:
            // showModal must happen immediately.
            return interaction.showModal(modal);
        }

        // =================================================
        // ADVERTISE FORM SUBMISSION
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "serverspot_advertise"
        ) {

            // Acknowledge immediately so Discord doesn't expire it.
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const name =
                interaction.fields.getTextInputValue("server_name");

            const invite =
                interaction.fields.getTextInputValue("invite");

            const group =
                interaction.fields.getTextInputValue("group");

            const description =
                interaction.fields.getTextInputValue("description");

            const category =
                interaction.fields.getTextInputValue("category");

            // Validate Discord invite
            if (!validDiscordInvite(invite)) {
                return interaction.editReply(
                    "The Discord invite link is invalid. Please use a link such as `https://discord.gg/example`."
                );
            }

            // Validate group link
            if (!validURL(group)) {
                return interaction.editReply(
                    "The group link is invalid. Please enter a valid link beginning with `https://`."
                );
            }

            const settings =
                data.guilds[interaction.guild.id];

            if (!settings) {
                return interaction.editReply(
                    "ServerSpot has not been configured yet. Please ask an administrator to run `/setup`."
                );
            }

            const logsChannel = await client.channels.fetch(
                settings.logsChannel
            ).catch(() => null);

            if (!logsChannel) {
                return interaction.editReply(
                    "The advertisement logs channel could not be found. Please ask an administrator to run `/setup` again."
                );
            }

            // Unique ID
            const id =
                `${interaction.guild.id}-${interaction.user.id}-${Date.now()}`;

            // Save advertisement BEFORE sending log
            data.advertisements[id] = {
                id,
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                name,
                invite,
                group,
                description,
                category,
                status: "Pending",
                submittedAt: Date.now()
            };

            saveData();

            const logEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle("New Advertisement")
                .setDescription(
                    "A new ServerSpot advertisement has been submitted and is awaiting staff review."
                )
                .addFields(
                    {
                        name: "Server Name",
                        value: name
                    },
                    {
                        name: "Submitted By",
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: "Category",
                        value: category,
                        inline: true
                    },
                    {
                        name: "Discord Invite",
                        value: `[Open Invite](${invite})`
                    },
                    {
                        name: "Group Link",
                        value: `[Open Group](${group})`
                    },
                    {
                        name: "Description",
                        value: description
                    },
                    {
                        name: "Status",
                        value: "Pending Review"
                    }
                )
                .setFooter({
                    text: "ServerSpot Advertisement Review"
                })
                .setTimestamp();

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `serverspot_accept_${id}`
                        )
                        .setLabel("Accept")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `serverspot_decline_${id}`
                        )
                        .setLabel("Decline")
                        .setStyle(ButtonStyle.Danger)
                );

            try {

                await logsChannel.send({
                    embeds: [logEmbed],
                    components: [buttons]
                });

            } catch (error) {

                console.error(
                    "Could not send advertisement to logs:",
                    error
                );

                delete data.advertisements[id];
                saveData();

                return interaction.editReply(
                    "I couldn't send your advertisement to the staff logs. Please contact ServerSpot staff."
                );
            }

            return interaction.editReply(
                "Your advertisement has been submitted successfully and is now awaiting staff review."
            );
        }

        // =================================================
        // ALL CHAT INPUT COMMANDS
        // =================================================

        if (!interaction.isChatInputCommand()) {
            return;
        }

        // =================================================
        // /SETUP
        // =================================================

        if (interaction.commandName === "setup") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "You must be an administrator to use this command.",
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const logs =
                interaction.options.getChannel("logs");

            const advertisements =
                interaction.options.getChannel("advertisements");

            data.guilds[interaction.guild.id] = {
                logsChannel: logs.id,
                advertisementChannel: advertisements.id
            };

            saveData();

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Setup Complete")
                        .addFields(
                            {
                                name: "Advertisement Logs",
                                value: `${logs}`
                            },
                            {
                                name: "Advertisement Channel",
                                value: `${advertisements}`
                            }
                        )
                        .setFooter({
                            text: "This configuration will survive bot restarts."
                        })
                ]
            });
        }

        // =================================================
        // STAFF PERMISSION CHECK
        // =================================================

        const staffCommands = [
            "review",
            "remove",
            "feature",
            "unfeature",
            "blacklist",
            "unblacklist",
            "stats",
            "announce"
        ];

        if (
            staffCommands.includes(interaction.commandName) &&
            !isStaff(interaction)
        ) {
            return interaction.reply({
                content:
                    "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral
            });
        }

        // =================================================
        // /REVIEW
        // =================================================

        if (interaction.commandName === "review") {

            const pending =
                Object.values(data.advertisements)
                    .filter(ad => ad.status === "Pending");

            if (!pending.length) {
                return interaction.reply({
                    content:
                        "There are no pending advertisements.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const list = pending
                .slice(0, 20)
                .map(
                    ad =>
                        `**${ad.name}** — <@${ad.userId}>`
                )
                .join("\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Pending Advertisements")
                        .setDescription(list)
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        // =================================================
        // /REMOVE
        // =================================================

        if (interaction.commandName === "remove") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                Object.values(data.advertisements)
                    .find(
                        ad =>
                            ad.name.toLowerCase() === name
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            delete data.advertisements[ad.id];

            data.featured =
                data.featured.filter(
                    id => id !== ad.id
                );

            saveData();

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Advertisement Removed")
                        .setDescription(
                            `**${ad.name}** has been removed from ServerSpot.`
                        )
                ]
            });
        }

        // =================================================
        // /FEATURE
        // =================================================

        if (interaction.commandName === "feature") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                Object.values(data.advertisements)
                    .find(
                        ad =>
                            ad.name.toLowerCase() === name &&
                            ad.status === "Approved"
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That approved server could not be found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!data.featured.includes(ad.id)) {
                data.featured.push(ad.id);
            }

            saveData();

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Server Featured")
                        .setDescription(
                            `**${ad.name}** is now featured.`
                        )
                ]
            });
        }

        // =================================================
        // /UNFEATURE
        // =================================================

        if (interaction.commandName === "unfeature") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                Object.values(data.advertisements)
                    .find(
                        ad =>
                            ad.name.toLowerCase() === name
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            data.featured =
                data.featured.filter(
                    id => id !== ad.id
                );

            saveData();

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Server Unfeatured")
                        .setDescription(
                            `**${ad.name}** has been removed from featured servers.`
                        )
                ]
            });
        }

        // =================================================
        // /BLACKLIST
        // =================================================

        if (interaction.commandName === "blacklist") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            if (!data.blacklisted.includes(name)) {
                data.blacklisted.push(name);
            }

            saveData();

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Server Blacklisted")
                        .setDescription(
                            `**${name}** has been blacklisted.`
                        )
                ]
            });
        }

        // =================================================
        // /UNBLACKLIST
        // =================================================

        if (interaction.commandName === "unblacklist") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            data.blacklisted =
                data.blacklisted.filter(
                    server => server !== name
                );

            saveData();

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Blacklist Removed")
                        .setDescription(
                            `**${name}** has been removed from the blacklist.`
                        )
                ]
            });
        }

        // =================================================
        // /STATS
        // =================================================

        if (interaction.commandName === "stats") {

            const advertisements =
                Object.values(data.advertisements);

            const approved =
                advertisements.filter(
                    ad => ad.status === "Approved"
                ).length;

            const pending =
                advertisements.filter(
                    ad => ad.status === "Pending"
                ).length;

            const declined =
                advertisements.filter(
                    ad => ad.status === "Declined"
                ).length;

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Statistics")
                        .addFields(
                            {
                                name: "Total",
                                value: `${advertisements.length}`,
                                inline: true
                            },
                            {
                                name: "Approved",
                                value: `${approved}`,
                                inline: true
                            },
                            {
                                name: "Pending",
                                value: `${pending}`,
                                inline: true
                            },
                            {
                                name: "Declined",
                                value: `${declined}`,
                                inline: true
                            },
                            {
                                name: "Featured",
                                value: `${data.featured.length}`,
                                inline: true
                            },
                            {
                                name: "Blacklisted",
                                value: `${data.blacklisted.length}`,
                                inline: true
                            }
                        )
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        // =================================================
        // /ANNOUNCE
        // =================================================

        if (interaction.commandName === "announce") {

            const message =
                interaction.options.getString("message");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Announcement")
                        .setDescription(message)
                        .setFooter({
                            text: "ServerSpot"
                        })
                ]
            });
        }

        // =================================================
        // /BROWSE
        // =================================================

        if (interaction.commandName === "browse") {

            const results =
                Object.values(data.advertisements)
                    .filter(
                        ad => ad.status === "Approved"
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "There are currently no approved advertisements.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const list =
                results
                    .slice(0, 10)
                    .map(
                        ad =>
                            `**${ad.name}**\n${ad.category} • [Join Server](${ad.invite})`
                    )
                    .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Listings")
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // /SEARCH
        // =================================================

        if (interaction.commandName === "search") {

            const query =
                interaction.options
                    .getString("query")
                    .toLowerCase();

            const results =
                Object.values(data.advertisements)
                    .filter(
                        ad =>
                            ad.status === "Approved" &&
                            (
                                ad.name.toLowerCase().includes(query) ||
                                ad.description.toLowerCase().includes(query) ||
                                ad.category.toLowerCase().includes(query)
                            )
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "No matching servers were found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const list =
                results
                    .slice(0, 10)
                    .map(
                        ad =>
                            `**${ad.name}**\n${ad.category} • [Join Server](${ad.invite})`
                    )
                    .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Search Results")
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // /SERVER
        // =================================================

        if (interaction.commandName === "server") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                Object.values(data.advertisements)
                    .find(
                        ad =>
                            ad.status === "Approved" &&
                            ad.name.toLowerCase() === name
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle(ad.name)
                        .setDescription(ad.description)
                        .addFields(
                            {
                                name: "Category",
                                value: ad.category,
                                inline: true
                            },
                            {
                                name: "Discord",
                                value: `[Join Server](${ad.invite})`,
                                inline: true
                            },
                            {
                                name: "Group",
                                value: `[View Group](${ad.group})`,
                                inline: true
                            }
                        )
                ]
            });
        }

        // =================================================
        // /FEATURED
        // =================================================

        if (interaction.commandName === "featured") {

            const results =
                data.featured
                    .map(id => data.advertisements[id])
                    .filter(
                        ad =>
                            ad &&
                            ad.status === "Approved"
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "There are currently no featured servers.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const list =
                results
                    .map(
                        ad =>
                            `**${ad.name}**\n${ad.description}\n[Join Server](${ad.invite})`
                    )
                    .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("Featured Servers")
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // /CATEGORIES
        // =================================================

        if (interaction.commandName === "categories") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Categories")
                        .setDescription(
                            "Gaming\n" +
                            "Social\n" +
                            "Roleplay\n" +
                            "Education\n" +
                            "Technology\n" +
                            "Entertainment\n" +
                            "Community\n" +
                            "Other"
                        )
                ]
            });
        }

        // =================================================
        // /ABOUT
        // =================================================

        if (interaction.commandName === "about") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("About ServerSpot")
                        .setDescription(
                            "ServerSpot helps people discover new Discord communities and gives server owners a place to showcase their servers.\n\n" +
                            "**Discover. Advertise. Connect.**"
                        )
                ]
            });
        }

        // =================================================
        // /RULES
        // =================================================

        if (interaction.commandName === "rules") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Guidelines")
                        .setDescription(
                            "**1. Respect others**\n" +
                            "Treat members, server owners and staff with respect.\n\n" +

                            "**2. Keep content appropriate**\n" +
                            "Inappropriate or harmful content is not permitted.\n\n" +

                            "**3. No discrimination**\n" +
                            "Discriminatory behaviour and hate speech are not allowed.\n\n" +

                            "**4. No spam or abuse**\n" +
                            "Do not spam, manipulate advertisements or abuse ServerSpot systems.\n\n" +

                            "**5. Follow Discord's rules**\n" +
                            "All users and advertised servers must follow Discord's Terms of Service and Community Guidelines."
                        )
                ]
            });
        }

        // =================================================
        // /HELP
        // =================================================

        if (interaction.commandName === "help") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle("ServerSpot Commands")
                        .setDescription(
                            "**User Commands**\n\n" +
                            "`/advertise` — Submit a server advertisement\n" +
                            "`/browse` — Browse approved servers\n" +
                            "`/search` — Search servers\n" +
                            "`/server` — View a server\n" +
                            "`/featured` — View featured servers\n" +
                            "`/categories` — View categories\n" +
                            "`/help` — View commands\n" +
                            "`/rules` — View guidelines\n" +
                            "`/about` — About ServerSpot\n\n" +

                            "**Staff Commands**\n\n" +
                            "`/setup` — Configure ServerSpot\n" +
                            "`/review` — View pending advertisements\n" +
                            "`/remove` — Remove an advertisement\n" +
                            "`/feature` — Feature a server\n" +
                            "`/unfeature` — Remove featured status\n" +
                            "`/blacklist` — Blacklist a server\n" +
                            "`/unblacklist` — Remove a blacklist\n" +
                            "`/stats` — View statistics\n" +
                            "`/announce` — Send an announcement"
                        )
                ],
                flags: MessageFlags.Ephemeral
            });
        }

    } catch (error) {

        console.error("Interaction error:", error);

        try {

            if (
                interaction.isRepliable() &&
                !interaction.replied &&
                !interaction.deferred
            ) {
                await interaction.reply({
                    content:
                        "Something went wrong while processing this request.",
                    flags: MessageFlags.Ephemeral
                });
            } else if (
                interaction.deferred &&
                !interaction.replied
            ) {
                await interaction.editReply(
                    "Something went wrong while processing this request."
                );
            }

        } catch (replyError) {
            console.error(
                "Could not send error response:",
                replyError
            );
        }
    }
});

// =====================================================
// DISCORD ERROR HANDLING
// =====================================================

client.on("error", error => {
    console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
