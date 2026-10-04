const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    SlashCommandBuilder,
    REST,
    Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ TOKEN or CLIENT_ID is missing.");
    process.exit(1);
}

// =====================================================
// DATABASE
// =====================================================

const dataFolder = path.join(__dirname, "data");

if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

const serversFile = path.join(dataFolder, "servers.json");
const configFile = path.join(dataFolder, "config.json");
const ticketsFile = path.join(dataFolder, "tickets.json");

function load(file, fallback) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
        return fallback;
    }

    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let servers = load(serversFile, []);

let config = load(configFile, {
    setupChannel: null,
    announcementChannel: null,

    ticketCategory: null,
    ticketLogs: null,
    ticketSupportChannel: null,
    staffRole: null,

    ticketPanelMessage: null
});

let tickets = load(ticketsFile, {
    counter: 0,
    open: {}
});

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =====================================================
// COMMANDS
// =====================================================

const commands = [

    // PUBLIC
    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server to ServerSpot.")
        .addStringOption(o =>
            o.setName("name")
                .setDescription("Your server name.")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("description")
                .setDescription("Describe your server.")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("invite")
                .setDescription("Discord invite link.")
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName("category")
                .setDescription("Server category.")
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
        .setDescription("Browse ServerSpot listings."),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search ServerSpot listings.")
        .addStringOption(o =>
            o.setName("query")
                .setDescription("Search query.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("View a ServerSpot listing.")
        .addStringOption(o =>
            o.setName("id")
                .setDescription("Listing ID.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("featured")
        .setDescription("View featured servers."),

    new SlashCommandBuilder()
        .setName("categories")
        .setDescription("Browse server categories."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View the ServerSpot help centre."),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View the ServerSpot rules."),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn about ServerSpot."),

    // STAFF
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
        .addStringOption(o =>
            o.setName("message")
                .setDescription("Announcement content.")
                .setRequired(true)
        )

].map(command => command.toJSON());

// =====================================================
// COMMAND REGISTRATION
// =====================================================

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        console.log("🔄 Registering ServerSpot commands...");

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

        console.log(`✅ Registered ${commands.length} commands.`);
    } catch (error) {
        console.error("❌ Command registration error:", error);
    }
}

// =====================================================
// PERMISSION HELPERS
// =====================================================

function isStaff(interaction) {
    return interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
    );
}

function isTicketStaff(member) {
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return true;
    }

    if (
        config.staffRole &&
        member.roles.cache.has(config.staffRole)
    ) {
        return true;
    }

    return false;
}

// =====================================================
// TICKET PANEL
// =====================================================

function ticketPanelEmbed() {
    return new EmbedBuilder()
        .setTitle("ServerSpot Support")
        .setDescription(
            "Need help with ServerSpot?\n\n" +
            "Click the button below to open a private support ticket. " +
            "Please provide as much information as possible so our team can help you quickly."
        )
        .addFields(
            {
                name: "General Support",
                value: "Questions or general assistance."
            },
            {
                name: "Advertisement Support",
                value: "Help with your ServerSpot listing."
            },
            {
                name: "Partnerships",
                value: "Partnership and collaboration enquiries."
            },
            {
                name: "Applications",
                value: "Questions about applications."
            }
        )
        .setFooter({
            text: "ServerSpot Support"
        });
}

function ticketPanelButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_create")
            .setLabel("Create Ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
    );
}

// =====================================================
// TICKET CONTROLS
// =====================================================

function ticketControls() {
    return new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("ticket_claim")
            .setLabel("Claim")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("ticket_add")
            .setLabel("Add User")
            .setEmoji("➕")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("ticket_remove")
            .setLabel("Remove User")
            .setEmoji("➖")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("ticket_rename")
            .setLabel("Rename")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Close")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)

    );
}

// =====================================================
// TICKET NUMBER
// =====================================================

function getNextTicketNumber() {
    tickets.counter++;
    save(ticketsFile, tickets);

    return String(tickets.counter).padStart(4, "0");
}

