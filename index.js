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
    ChannelType
} = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

// =====================================================
// TEMPORARY STORAGE
// =====================================================

const advertisements = new Map();
const blacklisted = new Set();
const featured = new Set();

const guildSettings = new Map();

// =====================================================
// COMMANDS
// =====================================================

const commands = [

    // USER COMMANDS

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server advertisement"),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search ServerSpot listings")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("What would you like to search for?")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("browse")
        .setDescription("Browse approved ServerSpot listings"),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("View a ServerSpot listing")
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
        .setDescription("View ServerSpot categories"),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn more about ServerSpot"),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View ServerSpot guidelines"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands"),

    // STAFF COMMANDS

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot channels")
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
        .setName("approve")
        .setDescription("Approve an advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("reject")
        .setDescription("Reject an advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("feature")
        .setDescription("Feature an approved server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unfeature")
        .setDescription("Remove a server from featured")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Server name")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a server advertisement")
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

function isValidUrl(value) {
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
// SETTINGS
// =====================================================

function getSettings(guildId) {
    return guildSettings.get(guildId);
}

// =====================================================
// REGISTER COMMANDS
// =====================================================

async function registerCommands() {

    try {

        console.log("Registering ServerSpot commands...");

        const rest = new REST({
            version: "10"
        }).setToken(token);

        await rest.put(
            Routes.applicationCommands(clientId),
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
// BOT READY
// =====================================================

client.once("ready", async () => {

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
        // ADVERTISE BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith("advertise_accept:")
        ) {

            if (!isStaff(interaction)) {

                return interaction.reply({
                    content: "You do not have permission to do this.",
                    ephemeral: true
                });

            }

            const id = interaction.customId.split(":")[1];

            const advertisement = advertisements.get(id);

            if (!advertisement) {

                return interaction.reply({
                    content: "This advertisement could not be found.",
                    ephemeral: true
                });

            }

            if (advertisement.status !== "Pending") {

                return interaction.reply({
                    content: "This advertisement has already been processed.",
                    ephemeral: true
                });

            }

            const settings = getSettings(interaction.guild.id);

            if (!settings) {

                return interaction.reply({
                    content:
                        "ServerSpot has not been configured yet. Use `/setup` first.",
                    ephemeral: true
                });

            }

            const advertisementChannel =
                interaction.guild.channels.cache.get(
                    settings.advertisementChannel
                );

            if (!advertisementChannel) {

                return interaction.reply({
                    content:
                        "The configured advertisement channel could not be found.",
                    ephemeral: true
                });

            }

            advertisement.status = "Approved";
            advertisement.approvedBy = interaction.user.id;

            featured.delete(id);

            const publicEmbed = new EmbedBuilder()
                .setTitle(advertisement.name)
                .setDescription(advertisement.description)
                .addFields(
                    {
                        name: "Category",
                        value: advertisement.category,
                        inline: true
                    },
                    {
                        name: "Discord",
                        value: `[Join Server](${advertisement.invite})`,
                        inline: true
                    },
                    {
                        name: "Group",
                        value: `[View Group](${advertisement.group})`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "ServerSpot • Discover. Advertise. Connect."
                })
                .setTimestamp();

            await advertisementChannel.send({
                embeds: [publicEmbed]
            });

            const updatedLog = new EmbedBuilder()
                .setTitle("Advertisement Approved")
                .setColor(0x57F287)
                .addFields(
                    {
                        name: "Server",
                        value: advertisement.name
                    },
                    {
                        name: "Submitted By",
                        value: `<@${advertisement.userId}>`
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
                embeds: [updatedLog],
                components: []
            });

            try {

                const user = await client.users.fetch(
                    advertisement.userId
                );

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Advertisement Approved")
                            .setDescription(
                                `Your ServerSpot advertisement for **${advertisement.name}** has been approved and published.`
                            )
                            .setColor(0x57F287)
                    ]
                });

            } catch {
                console.log(
                    "Could not DM advertiser."
                );
            }

            return interaction.reply({
                content: "Advertisement approved and published.",
                ephemeral: true
            });
        }

        // =================================================
        // DECLINE BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith("advertise_decline:")
        ) {

            if (!isStaff(interaction)) {

                return interaction.reply({
                    content: "You do not have permission to do this.",
                    ephemeral: true
                });

            }

            const id = interaction.customId.split(":")[1];

            const advertisement = advertisements.get(id);

            if (!advertisement) {

                return interaction.reply({
                    content: "This advertisement could not be found.",
                    ephemeral: true
                });

            }

            if (advertisement.status !== "Pending") {

                return interaction.reply({
                    content: "This advertisement has already been processed.",
                    ephemeral: true
                });

            }

            const modal = new ModalBuilder()
                .setCustomId(`decline_modal:${id}`)
                .setTitle("Decline Advertisement");

            const reason = new TextInputBuilder()
                .setCustomId("decline_reason")
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
            interaction.customId.startsWith("decline_modal:")
        ) {

            if (!isStaff(interaction)) {

                return interaction.reply({
                    content: "You do not have permission to do this.",
                    ephemeral: true
                });

            }

            const id = interaction.customId.split(":")[1];

            const advertisement = advertisements.get(id);

            if (!advertisement) {

                return interaction.reply({
                    content: "This advertisement could not be found.",
                    ephemeral: true
                });

            }

            const reason =
                interaction.fields.getTextInputValue(
                    "decline_reason"
                );

            advertisement.status = "Declined";
            advertisement.declinedBy = interaction.user.id;
            advertisement.declineReason = reason;

            const declinedEmbed = new EmbedBuilder()
                .setTitle("Advertisement Declined")
                .setColor(0xED4245)
                .addFields(
                    {
                        name: "Server",
                        value: advertisement.name
                    },
                    {
                        name: "Submitted By",
                        value: `<@${advertisement.userId}>`
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

                const user = await client.users.fetch(
                    advertisement.userId
                );

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Advertisement Declined")
                            .setDescription(
                                `Your ServerSpot advertisement for **${advertisement.name}** was declined.`
                            )
                            .addFields({
                                name: "Reason",
                                value: reason
                            })
                            .setColor(0xED4245)
                    ]
                });

            } catch {
                console.log(
                    "Could not DM advertiser."
                );
            }

            return interaction.reply({
                content: "Advertisement declined and the user has been notified.",
                ephemeral: true
            });
        }

        // =================================================
        // ADVERTISE COMMAND
        // =================================================

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === "advertise"
        ) {

            const modal = new ModalBuilder()
                .setCustomId("advertise_modal")
                .setTitle("ServerSpot Advertisement");

            const serverName = new TextInputBuilder()
                .setCustomId("server_name")
                .setLabel("Server Name")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Example Community")
                .setRequired(true)
                .setMaxLength(100);

            const invite = new TextInputBuilder()
                .setCustomId("server_invite")
                .setLabel("Discord Invite Link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://discord.gg/example")
                .setRequired(true)
                .setMaxLength(200);

            const group = new TextInputBuilder()
                .setCustomId("server_group")
                .setLabel("Group Link")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("https://example.com/group")
                .setRequired(true)
                .setMaxLength(300);

            const description = new TextInputBuilder()
                .setCustomId("server_description")
                .setLabel("Description")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Tell people about your community...")
                .setRequired(true)
                .setMaxLength(1000);

            const category = new TextInputBuilder()
                .setCustomId("server_category")
                .setLabel("Category")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Gaming, Social, Roleplay, Education...")
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(
                new ActionRowBuilder().addComponents(serverName),
                new ActionRowBuilder().addComponents(invite),
                new ActionRowBuilder().addComponents(group),
                new ActionRowBuilder().addComponents(description),
                new ActionRowBuilder().addComponents(category)
            );

            return interaction.showModal(modal);
        }

        // =================================================
        // ADVERTISEMENT FORM SUBMITTED
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "advertise_modal"
        ) {

            const serverName =
                interaction.fields.getTextInputValue(
                    "server_name"
                );

            const invite =
                interaction.fields.getTextInputValue(
                    "server_invite"
                );

            const group =
                interaction.fields.getTextInputValue(
                    "server_group"
                );

            const description =
                interaction.fields.getTextInputValue(
                    "server_description"
                );

            const category =
                interaction.fields.getTextInputValue(
                    "server_category"
                );

            if (!isValidUrl(invite) || !isValidUrl(group)) {

                return interaction.reply({
                    content:
                        "Please provide valid links for both the Discord invite and group.",
                    ephemeral: true
                });

            }

            const settings = getSettings(interaction.guild.id);

            if (!settings) {

                return interaction.reply({
                    content:
                        "ServerSpot has not been configured yet. Please ask a ServerSpot administrator to run `/setup`.",
                    ephemeral: true
                });

            }

            const key = `${interaction.guild.id}:${Date.now()}`;

            const advertisement = {
                id: key,
                serverName,
                name: serverName,
                invite,
                group,
                description,
                category,
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                status: "Pending",
                submittedAt: Date.now()
            };

            advertisements.set(key, advertisement);

            const logsChannel =
                interaction.guild.channels.cache.get(
                    settings.logsChannel
                );

            if (!logsChannel) {

                return interaction.reply({
                    content:
                        "The configured Advertisement Logs channel could not be found.",
                    ephemeral: true
                });

            }

            const logEmbed = new EmbedBuilder()
                .setTitle("New Advertisement Submission")
                .setColor(0x5865F2)
                .addFields(
                    {
                        name: "Server",
                        value: serverName,
                        inline: false
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
                        value: `[Open Invite](${invite})`,
                        inline: true
                    },
                    {
                        name: "Group",
                        value: `[Open Group](${group})`,
                        inline: true
                    },
                    {
                        name: "Description",
                        value: description,
                        inline: false
                    },
                    {
                        name: "Status",
                        value: "Pending Review",
                        inline: true
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
                            `advertise_accept:${key}`
                        )
                        .setLabel("Accept")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `advertise_decline:${key}`
                        )
                        .setLabel("Decline")
                        .setStyle(ButtonStyle.Danger)

                );

            await logsChannel.send({
                embeds: [logEmbed],
                components: [buttons]
            });

            return interaction.reply({
                content:
                    "Your advertisement has been submitted successfully and is now waiting for staff review.",
                ephemeral: true
            });
        }

        // =================================================
        // COMMANDS
        // =================================================

        if (!interaction.isChatInputCommand()) return;

        // =================================================
        // SETUP
        // =================================================

        if (interaction.commandName === "setup") {

            if (!isStaff(interaction)) {

                return interaction.reply({
                    content:
                        "You must be a Server Administrator to use this command.",
                    ephemeral: true
                });

            }

            const logs =
                interaction.options.getChannel("logs");

            const advertisementsChannel =
                interaction.options.getChannel("advertisements");

            guildSettings.set(
                interaction.guild.id,
                {
                    logsChannel: logs.id,
                    advertisementChannel:
                        advertisementsChannel.id
                }
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Setup Complete")
                        .setDescription(
                            "ServerSpot has been configured successfully."
                        )
                        .addFields(
                            {
                                name: "Advertisement Logs",
                                value: `${logs}`
                            },
                            {
                                name: "Advertisement Channel",
                                value: `${advertisementsChannel}`
                            }
                        )
                        .setColor(0x57F287)
                ],
                ephemeral: true
            });
        }

        // =================================================
        // HELP
        // =================================================

        if (interaction.commandName === "help") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Commands")
                        .setDescription(
                            "**User Commands**\n\n" +
                            "`/advertise` — Submit a server advertisement\n" +
                            "`/search` — Search listings\n" +
                            "`/browse` — Browse listings\n" +
                            "`/server` — View a listing\n" +
                            "`/featured` — View featured servers\n" +
                            "`/categories` — View categories\n" +
                            "`/about` — About ServerSpot\n" +
                            "`/rules` — ServerSpot guidelines\n" +
                            "`/help` — View commands\n\n" +

                            "**Staff Commands**\n\n" +
                            "`/setup` — Configure ServerSpot\n" +
                            "`/review` — Review pending advertisements\n" +
                            "`/approve` — Approve a listing\n" +
                            "`/reject` — Reject a listing\n" +
                            "`/feature` — Feature a server\n" +
                            "`/unfeature` — Remove featured status\n" +
                            "`/remove` — Remove a listing\n" +
                            "`/blacklist` — Blacklist a server\n" +
                            "`/unblacklist` — Remove a blacklist\n" +
                            "`/stats` — View statistics\n" +
                            "`/announce` — Send an announcement"
                        )
                        .setFooter({
                            text: "ServerSpot • Discover. Advertise. Connect."
                        })
                ],
                ephemeral: true
            });
        }

        // =================================================
        // ABOUT
        // =================================================

        if (interaction.commandName === "about") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("About ServerSpot")
                        .setDescription(
                            "ServerSpot is a platform designed to help people discover new Discord communities and give server owners a place to showcase their servers.\n\n" +
                            "Discover new communities, advertise your own server and connect with new members."
                        )
                ]
            });
        }

        // =================================================
        // RULES
        // =================================================

        if (interaction.commandName === "rules") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Guidelines")
                        .setDescription(
                            "**1. Respect others**\n" +
                            "Treat members, server owners and staff appropriately.\n\n" +

                            "**2. Keep it appropriate**\n" +
                            "Do not share explicit, excessively violent or inappropriate content.\n\n" +

                            "**3. No discrimination**\n" +
                            "Discrimination and hate speech are not permitted.\n\n" +

                            "**4. No spam or abuse**\n" +
                            "Do not spam, manipulate listings or abuse ServerSpot systems.\n\n" +

                            "**5. Follow Discord's rules**\n" +
                            "All users and advertised servers must follow Discord's Terms of Service and Community Guidelines."
                        )
                ]
            });
        }

        // =================================================
        // CATEGORIES
        // =================================================

        if (interaction.commandName === "categories") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
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
        // BROWSE
        // =================================================

        if (interaction.commandName === "browse") {

            const results = [...advertisements.values()]
                .filter(ad => ad.status === "Approved");

            if (results.length === 0) {

                return interaction.reply({
                    content:
                        "There are currently no approved server listings.",
                    ephemeral: true
                });

            }

            const list = results
                .slice(0, 10)
                .map(ad =>
                    `**${ad.name}**\n${ad.category} • [Join Server](${ad.invite})`
                )
                .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Listings")
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // SEARCH
        // =================================================

        if (interaction.commandName === "search") {

            const query =
                interaction.options
                    .getString("query")
                    .toLowerCase();

            const results = [...advertisements.values()]
                .filter(ad =>
                    ad.status === "Approved" &&
                    (
                        ad.name.toLowerCase().includes(query) ||
                        ad.description.toLowerCase().includes(query) ||
                        ad.category.toLowerCase().includes(query)
                    )
                );

            if (results.length === 0) {

                return interaction.reply({
                    content:
                        `No listings were found for **${query}**.`,
                    ephemeral: true
                });

            }

            const list = results
                .slice(0, 10)
                .map(ad =>
                    `**${ad.name}**\n${ad.category} • [Join Server](${ad.invite})`
                )
                .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Search Results: ${query}`)
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // SERVER
        // =================================================

        if (interaction.commandName === "server") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const server =
                [...advertisements.values()]
                    .find(ad =>
                        ad.status === "Approved" &&
                        ad.name.toLowerCase() === name
                    );

            if (!server) {

                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });

            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(server.name)
                        .setDescription(server.description)
                        .addFields(
                            {
                                name: "Category",
                                value: server.category,
                                inline: true
                            },
                            {
                                name: "Discord",
                                value: `[Join Server](${server.invite})`,
                                inline: true
                            },
                            {
                                name: "Group",
                                value: `[View Group](${server.group})`,
                                inline: true
                            }
                        )
                ]
            });
        }

        // =================================================
        // FEATURED
        // =================================================

        if (interaction.commandName === "featured") {

            const results = [...featured]
                .map(id => advertisements.get(id))
                .filter(ad =>
                    ad &&
                    ad.status === "Approved"
                );

            if (results.length === 0) {

                return interaction.reply({
                    content:
                        "There are currently no featured servers.",
                    ephemeral: true
                });

            }

            const list = results
                .map(ad =>
                    `**${ad.name}**\n${ad.description}\n[Join Server](${ad.invite})`
                )
                .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Featured Servers")
                        .setDescription(list)
                ]
            });
        }

        // =================================================
        // STAFF COMMAND CHECK
        // =================================================

        const staffCommands = [
            "review",
            "approve",
            "reject",
            "feature",
            "unfeature",
            "remove",
            "blacklist",
            "unblacklist",
            "stats",
            "announce"
        ];

        if (
            staffCommands.includes(
                interaction.commandName
            ) &&
            !isStaff(interaction)
        ) {

            return interaction.reply({
                content:
                    "You do not have permission to use this command.",
                ephemeral: true
            });
        }

        // =================================================
        // REVIEW
        // =================================================

        if (interaction.commandName === "review") {

            const pending =
                [...advertisements.values()]
                    .filter(ad =>
                        ad.status === "Pending"
                    );

            if (pending.length === 0) {

                return interaction.reply({
                    content:
                        "There are no pending advertisements.",
                    ephemeral: true
                });

            }

            const list = pending
                .map(ad =>
                    `**${ad.name}**\n` +
                    `Category: ${ad.category}\n` +
                    `Submitted by: <@${ad.userId}>\n`
                )
                .join("\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Pending Advertisements")
                        .setDescription(list)
                ],
                ephemeral: true
            });
        }

        // =================================================
        // APPROVE
        // =================================================

        if (interaction.commandName === "approve") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(ad =>
                        ad.name.toLowerCase() === name &&
                        ad.status === "Pending"
                    );

            if (!ad) {

                return interaction.reply({
                    content:
                        "No pending advertisement with that name was found.",
                    ephemeral: true
                });

            }

            ad.status = "Approved";

            return interaction.reply(
                `**${ad.name}** has been approved.`
            );
        }

        // =================================================
        // REJECT
        // =================================================

        if (interaction.commandName === "reject") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(ad =>
                        ad.name.toLowerCase() === name &&
                        ad.status === "Pending"
                    );

            if (!ad) {

                return interaction.reply({
                    content:
                        "No pending advertisement with that name was found.",
                    ephemeral: true
                });

            }

            ad.status = "Declined";

            return interaction.reply(
                `**${ad.name}** has been rejected.`
            );
        }

        // =================================================
        // FEATURE
        // =================================================

        if (interaction.commandName === "feature") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(ad =>
                        ad.name.toLowerCase() === name &&
                        ad.status === "Approved"
                    );

            if (!ad) {

                return interaction.reply({
                    content:
                        "That server must be approved first.",
                    ephemeral: true
                });

            }

            featured.add(ad.id);

            return interaction.reply(
                `**${ad.name}** is now featured.`
            );
        }

        // =================================================
        // UNFEATURE
        // =================================================

        if (interaction.commandName === "unfeature") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(ad =>
                        ad.name.toLowerCase() === name
                    );

            if (!ad) {

                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });

            }

            featured.delete(ad.id);

            return interaction.reply(
                `**${ad.name}** has been removed from featured.`
            );
        }

        // =================================================
        // REMOVE
        // =================================================

        if (interaction.commandName === "remove") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            const entries =
                [...advertisements.entries()]
                    .find(([id, ad]) =>
                        ad.name.toLowerCase() === name
                    );

            if (!entries) {

                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });

            }

            const [id, ad] = entries;

            advertisements.delete(id);
            featured.delete(id);

            return interaction.reply(
                `**${ad.name}** has been removed from ServerSpot.`
            );
        }

        // =================================================
        // BLACKLIST
        // =================================================

        if (interaction.commandName === "blacklist") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            blacklisted.add(name);

            return interaction.reply(
                `**${name}** has been blacklisted.`
            );
        }

        // =================================================
        // UNBLACKLIST
        // =================================================

        if (interaction.commandName === "unblacklist") {

            const name =
                interaction.options
                    .getString("name")
                    .toLowerCase();

            blacklisted.delete(name);

            return interaction.reply(
                `**${name}** has been removed from the blacklist.`
            );
        }

        // =================================================
        // STATS
        // =================================================

        if (interaction.commandName === "stats") {

            const total = advertisements.size;

            const approved =
                [...advertisements.values()]
                    .filter(ad =>
                        ad.status === "Approved"
                    ).length;

            const pending =
                [...advertisements.values()]
                    .filter(ad =>
                        ad.status === "Pending"
                    ).length;

            const declined =
                [...advertisements.values()]
                    .filter(ad =>
                        ad.status === "Declined"
                    ).length;

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Statistics")
                        .addFields(
                            {
                                name: "Total",
                                value: `${total}`,
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
                                value: `${featured.size}`,
                                inline: true
                            },
                            {
                                name: "Blacklisted",
                                value: `${blacklisted.size}`,
                                inline: true
                            }
                        )
                ],
                ephemeral: true
            });
        }

        // =================================================
        // ANNOUNCE
        // =================================================

        if (interaction.commandName === "announce") {

            const message =
                interaction.options
                    .getString("message");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Announcement")
                        .setDescription(message)
                        .setFooter({
                            text: "ServerSpot"
                        })
                ]
            });
        }

    } catch (error) {

        console.error("Interaction error:", error);

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.reply({
                content:
                    "Something went wrong while processing this request.",
                ephemeral: true
            });

        }

    }

});

// =====================================================
// START BOT
// =====================================================

if (!token || !clientId) {

    console.error(
        "DISCORD_TOKEN or CLIENT_ID is missing."
    );

    process.exit(1);
}

client.login(token);
