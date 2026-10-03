const {
    Client,
    GatewayIntentBits,
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
    ChannelType
} = require("discord.js");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
    console.error("Missing TOKEN environment variable.");
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error("Missing CLIENT_ID environment variable.");
    process.exit(1);
}

const COLOR = 0xE00000;

// Server configurations
const configurations = new Map();

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ============================================================
// COMMANDS
// ============================================================

const commands = [
    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Open the ServerSpot setup panel.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server advertisement."),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about this server."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands.")
].map(command => command.toJSON());

// ============================================================
// COMMAND REGISTRATION
// ============================================================

async function registerCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(TOKEN);

        console.log("Registering ServerSpot commands...");

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

// ============================================================
// READY
// ============================================================

client.once("clientReady", async () => {
    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} server(s).`);

    await registerCommands();

    client.user.setActivity("Discord communities", {
        type: 3
    });
});

// ============================================================
// SAFE RESPONSE
// ============================================================

async function safeReply(interaction, data) {
    try {
        if (interaction.replied) {
            return await interaction.followUp(data);
        }

        if (interaction.deferred) {
            return await interaction.editReply(data);
        }

        return await interaction.reply(data);
    } catch (error) {
        console.error("Interaction response failed:", error);
    }
}

// ============================================================
// SETUP PANEL
// ============================================================

async function openSetupPanel(interaction) {
    if (
        !interaction.memberPermissions ||
        !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
        return safeReply(interaction, {
            content: "You need the **Manage Server** permission to configure ServerSpot.",
            ephemeral: true
        });
    }

    const existing = configurations.get(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("ServerSpot Setup")
        .setDescription(
            "Configure the channels ServerSpot will use.\n\n" +
            "Use the selectors below to choose where advertisement submissions are reviewed and where approved servers are published."
        )
        .addFields(
            {
                name: "Advertisement Logs",
                value: existing?.logsChannelId
                    ? `<#${existing.logsChannelId}>`
                    : "Not configured",
                inline: true
            },
            {
                name: "Featured Servers",
                value: existing?.featuredChannelId
                    ? `<#${existing.featuredChannelId}>`
                    : "Not configured",
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Setup Panel"
        })
        .setTimestamp();

    const logsSelector = new ChannelSelectMenuBuilder()
        .setCustomId("serverspot_setup_logs")
        .setPlaceholder("Select advertisement logs channel")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

    const featuredSelector = new ChannelSelectMenuBuilder()
        .setCustomId("serverspot_setup_featured")
        .setPlaceholder("Select featured servers channel")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

    const saveButton = new ButtonBuilder()
        .setCustomId("serverspot_setup_save")
        .setLabel("Save Setup")
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId("serverspot_setup_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary);

    return safeReply(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(logsSelector),
            new ActionRowBuilder().addComponents(featuredSelector),
            new ActionRowBuilder().addComponents(
                saveButton,
                cancelButton
            )
        ],
        ephemeral: true
    });
}

// ============================================================
// SETUP SELECTORS
// ============================================================

async function handleSetupSelector(interaction) {
    if (
        !interaction.memberPermissions ||
        !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
        return safeReply(interaction, {
            content: "You do not have permission to configure ServerSpot.",
            ephemeral: true
        });
    }

    const selectedChannel = interaction.values[0];

    let setup = configurations.get(interaction.guild.id) || {};

    if (interaction.customId === "serverspot_setup_logs") {
        setup.pendingLogsChannelId = selectedChannel;
    }

    if (interaction.customId === "serverspot_setup_featured") {
        setup.pendingFeaturedChannelId = selectedChannel;
    }

    configurations.set(interaction.guild.id, setup);

    const logsChannel =
        setup.pendingLogsChannelId ||
        setup.logsChannelId;

    const featuredChannel =
        setup.pendingFeaturedChannelId ||
        setup.featuredChannelId;

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("ServerSpot Setup")
        .setDescription(
            "Your channel selections have been updated. Review them below and press **Save Setup** when you're ready."
        )
        .addFields(
            {
                name: "Advertisement Logs",
                value: logsChannel
                    ? `<#${logsChannel}>`
                    : "Not selected",
                inline: true
            },
            {
                name: "Featured Servers",
                value: featuredChannel
                    ? `<#${featuredChannel}>`
                    : "Not selected",
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Setup Panel"
        })
        .setTimestamp();

    const logsSelector = new ChannelSelectMenuBuilder()
        .setCustomId("serverspot_setup_logs")
        .setPlaceholder("Select advertisement logs channel")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

    const featuredSelector = new ChannelSelectMenuBuilder()
        .setCustomId("serverspot_setup_featured")
        .setPlaceholder("Select featured servers channel")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1);

    const saveButton = new ButtonBuilder()
        .setCustomId("serverspot_setup_save")
        .setLabel("Save Setup")
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId("serverspot_setup_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary);

    return interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(logsSelector),
            new ActionRowBuilder().addComponents(featuredSelector),
            new ActionRowBuilder().addComponents(
                saveButton,
                cancelButton
            )
        ]
    });
}

