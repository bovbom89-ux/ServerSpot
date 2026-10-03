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
    ChannelType
} = require("discord.js");

// ============================================================
// SERVERSPOT
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

// In-memory configuration.
// For a permanent production database, replace this with a database.
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
        .setDescription("Configure ServerSpot for this server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option
                .setName("advertisement_logs")
                .setDescription("Channel where advertisement submissions are reviewed.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("featured_servers")
                .setDescription("Channel where approved advertisements are posted.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server advertisement to ServerSpot."),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about this ServerSpot server."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands.")

].map(command => command.toJSON());

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(TOKEN);

        console.log("Registering ServerSpot commands...");

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
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
// SETUP
// ============================================================

async function handleSetup(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: "You need the **Manage Server** permission to use this command.",
            ephemeral: true
        });
    }

    const logsChannel = interaction.options.getChannel("advertisement_logs");
    const featuredChannel = interaction.options.getChannel("featured_servers");

    configurations.set(interaction.guild.id, {
        logsChannelId: logsChannel.id,
        featuredChannelId: featuredChannel.id
    });

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("ServerSpot Configured")
        .setDescription(
            "ServerSpot has been successfully configured for this server."
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
            text: "ServerSpot"
        })
        .setTimestamp();

    return interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

// ============================================================
// ADVERTISE MODAL
// ============================================================

