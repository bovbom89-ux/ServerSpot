const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("Missing TOKEN or CLIENT_ID environment variable.");
    process.exit(1);
}

// ======================================================
// DATA
// ======================================================

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "servers.json");
const configFile = path.join(dataDir, "config.json");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }

        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error(`Failed to load ${file}:`, error);
        return fallback;
    }
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let servers = loadJSON(dataFile, []);
let config = loadJSON(configFile, {
    setupChannel: null,
    announcementChannel: null,
    ticketCategory: null,
    ticketLogs: null,
    ticketSupportChannel: null,
    staffRole: null
});

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel
    ]
});

// ======================================================
// COMMANDS
// ======================================================

const commands = [

    // ---------------- PUBLIC ----------------

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit your server to ServerSpot.")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("The name of your server.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("description")
                .setDescription("Describe your server.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("invite")
                .setDescription("Your Discord invite.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("category")
                .setDescription("Choose a category.")
                .setRequired(true)
                .addChoices(
                    { name: "Gaming", value: "gaming" },
                    { name: "Community", value: "community" },
                    { name: "Technology", value: "technology" },
                    { name: "Entertainment", value: "entertainment" },
                    { name: "Education", value: "education" },
                    { name: "Other", value: "other" }
                )
        ),

    new SlashCommandBuilder()
        .setName("browse")
        .setDescription("Browse servers listed on ServerSpot."),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search for a ServerSpot listing.")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("Server name or keyword.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("View a ServerSpot listing.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("The ServerSpot listing ID.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("featured")
        .setDescription("View featured ServerSpot servers."),

    new SlashCommandBuilder()
        .setName("categories")
        .setDescription("Browse ServerSpot categories."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View the ServerSpot help centre."),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View the ServerSpot rules."),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn more about ServerSpot."),

    // ---------------- STAFF ----------------

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot channels.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("ticketsetup")
        .setDescription("Configure the ServerSpot ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View ServerSpot statistics.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("announce")
        .setDescription("Send a ServerSpot announcement.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Announcement message.")
                .setRequired(true)
        )
].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        console.log("Registering ServerSpot commands...");

        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
        } else {
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
        }

        console.log(`Registered ${commands.length} commands.`);
    } catch (error) {
        console.error("Command registration failed:", error);
    }
}

// ======================================================
// EMBED HELPERS
// ======================================================

function createServerEmbed(server) {
    return new EmbedBuilder()
        .setTitle(server.name)
        .setDescription(server.description)
        .addFields(
            {
                name: "Category",
                value: server.category,
                inline: true
            },
            {
                name: "Listing ID",
                value: server.id,
                inline: true
            },
            {
                name: "Advertiser",
                value: `<@${server.owner}>`,
                inline: true
            }
        )
        .setTimestamp();
}

function createInviteButton(invite) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Join Server")
            .setStyle(ButtonStyle.Link)
            .setURL(invite)
    );
}

// ======================================================
// READY
// ======================================================

client.once("ready", () => {
    console.log("--------------------------------");
    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(`Servers listed: ${servers.length}`);
    console.log("--------------------------------");

    client.user.setActivity("/help | ServerSpot", {
        type: 0
    });
});