// =====================================================
// TRANSCRIPT
// =====================================================

async function createTranscript(channel) {

    let messages = [];
    let lastId;

    try {
        while (true) {

            const batch = await channel.messages.fetch({
                limit: 100,
                before: lastId
            });

            if (batch.size === 0) break;

            messages.push(...batch.values());

            lastId = batch.last().id;

            if (batch.size < 100) break;

            if (messages.length >= 1000) break;
        }
    } catch (error) {
        console.error("Transcript error:", error);
    }

    messages.reverse();

    let output = "";

    output += `ServerSpot Ticket Transcript\n`;
    output += `Channel: ${channel.name}\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `${"=".repeat(60)}\n\n`;

    for (const message of messages) {

        const timestamp = message.createdAt.toISOString();

        let content = message.content || "";

        if (message.attachments.size > 0) {
            content += " " +
                [...message.attachments.values()]
                    .map(a => a.url)
                    .join(" ");
        }

        output += `[${timestamp}] ${message.author.tag}: ${content}\n`;
    }

    return output;
}

// =====================================================
// CREATE TICKET
// =====================================================

async function createTicket(interaction) {

    if (!config.ticketCategory) {
        return interaction.reply({
            content:
                "❌ The ticket system hasn't been configured yet. A staff member needs to run `/ticketsetup`.",
            ephemeral: true
        });
    }

    const existing = Object.values(tickets.open).find(
        ticket =>
            ticket.guildId === interaction.guild.id &&
            ticket.userId === interaction.user.id
    );

    if (existing) {

        const existingChannel =
            interaction.guild.channels.cache.get(existing.channelId);

        if (existingChannel) {
            return interaction.reply({
                content:
                    `❌ You already have an open ticket: ${existingChannel}`,
                ephemeral: true
            });
        }

        delete tickets.open[existing.ticketId];
        save(ticketsFile, tickets);
    }

    const ticketNumber = getNextTicketNumber();

    const ticketId = `SS-${ticketNumber}`;

    const channelName =
        `ticket-${ticketNumber}`;

    const permissions = [

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
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },

        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        }

    ];

    if (config.staffRole) {
        permissions.push({
            id: config.staffRole,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        });
    }

    const channel =
        await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            topic:
                `ServerSpot Ticket ${ticketId} | Opened by ${interaction.user.tag}`,
            permissionOverwrites: permissions
        });

    tickets.open[ticketId] = {
        ticketId,
        channelId: channel.id,
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        claimedBy: null,
        createdAt: Date.now()
    };

    save(ticketsFile, tickets);

    const embed = new EmbedBuilder()
        .setTitle(`ServerSpot Ticket ${ticketId}`)
        .setDescription(
            `Welcome ${interaction.user}!\n\n` +
            "Thank you for contacting ServerSpot Support.\n\n" +
            "Please explain your issue clearly and provide any relevant information. " +
            "A member of our team will assist you as soon as possible."
        )
        .addFields(
            {
                name: "Ticket Owner",
                value: `${interaction.user}`,
                inline: true
            },
            {
                name: "Ticket Number",
                value: ticketId,
                inline: true
            },
            {
                name: "Status",
                value: "🟢 Open",
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot Support"
        })
        .setTimestamp();

    await channel.send({
        content: `${interaction.user}${config.staffRole ? ` <@&${config.staffRole}>` : ""}`,
        embeds: [embed],
        components: [ticketControls()]
    });

    await interaction.reply({
        content: `✅ Your ticket has been created: ${channel}`,
        ephemeral: true
    });
}

// =====================================================
// CLOSE TICKET
// =====================================================

async function closeTicket(interaction) {

    const ticketEntry = Object.entries(tickets.open)
        .find(([, ticket]) =>
            ticket.channelId === interaction.channel.id
        );

    if (!ticketEntry) {
        return interaction.reply({
            content: "❌ This isn't a ServerSpot ticket.",
            ephemeral: true
        });
    }

    const [ticketId, ticket] = ticketEntry;

    if (!isTicketStaff(interaction.member)) {
        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({
                content:
                    "❌ Only the ticket owner or ServerSpot staff can close this ticket.",
                ephemeral: true
            });
        }
    }

    await interaction.reply({
        content: "🔒 Closing ticket and generating transcript..."
    });

    const transcript = await createTranscript(
        interaction.channel
    );

    if (config.ticketLogs) {

        const logChannel =
            interaction.guild.channels.cache.get(
                config.ticketLogs
            );

        if (logChannel) {

            const logEmbed = new EmbedBuilder()
                .setTitle(`Ticket Closed — ${ticketId}`)
                .addFields(
                    {
                        name: "Ticket Owner",
                        value: `<@${ticket.userId}>`,
                        inline: true
                    },
                    {
                        name: "Closed By",
                        value: `${interaction.user}`,
                        inline: true
                    },
                    {
                        name: "Claimed By",
                        value: ticket.claimedBy
                            ? `<@${ticket.claimedBy}>`
                            : "Unclaimed",
                        inline: true
                    }
                )
                .setTimestamp();

            const buffer = Buffer.from(
                transcript,
                "utf8"
            );

            await logChannel.send({
                embeds: [logEmbed],
                files: [
                    {
                        attachment: buffer,
                        name: `${ticketId}-transcript.txt`
                    }
                ]
            });
        }
    }

    delete tickets.open[ticketId];
    save(ticketsFile, tickets);

    setTimeout(async () => {
        try {
            await interaction.channel.delete(
                `ServerSpot ticket ${ticketId} closed by ${interaction.user.tag}`
            );
        } catch (error) {
            console.error("Ticket deletion error:", error);
        }
    }, 3000);
}

// =====================================================
// INTERACTIONS
// =====================================================

client.on("interactionCreate", async interaction => {

    // =================================================
    // SLASH COMMANDS
    // =================================================

    if (interaction.isChatInputCommand()) {

        // ---------------------------------------------
        // ADVERTISE
        // ---------------------------------------------

        if (interaction.commandName === "advertise") {

            const name =
                interaction.options.getString("name");

            const description =
                interaction.options.getString("description");

            const invite =
                interaction.options.getString("invite");

            const category =
                interaction.options.getString("category");

            const id =
                Math.random()
                    .toString(36)
                    .substring(2, 8)
                    .toUpperCase();

            servers.push({
                id,
                name,
                description,
                invite,
                category,
                owner: interaction.user.id,
                featured: false,
                createdAt: Date.now()
            });

            save(serversFile, servers);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("✅ Server Advertised")
                        .setDescription(
                            "Your server has been submitted to ServerSpot."
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
                        )
                ],
                ephemeral: true
            });
        }

        // ---------------------------------------------
        // BROWSE
        // ---------------------------------------------

        if (interaction.commandName === "browse") {

            if (!servers.length) {
                return interaction.reply(
                    "There are currently no servers listed."
                );
            }

            const list =
                servers
                    .slice(0, 10)
                    .map(server =>
                        `**${server.name}**\n${server.description}\nCategory: \`${server.category}\` • ID: \`${server.id}\``
                    )
                    .join("\n\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot — Browse")
                        .setDescription(list)
                        .setFooter({
                            text: `${servers.length} server(s) listed`
                        })
                ]
            });
        }

        // ---------------------------------------------
        // SEARCH
        // ---------------------------------------------

        if (interaction.commandName === "search") {

            const query =
                interaction.options
                    .getString("query")
                    .toLowerCase();

            const results =
                servers.filter(server =>
                    server.name.toLowerCase().includes(query) ||
                    server.description.toLowerCase().includes(query) ||
                    server.category.toLowerCase().includes(query)
                );

            if (!results.length) {
                return interaction.reply({
                    content:
                        `No ServerSpot listings matched **${query}**.`,
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Search Results — ${query}`)
                        .setDescription(
                            results
                                .slice(0, 10)
                                .map(server =>
                                    `**${server.name}**\n${server.description}\nID: \`${server.id}\``
                                )
                                .join("\n\n")
                        )
                ]
            });
        }

        // ---------------------------------------------
        // SERVER
        // ---------------------------------------------

        if (interaction.commandName === "server") {

            const id =
                interaction.options.getString("id");

            const server =
                servers.find(
                    s => s.id.toLowerCase() === id.toLowerCase()
                );

            if (!server) {
                return interaction.reply({
                    content: "❌ Listing not found.",
                    ephemeral: true
                });
            }

            const button =
                new ButtonBuilder()
                    .setLabel("Join Server")
                    .setStyle(ButtonStyle.Link)
                    .setURL(server.invite);

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
                                name: "Listing ID",
                                value: server.id,
                                inline: true
                            }
                        )
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(button)
                ]
            });
        }

        // ---------------------------------------------
        // FEATURED
        // ---------------------------------------------

        if (interaction.commandName === "featured") {

            const featured =
                servers.filter(s => s.featured);

            if (!featured.length) {
                return interaction.reply(
                    "There are currently no featured servers."
                );
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot — Featured")
                        .setDescription(
                            featured
                                .map(s =>
                                    `**${s.name}**\n${s.description}\nID: \`${s.id}\``
                                )
                                .join("\n\n")
                        )
                ]
            });
        }

        // ---------------------------------------------
        // CATEGORIES
        // ---------------------------------------------

        if (interaction.commandName === "categories") {

            const categories = [
                ["Gaming", "gaming"],
                ["Community", "community"],
                ["Technology", "technology"],
                ["Entertainment", "entertainment"],
                ["Education", "education"],
                ["Other", "other"]
            ];

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Categories")
                        .setDescription(
                            categories.map(([name, value]) => {
                                const count =
                                    servers.filter(
                                        s => s.category === value
                                    ).length;

                                return `**${name}** — ${count} server(s)`;
                            }).join("\n")
                        )
                ]
            });
        }

        // ---------------------------------------------
        // HELP
        // ---------------------------------------------

        if (interaction.commandName === "help") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Help Centre")
                        .addFields(
                            {
                                name: "Public Commands",
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
                                name: "Staff Commands",
                                value:
                                    "`/setup`\n" +
                                    "`/ticketsetup`\n" +
                                    "`/stats`\n" +
                                    "`/announce`"
                            }
                        )
                ],
                ephemeral: true
            });
        }

        // ---------------------------------------------
        // RULES
        // ---------------------------------------------

        if (interaction.commandName === "rules") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Rules")
                        .setDescription(
                            "**1.** Do not advertise malicious or illegal servers.\n\n" +
                            "**2.** Do not submit scams or deceptive listings.\n\n" +
                            "**3.** Do not spam ServerSpot.\n\n" +
                            "**4.** Do not abuse the support system.\n\n" +
                            "**5.** Staff decisions must be respected.\n\n" +
                            "**6.** Follow Discord's Terms of Service and Community Guidelines."
                        )
                ]
            });
        }

        // ---------------------------------------------
        // ABOUT
        // ---------------------------------------------

        if (interaction.commandName === "about") {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("About ServerSpot")
                        .setDescription(
                            "ServerSpot is a Discord server discovery platform designed to help communities advertise and grow."
                        )
                        .addFields({
                            name: "Servers Listed",
                            value: `${servers.length}`,
                            inline: true
                        })
                ]
            });
        }

        // ---------------------------------------------
        // SETUP
        // ---------------------------------------------

        if (interaction.commandName === "setup") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "❌ You need Manage Server permission.",
                    ephemeral: true
                });
            }

            const channels =
                interaction.guild.channels.cache.filter(channel =>
                    channel.type === ChannelType.GuildText ||
                    channel.type === ChannelType.GuildAnnouncement
                );

            const options =
                channels
                    .first(25)
                    .map(channel => ({
                        label: channel.name.substring(0, 100),
                        value: channel.id,
                        description:
                            channel.type === ChannelType.GuildAnnouncement
                                ? "Announcement Channel"
                                : "Text Channel"
                    }));

            const menu =
                new StringSelectMenuBuilder()
                    .setCustomId("setup_select")
                    .setPlaceholder("Select a setting")
                    .addOptions(
                        {
                            label: "Announcement Channel",
                            value: "announcementChannel"
                        },
                        {
                            label: "ServerSpot Setup Channel",
                            value: "setupChannel"
                        }
                    );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Setup")
                        .setDescription(
                            "Select the setting you want to configure."
                        )
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(menu)
                ],
                ephemeral: true
            });
        }

        // ---------------------------------------------
        // TICKET SETUP
        // ---------------------------------------------

        if (interaction.commandName === "ticketsetup") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "❌ You need Manage Server permission.",
                    ephemeral: true
                });
            }

            const menu =
                new StringSelectMenuBuilder()
                    .setCustomId("ticket_setup")
                    .setPlaceholder("Select a ticket setting")
                    .addOptions(
                        {
                            label: "Ticket Category",
                            value: "category"
                        },
                        {
                            label: "Ticket Logs",
                            value: "logs"
                        },
                        {
                            label: "Staff Role",
                            value: "staff"
                        },
                        {
                            label: "Support Channel",
                            value: "support"
                        },
                        {
                            label: "Post Ticket Panel",
                            value: "panel"
                        }
                    );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Ticket Setup")
                        .setDescription(
                            "Configure the complete ServerSpot ticket system."
                        )
                ],
                components: [
                    new ActionRowBuilder()
                        .addComponents(menu)
                ],
                ephemeral: true
            });
        }

        // ---------------------------------------------
        // STATS
        // ---------------------------------------------

        if (interaction.commandName === "stats") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "❌ You need Manage Server permission.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Statistics")
                        .addFields(
                            {
                                name: "Listed Servers",
                                value: `${servers.length}`,
                                inline: true
                            },
                            {
                                name: "Open Tickets",
                                value: `${Object.keys(tickets.open).length}`,
                                inline: true
                            },
                            {
                                name: "Tickets Created",
                                value: `${tickets.counter}`,
                                inline: true
                            }
                        )
                ],
                ephemeral: true
            });
        }

        // ---------------------------------------------
        // ANNOUNCE
        // ---------------------------------------------

        if (interaction.commandName === "announce") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content: "❌ You need Manage Server permission.",
                    ephemeral: true
                });
            }

            if (!config.announcementChannel) {
                return interaction.reply({
                    content:
                        "❌ Configure the announcement channel with `/setup` first.",
                    ephemeral: true
                });
            }

            const channel =
                interaction.guild.channels.cache.get(
                    config.announcementChannel
                );

            if (!channel) {
                return interaction.reply({
                    content:
                        "❌ The configured announcement channel no longer exists.",
                    ephemeral: true
                });
            }

            const message =
                interaction.options.getString("message");

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("ServerSpot Announcement")
                        .setDescription(message)
                        .setTimestamp()
                ]
            });

            return interaction.reply({
                content: "✅ Announcement sent.",
                ephemeral: true
            });
        }
    }

    // =================================================
    // BUTTONS
    // =================================================

    if (interaction.isButton()) {

        // CREATE
        if (interaction.customId === "ticket_create") {
            return createTicket(interaction);
        }

        // CLAIM
        if (interaction.customId === "ticket_claim") {

            const ticket =
                Object.values(tickets.open)
                    .find(t =>
                        t.channelId === interaction.channel.id
                    );

            if (!ticket) return;

            if (!isTicketStaff(interaction.member)) {
                return interaction.reply({
                    content:
                        "❌ Only ServerSpot staff can claim tickets.",
                    ephemeral: true
                });
            }

            if (ticket.claimedBy) {
                return interaction.reply({
                    content:
                        `❌ This ticket is already claimed by <@${ticket.claimedBy}>.`,
                    ephemeral: true
                });
            }

            ticket.claimedBy = interaction.user.id;
            save(ticketsFile, tickets);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            `👤 **${interaction.user}** has claimed this ticket.`
                        )
                ]
            });
        }

        // CLOSE
        if (interaction.customId === "ticket_close") {
            return closeTicket(interaction);
        }

        // ADD
        if (interaction.customId === "ticket_add") {

            if (!isTicketStaff(interaction.member)) {
                return interaction.reply({
                    content:
                        "❌ Only ServerSpot staff can add users.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "Use the following format to add a user:\n`@user`",
                ephemeral: true
            });
        }

        // REMOVE
        if (interaction.customId === "ticket_remove") {

            if (!isTicketStaff(interaction.member)) {
                return interaction.reply({
                    content:
                        "❌ Only ServerSpot staff can remove users.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "Mention the user you want to remove from the ticket.",
                ephemeral: true
            });
        }

        // RENAME
        if (interaction.customId === "ticket_rename") {

            if (!isTicketStaff(interaction.member)) {
                return interaction.reply({
                    content:
                        "❌ Only ServerSpot staff can rename tickets.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "Send the new ticket name in this channel.",
                ephemeral: true
            });
        }
    }

    // =================================================
    // SELECT MENUS
    // =================================================

    if (interaction.isStringSelectMenu()) {

        // ---------------------------------------------
        // MAIN SETUP
        // ---------------------------------------------

        if (interaction.customId === "setup_select") {

            const setting = interaction.values[0];

            const channels =
                interaction.guild.channels.cache.filter(channel =>
                    channel.type === ChannelType.GuildText ||
                    channel.type === ChannelType.GuildAnnouncement
                );

            const options =
                channels
                    .first(25)
                    .map(channel => ({
                        label: channel.name.substring(0, 100),
                        value: channel.id,
                        description:
                            channel.type === ChannelType.GuildAnnouncement
                                ? "Announcement Channel"
                                : "Text Channel"
                    }));

            const menu =
                new StringSelectMenuBuilder()
                    .setCustomId(`setup_channel_${setting}`)
                    .setPlaceholder("Select a channel")
                    .addOptions(options);

            return interaction.update({
                content: "Select the channel you want to use.",
                embeds: [],
                components: [
                    new ActionRowBuilder()
                        .addComponents(menu)
                ]
            });
        }

        // ---------------------------------------------
        // MAIN SETUP CHANNEL
        // ---------------------------------------------

        if (
            interaction.customId.startsWith("setup_channel_")
        ) {

            const setting =
                interaction.customId.replace(
                    "setup_channel_",
                    ""
                );

            config[setting] = interaction.values[0];

            save(configFile, config);

            return interaction.update({
                content:
                    `✅ **${setting}** has been configured successfully.`,
                components: []
            });
        }

        // ---------------------------------------------
        // TICKET SETUP
        // ---------------------------------------------

        if (interaction.customId === "ticket_setup") {

            const setting = interaction.values[0];

            // CATEGORY
            if (setting === "category") {

                const categories =
                    interaction.guild.channels.cache
                        .filter(c =>
                            c.type === ChannelType.GuildCategory
                        )
                        .first(25);

                if (!categories.length) {
                    return interaction.update({
                        content: "❌ No categories found.",
                        components: []
                    });
                }

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId("ticket_category")
                        .setPlaceholder("Select ticket category")
                        .addOptions(
                            categories.map(c => ({
                                label: c.name.substring(0, 100),
                                value: c.id
                            }))
                        );

                return interaction.update({
                    content:
                        "Select the category where tickets should be created.",
                    components: [
                        new ActionRowBuilder()
                            .addComponents(menu)
                    ]
                });
            }

            // CHANNEL SETTINGS
            if (
                setting === "logs" ||
                setting === "support"
            ) {

                const channels =
                    interaction.guild.channels.cache
                        .filter(c =>
                            c.type === ChannelType.GuildText ||
                            c.type === ChannelType.GuildAnnouncement
                        )
                        .first(25);

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `ticket_channel_${setting}`
                        )
                        .setPlaceholder("Select a channel")
                        .addOptions(
                            channels.map(c => ({
                                label: c.name.substring(0, 100),
                                value: c.id
                            }))
                        );

                return interaction.update({
                    content: "Select a channel.",
                    components: [
                        new ActionRowBuilder()
                            .addComponents(menu)
                    ]
                });
            }

            // STAFF ROLE
            if (setting === "staff") {

                const roles =
                    interaction.guild.roles.cache
                        .filter(r =>
                            r.id !== interaction.guild.id
                        )
                        .first(25);

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId("ticket_staff")
                        .setPlaceholder("Select staff role")
                        .addOptions(
                            roles.map(r => ({
                                label: r.name.substring(0, 100),
                                value: r.id
                            }))
                        );

                return interaction.update({
                    content:
                        "Select the role that should have ticket access.",
                    components: [
                        new ActionRowBuilder()
                            .addComponents(menu)
                    ]
                });
            }

            // PANEL
            if (setting === "panel") {

                const channels =
                    interaction.guild.channels.cache
                        .filter(c =>
                            c.type === ChannelType.GuildText ||
                            c.type === ChannelType.GuildAnnouncement
                        )
                        .first(25);

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId("ticket_panel_channel")
                        .setPlaceholder("Select panel channel")
                        .addOptions(
                            channels.map(c => ({
                                label: c.name.substring(0, 100),
                                value: c.id
                            }))
                        );

                return interaction.update({
                    content:
                        "Select where the ticket panel should be posted.",
                    components: [
                        new ActionRowBuilder()
                            .addComponents(menu)
                    ]
                });
            }
        }

        // ---------------------------------------------
        // CATEGORY
        // ---------------------------------------------

        if (interaction.customId === "ticket_category") {

            config.ticketCategory =
                interaction.values[0];

            save(configFile, config);

            return interaction.update({
                content:
                    "✅ Ticket category configured.",
                components: []
            });
        }

        // ---------------------------------------------
        // CHANNEL
        // ---------------------------------------------

        if (
            interaction.customId.startsWith(
                "ticket_channel_"
            )
        ) {

            const setting =
                interaction.customId.replace(
                    "ticket_channel_",
                    ""
                );

            if (setting === "logs") {
                config.ticketLogs =
                    interaction.values[0];
            }

            if (setting === "support") {
                config.ticketSupportChannel =
                    interaction.values[0];
            }

            save(configFile, config);

            return interaction.update({
                content:
                    `✅ Ticket ${setting} channel configured.`,
                components: []
            });
        }

        // ---------------------------------------------
        // STAFF
        // ---------------------------------------------

        if (interaction.customId === "ticket_staff") {

            config.staffRole =
                interaction.values[0];

            save(configFile, config);

            return interaction.update({
                content:
                    "✅ Ticket staff role configured.",
                components: []
            });
        }

        // ---------------------------------------------
        // PANEL
        // ---------------------------------------------

        if (
            interaction.customId ===
            "ticket_panel_channel"
        ) {

            const channel =
                interaction.guild.channels.cache.get(
                    interaction.values[0]
                );

            if (!channel) {
                return interaction.update({
                    content:
                        "❌ Channel not found.",
                    components: []
                });
            }

            const message =
                await channel.send({
                    embeds: [
                        ticketPanelEmbed()
                    ],
                    components: [
                        ticketPanelButtons()
                    ]
                });

            config.ticketSupportChannel =
                channel.id;

            config.ticketPanelMessage =
                message.id;

            save(configFile, config);

            return interaction.update({
                content:
                    `✅ Ticket panel posted in ${channel}.`,
                components: []
            });
        }
    }
});

// =====================================================
// ERROR HANDLING
// =====================================================

process.on("unhandledRejection", error => {
    console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

// =====================================================
// START
// =====================================================

(async () => {

    await registerCommands();

    await client.login(TOKEN);

})();