// ============================================================
// SAVE SETUP
// ============================================================

async function saveSetup(interaction) {
    const setup = configurations.get(interaction.guild.id);

    if (!setup?.pendingLogsChannelId || !setup?.pendingFeaturedChannelId) {
        return safeReply(interaction, {
            content:
                "Please select **both** an Advertisement Logs channel and a Featured Servers channel before saving.",
            ephemeral: true
        });
    }

    const logsChannel = await interaction.guild.channels
        .fetch(setup.pendingLogsChannelId)
        .catch(() => null);

    const featuredChannel = await interaction.guild.channels
        .fetch(setup.pendingFeaturedChannelId)
        .catch(() => null);

    if (!logsChannel || !featuredChannel) {
        return safeReply(interaction, {
            content:
                "One or more selected channels could not be found. Please select them again.",
            ephemeral: true
        });
    }

    if (!logsChannel.isTextBased() || !featuredChannel.isTextBased()) {
        return safeReply(interaction, {
            content:
                "Both selected channels must be text-based channels.",
            ephemeral: true
        });
    }

    configurations.set(interaction.guild.id, {
        logsChannelId: logsChannel.id,
        featuredChannelId: featuredChannel.id
    });

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle("ServerSpot Setup Complete")
        .setDescription(
            "ServerSpot has been successfully configured."
        )
        .addFields(
            {
                name: "Advertisement Logs",
                value: `<#${logsChannel.id}>`,
                inline: true
            },
            {
                name: "Featured Servers",
                value: `<#${featuredChannel.id}>`,
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Configuration saved"
        })
        .setTimestamp();

    return interaction.update({
        embeds: [embed],
        components: []
    });
}

// ============================================================
// ADVERTISE MODAL
// ============================================================