async function showAdvertiseModal(interaction) {
    const config = configurations.get(interaction.guild.id);

    if (!config) {
        return safeReply(
            interaction,
            {
                content:
                    "ServerSpot has not been configured yet. Please ask a server administrator to run `/setup`.",
                ephemeral: true
            }
        );
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
        .setPlaceholder("Tell people what makes your community worth joining...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const imageInput = new TextInputBuilder()
        .setCustomId("server_image")
        .setLabel("Server Image URL")
        .setPlaceholder("https://example.com/server-image.png")
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
// URL VALIDATION
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
// SAFE INTERACTION RESPONSE
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
// ADVERTISEMENT SUBMISSION
// ============================================================

async function handleAdvertisement(interaction) {
    const config = configurations.get(interaction.guild.id);

    if (!config) {
        return safeReply(interaction, {
            content:
                "ServerSpot has not been configured yet. Please ask a server administrator to run `/setup`.",
            ephemeral: true
        });
    }

    const invite = interaction.fields.getTextInputValue("server_invite").trim();
    const groupLink = interaction.fields.getTextInputValue("group_link").trim();
    const description = interaction.fields.getTextInputValue("server_description").trim();
    const image = interaction.fields.getTextInputValue("server_image").trim();
    const status = interaction.fields.getTextInputValue("server_status").trim();

    if (!isDiscordInvite(invite)) {
        return safeReply(interaction, {
            content:
                "That doesn't look like a valid Discord invite link.",
            ephemeral: true
        });
    }

    if (!isValidUrl(groupLink)) {
        return safeReply(interaction, {
            content:
                "The group / website link must be a valid URL.",
            ephemeral: true
        });
    }

    if (image && !isValidUrl(image)) {
        return safeReply(interaction, {
            content:
                "The image URL must be a valid URL.",
            ephemeral: true
        });
    }

    const logsChannel = await interaction.guild.channels
        .fetch(config.logsChannelId)
        .catch(() => null);

    if (!logsChannel || !logsChannel.isTextBased()) {
        return safeReply(interaction, {
            content:
                "The configured advertisement logs channel could not be found. Please ask staff to run `/setup` again.",
            ephemeral: true
        });
    }

    const memberCount = interaction.guild.memberCount;

    const reviewEmbed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("New Server Advertisement")
        .setDescription(description)
        .addFields(
            {
                name: "Submitted By",
                value: `${interaction.user} \`${interaction.user.id}\``,
                inline: false
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
            },
            {
                name: "Status",
                value: status,
                inline: true
            },
            {
                name: "Members",
                value: memberCount.toLocaleString(),
                inline: true
            }
        )
        .setFooter({
            text: "ServerSpot • Awaiting staff review"
        })
        .setTimestamp();

    if (image) {
        reviewEmbed.setThumbnail(image);
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
        embeds: [reviewEmbed],
        components: [buttons]
    });

    // Store the submission information on the message itself.
    // This avoids relying on a fragile temporary interaction.
    const submissionData = {
        invite,
        groupLink,
        description,
        image,
        status,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        reviewMessageId: message.id
    };

    // Store it in memory.
    configurations.set(
        `${interaction.guild.id}:${message.id}`,
        submissionData
    );

    await safeReply(interaction, {
        content:
            "Your advertisement has been submitted successfully and is now awaiting staff review.",
        ephemeral: true
    });
}

// ============================================================
// APPROVE / DECLINE
// ============================================================

async function handleReviewButton(interaction) {
    if (
        !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
        )
    ) {
        return safeReply(interaction, {
            content: "You do not have permission to review advertisements.",
            ephemeral: true
        });
    }

    const submission = configurations.get(
        `${interaction.guild.id}:${interaction.message.id}`
    );

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
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x555555)
            .setFooter({
                text: `ServerSpot • Declined by ${interaction.user.tag}`
            })
            .setTimestamp();

        await interaction.update({
            embeds: [updatedEmbed],
            components: []
        });

        const advertiser = await client.users
            .fetch(submission.userId)
            .catch(() => null);

        if (advertiser) {
            await advertiser.send(
                `Your ServerSpot advertisement for **${interaction.guild.name}** was declined by the ServerSpot team.`
            ).catch(() => {});
        }

        configurations.delete(
            `${interaction.guild.id}:${interaction.message.id}`
        );

        return;
    }

    // --------------------------------------------------------
    // ACCEPT
    // --------------------------------------------------------

    if (interaction.customId === "serverspot_accept") {
        const config = configurations.get(interaction.guild.id);

        if (!config) {
            return safeReply(interaction, {
                content:
                    "ServerSpot is not configured correctly. Please run `/setup` again.",
                ephemeral: true
            });
        }

        const featuredChannel = await interaction.guild.channels
            .fetch(config.featuredChannelId)
            .catch(() => null);

        if (!featuredChannel || !featuredChannel.isTextBased()) {
            return safeReply(interaction, {
                content:
                    "The configured Featured Servers channel could not be found. Please run `/setup` again.",
                ephemeral: true
            });
        }

        // ----------------------------------------------------
        // Get advertiser's server information
        // ----------------------------------------------------

        let serverName = interaction.guild.name;
        let memberCount = interaction.guild.memberCount;
        let serverIcon = interaction.guild.iconURL({
            size: 1024,
            extension: "png"
        });

        // ----------------------------------------------------
        // Featured advertisement
        // ----------------------------------------------------

        const featuredEmbed = new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(serverName)
            .setDescription(submission.description)
            .addFields(
                {
                    name: "Status",
                    value: submission.status,
                    inline: true
                },
                {
                    name: "Members",
                    value: memberCount.toLocaleString(),
                    inline: true
                },
                {
                    name: "Server Invite",
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

        // User-supplied image takes priority.
        if (submission.image) {
            featuredEmbed.setThumbnail(submission.image);
        } else if (serverIcon) {
            featuredEmbed.setThumbnail(serverIcon);
        }

        await featuredChannel.send({
            embeds: [featuredEmbed]
        });

        // ----------------------------------------------------
        // Update review message
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // Notify advertiser
        // ----------------------------------------------------

        const advertiser = await client.users
            .fetch(submission.userId)
            .catch(() => null);

        if (advertiser) {
            await advertiser.send(
                `Your ServerSpot advertisement for **${interaction.guild.name}** has been **approved** and published in the Featured Servers channel.`
            ).catch(() => {});
        }

        configurations.delete(
            `${interaction.guild.id}:${interaction.message.id}`
        );
    }
}

// ============================================================
// SERVER INFO
// ============================================================

async function handleServerInfo(interaction) {
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
                value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
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

async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("ServerSpot Commands")
        .setDescription(
            "Use ServerSpot to discover and advertise Discord communities."
        )
        .addFields(
            {
                name: "User Commands",
                value:
                    "`/advertise` — Submit a server advertisement\n" +
                    "`/serverinfo` — View server information\n" +
                    "`/help` — View this help menu"
            },
            {
                name: "Staff Commands",
                value:
                    "`/setup` — Configure advertisement logs and Featured Servers"
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
// INTERACTION HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {
    try {

        // -----------------------------
        // Slash commands
        // -----------------------------

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "setup") {
                return await handleSetup(interaction);
            }

            if (interaction.commandName === "advertise") {
                return await showAdvertiseModal(interaction);
            }

            if (interaction.commandName === "serverinfo") {
                return await handleServerInfo(interaction);
            }

            if (interaction.commandName === "help") {
                return await handleHelp(interaction);
            }
        }

        // -----------------------------
        // Modal submission
        // -----------------------------

        if (interaction.isModalSubmit()) {

            if (
                interaction.customId ===
                "serverspot_advertise_modal"
            ) {
                return await handleAdvertisement(interaction);
            }
        }

        // -----------------------------
        // Buttons
        // -----------------------------

        if (interaction.isButton()) {

            if (
                interaction.customId === "serverspot_accept" ||
                interaction.customId === "serverspot_decline"
            ) {
                return await handleReviewButton(interaction);
            }
        }

    } catch (error) {

        console.error(
            "Error while processing interaction:",
            error
        );

        await safeReply(interaction, {
            content:
                "Something went wrong while processing your request. Please try again or contact ServerSpot staff.",
            ephemeral: true
        });
    }
});

// ============================================================
// GLOBAL ERROR PROTECTION
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