// ======================================================
// INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {

    // ==================================================
    // SLASH COMMANDS
    // ==================================================

    if (interaction.isChatInputCommand()) {

        // ----------------------------------------------
        // ADVERTISE
        // ----------------------------------------------

        if (interaction.commandName === "advertise") {

            const name = interaction.options.getString("name");
            const description = interaction.options.getString("description");
            const invite = interaction.options.getString("invite");
            const category = interaction.options.getString("category");

            const id = Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase();

            const newServer = {
                id,
                name,
                description,
                invite,
                category,
                owner: interaction.user.id,
                featured: false,
                createdAt: Date.now()
            };

            servers.push(newServer);
            saveJSON(dataFile, servers);

            const embed = new EmbedBuilder()
                .setTitle("Server Advertised")
                .setDescription(
                    `Your server has been successfully added to ServerSpot.`
                )
                .addFields(
                    {
                        name: "Server",
                        value: name,
                        inline: true
                    },
                    {
                        name: "Category",
                        value: category,
                        inline: true
                    },
                    {
                        name: "Listing ID",
                        value: id,
                        inline: true
                    }
                );

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ----------------------------------------------
        // BROWSE
        // ----------------------------------------------

        if (interaction.commandName === "browse") {

            if (servers.length === 0) {
                return interaction.reply({
                    content: "There are currently no servers listed on ServerSpot.",
                    ephemeral: true
                });
            }

            const pageSize = 5;
            const displayed = servers.slice(0, pageSize);

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot — Browse")
                .setDescription(
                    displayed
                        .map(server =>
                            `**${server.name}**\n${server.description}\nCategory: \`${server.category}\` • ID: \`${server.id}\``
                        )
                        .join("\n\n")
                )
                .setFooter({
                    text: `${servers.length} server(s) listed`
                });

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ----------------------------------------------
        // SEARCH
        // ----------------------------------------------

        if (interaction.commandName === "search") {

            const query = interaction.options
                .getString("query")
                .toLowerCase();

            const results = servers.filter(server =>
                server.name.toLowerCase().includes(query) ||
                server.description.toLowerCase().includes(query) ||
                server.category.toLowerCase().includes(query)
            );

            if (results.length === 0) {
                return interaction.reply({
                    content: `No servers were found for **${query}**.`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Search Results: ${query}`)
                .setDescription(
                    results
                        .slice(0, 10)
                        .map(server =>
                            `**${server.name}**\n${server.description}\nID: \`${server.id}\``
                        )
                        .join("\n\n")
                );

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ----------------------------------------------
        // SERVER
        // ----------------------------------------------

        if (interaction.commandName === "server") {

            const id = interaction.options.getString("id");

            const server = servers.find(
                server => server.id.toLowerCase() === id.toLowerCase()
            );

            if (!server) {
                return interaction.reply({
                    content: "That ServerSpot listing could not be found.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [createServerEmbed(server)],
                components: [createInviteButton(server.invite)]
            });
        }

        // ----------------------------------------------
        // FEATURED
        // ----------------------------------------------

        if (interaction.commandName === "featured") {

            const featured = servers.filter(server => server.featured);

            if (featured.length === 0) {
                return interaction.reply({
                    content: "There are currently no featured servers.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot — Featured")
                .setDescription(
                    featured
                        .map(server =>
                            `**${server.name}**\n${server.description}\nID: \`${server.id}\``
                        )
                        .join("\n\n")
                );

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ----------------------------------------------
        // CATEGORIES
        // ----------------------------------------------

        if (interaction.commandName === "categories") {

            const categories = [
                ["Gaming", "gaming"],
                ["Community", "community"],
                ["Technology", "technology"],
                ["Entertainment", "entertainment"],
                ["Education", "education"],
                ["Other", "other"]
            ];

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot — Categories")
                .setDescription(
                    categories
                        .map(([name, value]) => {
                            const count = servers.filter(
                                server => server.category === value
                            ).length;

                            return `**${name}** — ${count} server(s)`;
                        })
                        .join("\n")
                );

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ----------------------------------------------
        // HELP
        // ----------------------------------------------

        if (interaction.commandName === "help") {

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot Help Centre")
                .setDescription("Here are the available ServerSpot commands.")
                .addFields(
                    {
                        name: "Public",
                        value:
                            "`/advertise`\n" +
                            "`/browse`\n" +
                            "`/search`\n" +
                            "`/server`\n" +
                            "`/featured`\n" +
                            "`/categories`\n" +
                            "`/help`\n" +
                            "`/rules`\n" +
                            "`/about`"
                    },
                    {
                        name: "Staff",
                        value:
                            "`/setup`\n" +
                            "`/ticketsetup`\n" +
                            "`/stats`\n" +
                            "`/announce`"
                    }
                );

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ----------------------------------------------
        // RULES
        // ----------------------------------------------

        if (interaction.commandName === "rules") {

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot Rules")
                .setDescription(
                    "**1.** Only advertise legitimate Discord servers.\n\n" +
                    "**2.** Do not submit scams, malicious servers or illegal content.\n\n" +
                    "**3.** Do not spam advertisements.\n\n" +
                    "**4.** ServerSpot staff reserve the right to remove listings.\n\n" +
                    "**5.** Do not abuse the ticket system.\n\n" +
                    "**6.** Follow Discord's Terms of Service and Community Guidelines."
                );

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ----------------------------------------------
        // ABOUT
        // ----------------------------------------------

        if (interaction.commandName === "about") {

            const embed = new EmbedBuilder()
                .setTitle("About ServerSpot")
                .setDescription(
                    "ServerSpot is a Discord server discovery platform designed to help communities advertise, discover and grow."
                )
                .addFields(
                    {
                        name: "Listed Servers",
                        value: `${servers.length}`,
                        inline: true
                    },
                    {
                        name: "Commands",
                        value: `${commands.length}`,
                        inline: true
                    }
                );

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ==================================================
        // STAFF SETUP
        // ==================================================

        if (interaction.commandName === "setup") {

            if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: "You need **Manage Server** permission to use this command.",
                    ephemeral: true
                });
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId("setup_channel_select")
                .setPlaceholder("Select the ServerSpot channel type")
                .addOptions(
                    {
                        label: "Setup Channel",
                        value: "setupChannel",
                        description: "Channel used for ServerSpot setup."
                    },
                    {
                        label: "Announcement Channel",
                        value: "announcementChannel",
                        description: "Channel used for ServerSpot announcements."
                    }
                );

            return interaction.reply({
                content: "Choose which ServerSpot channel you want to configure.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ],
                ephemeral: true
            });
        }

        // ==================================================
        // TICKET SETUP
        // ==================================================

        if (interaction.commandName === "ticketsetup") {

            if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: "You need **Manage Server** permission to use this command.",
                    ephemeral: true
                });
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId("ticket_setup_select")
                .setPlaceholder("Select a ticket setting")
                .addOptions(
                    {
                        label: "Ticket Category",
                        value: "ticketCategory"
                    },
                    {
                        label: "Ticket Logs",
                        value: "ticketLogs"
                    },
                    {
                        label: "Support Channel",
                        value: "ticketSupportChannel"
                    },
                    {
                        label: "Staff Role",
                        value: "staffRole"
                    }
                );

            return interaction.reply({
                content: "Select the ticket system setting you want to configure.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ],
                ephemeral: true
            });
        }

        // ==================================================
        // STATS
        // ==================================================

        if (interaction.commandName === "stats") {

            if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: "You need **Manage Server** permission to use this command.",
                    ephemeral: true
                });
            }

            const featured = servers.filter(server => server.featured).length;

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot Statistics")
                .addFields(
                    {
                        name: "Total Listings",
                        value: `${servers.length}`,
                        inline: true
                    },
                    {
                        name: "Featured",
                        value: `${featured}`,
                        inline: true
                    },
                    {
                        name: "Categories",
                        value: "6",
                        inline: true
                    }
                );

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ==================================================
        // ANNOUNCE
        // ==================================================

        if (interaction.commandName === "announce") {

            if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: "You need **Manage Server** permission to use this command.",
                    ephemeral: true
                });
            }

            const message = interaction.options.getString("message");

            if (!config.announcementChannel) {
                return interaction.reply({
                    content: "No announcement channel has been configured. Use `/setup` first.",
                    ephemeral: true
                });
            }

            const channel = interaction.guild.channels.cache.get(
                config.announcementChannel
            );

            if (!channel) {
                return interaction.reply({
                    content: "The configured announcement channel no longer exists.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot Announcement")
                .setDescription(message)
                .setFooter({
                    text: `Posted by ${interaction.user.tag}`
                })
                .setTimestamp();

            await channel.send({
                embeds: [embed]
            });

            return interaction.reply({
                content: "Announcement sent successfully.",
                ephemeral: true
            });
        }
    }

    // ==================================================
    // SETUP SELECT MENU
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "setup_channel_select"
    ) {

        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: "You need **Manage Server** permission.",
                ephemeral: true
            });
        }

        const setting = interaction.values[0];

        const channels = interaction.guild.channels.cache.filter(channel =>
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.GuildAnnouncement
        );

        if (channels.size === 0) {
            return interaction.reply({
                content: "No text or announcement channels were found.",
                ephemeral: true
            });
        }

        const options = channels
            .first(25)
            .map(channel => ({
                label: channel.name.substring(0, 100),
                value: channel.id,
                description:
                    channel.type === ChannelType.GuildAnnouncement
                        ? "Announcement Channel"
                        : "Text Channel"
            }));

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`select_setup_channel_${setting}`)
            .setPlaceholder("Select a channel")
            .addOptions(options);

        return interaction.update({
            content: "Select the channel you want to use.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ]
        });
    }

    // ==================================================
    // SETUP CHANNEL SELECTION
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("select_setup_channel_")
    ) {

        const setting = interaction.customId.replace(
            "select_setup_channel_",
            ""
        );

        const channelId = interaction.values[0];

        config[setting] = channelId;
        saveJSON(configFile, config);

        return interaction.update({
            content: `Successfully configured **${setting}**.`,
            components: []
        });
    }

    // ==================================================
    // TICKET SETUP SELECT
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "ticket_setup_select"
    ) {

        const setting = interaction.values[0];

        if (
            setting === "ticketCategory"
        ) {

            const categories = interaction.guild.channels.cache
                .filter(channel =>
                    channel.type === ChannelType.GuildCategory
                )
                .first(25);

            if (!categories.length) {
                return interaction.update({
                    content: "No category channels were found.",
                    components: []
                });
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId("ticket_category_select")
                .setPlaceholder("Select ticket category")
                .addOptions(
                    categories.map(category => ({
                        label: category.name.substring(0, 100),
                        value: category.id
                    }))
                );

            return interaction.update({
                content: "Select the category where tickets should be created.",
                components: [
                    new ActionRowBuilder().addComponents(menu)
                ]
            });
        }

        const channels = interaction.guild.channels.cache
            .filter(channel =>
                channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildAnnouncement
            )
            .first(25);

        if (!channels.length) {
            return interaction.update({
                content: "No suitable channels were found.",
                components: []
            });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`ticket_setting_${setting}`)
            .setPlaceholder("Select a channel")
            .addOptions(
                channels.map(channel => ({
                    label: channel.name.substring(0, 100),
                    value: channel.id
                }))
            );

        return interaction.update({
            content: "Select the channel.",
            components: [
                new ActionRowBuilder().addComponents(menu)
            ]
        });
    }

    // ==================================================
    // TICKET CATEGORY
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "ticket_category_select"
    ) {

        config.ticketCategory = interaction.values[0];
        saveJSON(configFile, config);

        return interaction.update({
            content: "Ticket category configured successfully.",
            components: []
        });
    }

    // ==================================================
    // OTHER TICKET SETTINGS
    // ==================================================

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("ticket_setting_")
    ) {

        const setting = interaction.customId.replace(
            "ticket_setting_",
            ""
        );

        config[setting] = interaction.values[0];
        saveJSON(configFile, config);

        return interaction.update({
            content: `Ticket **${setting}** configured successfully.`,
            components: []
        });
    }

    // ==================================================
    // BUTTONS
    // ==================================================

    if (interaction.isButton()) {

        // ----------------------------------------------
        // CLOSE TICKET
        // ----------------------------------------------

        if (interaction.customId === "close_ticket") {

            const channel = interaction.channel;

            await interaction.reply({
                content: "Closing this ticket...",
                ephemeral: true
            });

            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error("Failed to delete ticket:", error);
                }
            }, 3000);

            return;
        }

        // ----------------------------------------------
        // CREATE TICKET
        // ----------------------------------------------

        if (interaction.customId === "create_ticket") {

            if (!config.ticketCategory) {
                return interaction.reply({
                    content: "The ticket system has not been configured yet.",
                    ephemeral: true
                });
            }

            const existing = interaction.guild.channels.cache.find(
                channel =>
                    channel.name === `ticket-${interaction.user.id}`
            );

            if (existing) {
                return interaction.reply({
                    content: `You already have an open ticket: ${existing}`,
                    ephemeral: true
                });
            }

            const permissionOverwrites = [
                {
                    id: interaction.guild.id,
                    deny: [
                        PermissionFlagsBits.ViewChannel
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ];

            if (config.staffRole) {
                permissionOverwrites.push({
                    id: config.staffRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                });
            }

            const ticketChannel =
                await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .substring(0, 90),
                    type: ChannelType.GuildText,
                    parent: config.ticketCategory,
                    permissionOverwrites
                });

            const closeButton = new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger);

            const embed = new EmbedBuilder()
                .setTitle("ServerSpot Support")
                .setDescription(
                    `Welcome ${interaction.user}.\n\n` +
                    "A member of the ServerSpot team will assist you shortly."
                )
                .setTimestamp();

            await ticketChannel.send({
                content: `${interaction.user}`,
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(closeButton)
                ]
            });

            return interaction.reply({
                content: `Your ticket has been created: ${ticketChannel}`,
                ephemeral: true
            });
        }
    }
});

// ======================================================
// LOGIN
// ======================================================

(async () => {
    await registerCommands();
    await client.login(TOKEN);
})();