async function showAdvertiseModal(interaction) {
    const config = configurations.get(interaction.guild.id);

    if (!config?.logsChannelId || !config?.featuredChannelId) {
        return safeReply(interaction, {
            content:
                "ServerSpot has not been configured yet. Please ask a server administrator to run `/setup`.",
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId("serverspot_advertise_modal")
        .setTitle("Submit Server Advertisement");

    const inviteInput = new TextInputBuilder()
        .setCustomId("server_invite")
        .setLabel("Discord Invite Link")
        .setPlaceholder("https://discord.gg/example")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const groupInput = new TextInputBuilder()
        .setCustomId("group_link")
        .setLabel("Group / Website Link")
        .setPlaceholder("https://example.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(300);

    const descriptionInput = new TextInputBuilder()
        .setCustomId("server_description")
        .setLabel("Server Description")
        .setPlaceholder("Tell people about your community...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const imageInput = new TextInputBuilder()
        .setCustomId("server_image")
        .setLabel("Server Image URL")
        .setPlaceholder("https://example.com/image.png")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

    const statusInput = new TextInputBuilder()
        .setCustomId("server_status")
        .setLabel("Server Status")
        .setPlaceholder("Open • Active • Recruiting")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(
        new ActionRowBuilder().addComponents(inviteInput),
        new ActionRowBuilder().addComponents(groupInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(statusInput)
    );

    return interaction.showModal(modal);
}

// ============================================================
// VALIDATION
// ============================================================

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function isDiscordInvite(value) {
    return (
        value.startsWith("https://discord.gg/") ||
        value.startsWith("https://discord.com/invite/") ||
        value.startsWith("http://discord.gg/") ||
        value.startsWith("http://discord.com/invite/")
    );
}

// ============================================================
// ADVERTISEMENT SUBMISSION
// ============================================================

async function handleAdvertisement(interaction) {
    const config = configurations.get(interaction.guild.id);

    if (!config?.logsChannelId || !config?.featuredChannelId) {
        return safeReply(interaction, {
            content:
                "ServerSpot has not been configured yet. Please ask an administrator to run `/setup`.",
            ephemeral: true
        });
    }

    const invite = interaction.fields
        .getTextInputValue("server_invite")
        .trim();

    const groupLink = interaction.fields
        .getTextInputValue("group_link")
        .trim();

    const description = interaction.fields
        .getTextInputValue("server_description")
        .trim();

    const image = interaction.fields
        .getTextInputValue("server_image")
        .trim();

    const status = interaction.fields
        .getTextInputValue("server_status")
        .trim();

    if (!isDiscordInvite(invite)) {
        return safeReply(interaction, {
            content:
                "Please provide a valid Discord invite link.",
            ephemeral: true
        });
    }

    if (!isValidUrl(groupLink)) {
        return safeReply(interaction, {
            content:
                "Please provide a valid group or website link.",
            ephemeral: true
        });
    }

    if (image && !isValidUrl(image)) {
        return safeReply(interaction, {
            content:
                "The image URL you provided is not valid.",
            ephemeral: true
        });
    }

    const logsChannel = await interaction.guild.channels
        .fetch(config.logsChannelId)
        .catch(() => null);

    if (!logsChannel || !logsChannel.isTextBased()) {
        return safeReply(interaction, {
            content:
                "The Advertisement Logs channel could not be found. Please run `/setup` again.",
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("New Server Advertisement")
        .setDescription(description)
        .addFields(
            {
                name: "Submitted By",
                value: `${interaction.user}\n\`${interaction.user.id}\``,
                inline: false
            },
            {
                name: "Status",
                value: status,
                inline: true
            },
            {
                name: "Discord Invite",
                value: `[Join Server](${invite})`,
                inline: true
            },
            {
                name: "Group / Website",
                value: `[Open Link](${groupLink})`,
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Awaiting review"
        })
        .setTimestamp();

    if (image) {
        embed.setThumbnail(image);
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("serverspot_accept")
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("serverspot_decline")
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger)
    );

    const message = await logsChannel.send({
        embeds: [embed],
        components: [buttons]
    });

    configurations.set(
        `${interaction.guild.id}:${message.id}`,
        {
            invite,
            groupLink,
            description,
            image,
            status,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            reviewMessageId: message.id
        }
    );

    return safeReply(interaction, {
        content:
            "Your advertisement has been submitted for staff review.",
        ephemeral: true
    });
}

// ============================================================
// REVIEW BUTTONS
// ============================================================

async function handleReview(interaction) {
    if (
        !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
        )
    ) {
        return safeReply(interaction, {
            content:
                "You do not have permission to review advertisements.",
            ephemeral: true
        });
    }

    const key =
        `${interaction.guild.id}:${interaction.message.id}`;

    const submission = configurations.get(key);

    if (!submission) {
        return safeReply(interaction, {
            content:
                "This advertisement could not be found. It may have expired after the bot restarted.",
            ephemeral: true
        });
    }

    // --------------------------------------------------------
    // DECLINE
    // --------------------------------------------------------

    if (interaction.customId === "serverspot_decline") {
        const embed = EmbedBuilder.from(
            interaction.message.embeds[0]
        )
            .setColor(0x555555)
            .setFooter({
                text: `ServerSpot • Declined by ${interaction.user.tag}`
            })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });

        const user = await client.users
            .fetch(submission.userId)
            .catch(() => null);

        if (user) {
            await user.send(
                `Your ServerSpot advertisement in **${interaction.guild.name}** was declined by the staff team.`
            ).catch(() => {});
        }

        configurations.delete(key);

        return;
    }

    // --------------------------------------------------------
    // ACCEPT
    // --------------------------------------------------------

    if (interaction.customId === "serverspot_accept") {
        const config = configurations.get(interaction.guild.id);

        const featuredChannel = await interaction.guild.channels
            .fetch(config.featuredChannelId)
            .catch(() => null);

        if (!featuredChannel || !featuredChannel.isTextBased()) {
            return safeReply(interaction, {
                content:
                    "The Featured Servers channel could not be found. Please run `/setup` again.",
                ephemeral: true
            });
        }

        const guild = interaction.guild;

        const serverIcon = guild.iconURL({
            size: 1024,
            extension: "png"
        });

        const featuredEmbed = new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(guild.name)
            .setDescription(submission.description)
            .addFields(
                {
                    name: "Status",
                    value: submission.status,
                    inline: true
                },
                {
                    name: "Members",
                    value: guild.memberCount.toLocaleString(),
                    inline: true
                },
                {
                    name: "Invite",
                    value: `[Join Server](${submission.invite})`,
                    inline: true
                },
                {
                    name: "Group / Website",
                    value: `[Open Link](${submission.groupLink})`,
                    inline: true
                }
            )
            .setFooter({
                text: "ServerSpot • Featured Server"
            })
            .setTimestamp();

        if (submission.image) {
            featuredEmbed.setThumbnail(submission.image);
        } else if (serverIcon) {
            featuredEmbed.setThumbnail(serverIcon);
        }

        await featuredChannel.send({
            embeds: [featuredEmbed]
        });

        const approvedEmbed = EmbedBuilder.from(
            interaction.message.embeds[0]
        )
            .setColor(0x2ECC71)
            .setFooter({
                text: `ServerSpot • Approved by ${interaction.user.tag}`
            })
            .setTimestamp();

        await interaction.update({
            embeds: [approvedEmbed],
            components: []
        });

        const user = await client.users
            .fetch(submission.userId)
            .catch(() => null);

        if (user) {
            await user.send(
                `Your ServerSpot advertisement for **${guild.name}** has been approved and published in Featured Servers.`
            ).catch(() => {});
        }

        configurations.delete(key);
    }
}

// ============================================================
// SERVER INFO
// ============================================================

async function serverInfo(interaction) {
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(`${guild.name} Information`)
        .setThumbnail(
            guild.iconURL({
                size: 512,
                extension: "png"
            })
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
                name: "Created",
                value: `<t:${Math.floor(
                    guild.createdTimestamp / 1000
                )}:D>`,
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot"
        })
        .setTimestamp();

    return safeReply(interaction, {
        embeds: [embed]
    });
}

// ============================================================
// HELP
// ============================================================

async function help(interaction) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("ServerSpot Commands")
        .setDescription(
            "Discover, advertise and connect with Discord communities."
        )
        .addFields(
            {
                name: "User Commands",
                value:
                    "`/advertise` — Submit a server advertisement\n" +
                    "`/serverinfo` — View server information\n" +
                    "`/help` — View available commands"
            },
            {
                name: "Staff Commands",
                value:
                    "`/setup` — Configure ServerSpot channels"
            }
        )
        .setFooter({
            text: "ServerSpot • Discover. Advertise. Connect."
        });

    return safeReply(interaction, {
        embeds: [embed],
        ephemeral: true
    });
}

// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
    try {

        // Slash commands
        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "setup") {
                return await openSetupPanel(interaction);
            }

            if (interaction.commandName === "advertise") {
                return await showAdvertiseModal(interaction);
            }

            if (interaction.commandName === "serverinfo") {
                return await serverInfo(interaction);
            }

            if (interaction.commandName === "help") {
                return await help(interaction);
            }
        }

        // Channel selectors
        if (interaction.isChannelSelectMenu()) {

            if (
                interaction.customId ===
                    "serverspot_setup_logs" ||
                interaction.customId ===
                    "serverspot_setup_featured"
            ) {
                return await handleSetupSelector(interaction);
            }
        }

        // Setup buttons
        if (interaction.isButton()) {

            if (
                interaction.customId ===
                "serverspot_setup_save"
            ) {
                return await saveSetup(interaction);
            }

            if (
                interaction.customId ===
                "serverspot_setup_cancel"
            ) {
                configurations.delete(
                    interaction.guild.id
                );

                return interaction.update({
                    content:
                        "ServerSpot setup cancelled.",
                    embeds: [],
                    components: []
                });
            }

            if (
                interaction.customId ===
                    "serverspot_accept" ||
                interaction.customId ===
                    "serverspot_decline"
            ) {
                return await handleReview(interaction);
            }
        }

        // Advertisement modal
        if (interaction.isModalSubmit()) {

            if (
                interaction.customId ===
                "serverspot_advertise_modal"
            ) {
                return await handleAdvertisement(interaction);
            }
        }

    } catch (error) {
        console.error(
            "Error while processing interaction:",
            error
        );

        await safeReply(interaction, {
            content:
                "Something went wrong while processing your request. Please try again.",
            ephemeral: true
        });
    }
});

// ============================================================
// ERROR PROTECTION
// ============================================================

process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
