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
    ChannelType
} = require("discord.js");

const fs = require("fs");
const http = require("http");

// ======================================================
// SERVERSPOT CONFIGURATION
// ======================================================

const TOKEN =
    process.env.TOKEN ||
    process.env.DISCORD_TOKEN ||
    process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("Missing Discord bot token.");
    console.error("Add TOKEN to your Render environment variables.");
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;

const PORT = process.env.PORT || 3000;

const COLOUR = 0xE00000;

// ======================================================
// SIMPLE WEB SERVER FOR RENDER
// ======================================================

http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("ServerSpot is online.");
}).listen(PORT, "0.0.0.0", () => {
    console.log(`Web server listening on port ${PORT}`);
});

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel
    ]
});

// ======================================================
// CONFIG STORAGE
// ======================================================

const CONFIG_FILE = "./serverspot-config.json";

let configurations = {};

function loadConfigurations() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            configurations = JSON.parse(
                fs.readFileSync(CONFIG_FILE, "utf8")
            );
        }
    } catch (error) {
        console.error("Could not load configuration:", error);
        configurations = {};
    }
}

function saveConfigurations() {
    try {
        fs.writeFileSync(
            CONFIG_FILE,
            JSON.stringify(configurations, null, 2)
        );
    } catch (error) {
        console.error("Could not save configuration:", error);
    }
}

function getConfig(guildId) {
    return configurations[guildId] || {};
}

loadConfigurations();

// ======================================================
// COMMANDS
// ======================================================

const commands = [

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit your Discord server to ServerSpot."),

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot for this server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName("logs")
                .setDescription("Channel where advertisement submissions are sent.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName("featured")
                .setDescription("Channel where approved advertisements are posted.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("staff")
                .setDescription("Role allowed to approve or decline advertisements.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about ServerSpot."),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check ServerSpot's response time."),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription("View the current ServerSpot configuration.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(command => command.toJSON());

// ======================================================
// READY
// ======================================================

client.once("clientReady", async () => {

    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} server(s).`);

    try {

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        if (CLIENT_ID) {

            for (const guild of client.guilds.cache.values()) {

                try {

                    await rest.put(
                        Routes.applicationGuildCommands(
                            CLIENT_ID,
                            guild.id
                        ),
                        {
                            body: commands
                        }
                    );

                    console.log(
                        `Commands registered in ${guild.name}`
                    );

                } catch (error) {
                    console.error(
                        `Could not register commands in ${guild.name}:`,
                        error.message
                    );
                }
            }

        } else {

            console.log(
                "CLIENT_ID is missing. Commands cannot be registered automatically."
            );

        }

    } catch (error) {
        console.error("Command registration error:", error);
    }
});

// ======================================================
// INTERACTION HANDLER
// ======================================================

client.on("interactionCreate", async interaction => {

    try {

        // ==================================================
        // SLASH COMMANDS
        // ==================================================

        if (interaction.isChatInputCommand()) {

            // ----------------------------------------------
            // /PING
            // ----------------------------------------------

            if (interaction.commandName === "ping") {

                const latency = Date.now() - interaction.createdTimestamp;

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle("ServerSpot")
                            .setDescription(
                                `ServerSpot is online and responding normally.\n\n` +
                                `**Response Time**\n${latency}ms`
                            )
                            .setFooter({
                                text: "ServerSpot"
                            })
                    ],
                    ephemeral: true
                });
            }

            // ----------------------------------------------
            // /SERVERINFO
            // ----------------------------------------------

            if (interaction.commandName === "serverinfo") {

                const guild = interaction.guild;

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle("ServerSpot")
                            .setDescription(
                                "ServerSpot helps Discord communities discover, advertise and connect with new servers."
                            )
                            .addFields(
                                {
                                    name: "Servers",
                                    value: `${client.guilds.cache.size}`,
                                    inline: true
                                },
                                {
                                    name: "Members",
                                    value: `${client.guilds.cache.reduce(
                                        (total, g) => total + (g.memberCount || 0),
                                        0
                                    )}`,
                                    inline: true
                                },
                                {
                                    name: "Current Server",
                                    value: guild.name,
                                    inline: true
                                }
                            )
                            .setFooter({
                                text: "ServerSpot • Discover. Advertise. Connect."
                            })
                    ],
                    ephemeral: true
                });
            }

            // ----------------------------------------------
            // /SETUP
            // ----------------------------------------------

            if (interaction.commandName === "setup") {

                if (!interaction.memberPermissions.has(
                    PermissionFlagsBits.Administrator
                )) {
                    return interaction.reply({
                        content: "You need Administrator permissions to use this command.",
                        ephemeral: true
                    });
                }

                const logs = interaction.options.getChannel("logs");
                const featured = interaction.options.getChannel("featured");
                const staff = interaction.options.getRole("staff");

                configurations[interaction.guild.id] = {
                    logsChannel: logs.id,
                    featuredChannel: featured.id,
                    staffRole: staff.id
                };

                saveConfigurations();

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle("ServerSpot Setup Complete")
                            .setDescription(
                                "ServerSpot has been configured successfully."
                            )
                            .addFields(
                                {
                                    name: "Advertisement Logs",
                                    value: `${logs}`,
                                    inline: true
                                },
                                {
                                    name: "Featured Servers",
                                    value: `${featured}`,
                                    inline: true
                                },
                                {
                                    name: "Staff Role",
                                    value: `${staff}`,
                                    inline: true
                                }
                            )
                            .setFooter({
                                text: "ServerSpot configuration"
                            })
                    ],
                    ephemeral: true
                });
            }

            // ----------------------------------------------
            // /CONFIG
            // ----------------------------------------------

            if (interaction.commandName === "config") {

                const config = getConfig(interaction.guild.id);

                if (!config.logsChannel ||
                    !config.featuredChannel ||
                    !config.staffRole) {

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
                            .setTitle("ServerSpot Configuration")
                            .addFields(
                                {
                                    name: "Advertisement Logs",
                                    value: `<#${config.logsChannel}>`,
                                    inline: true
                                },
                                {
                                    name: "Featured Servers",
                                    value: `<#${config.featuredChannel}>`,
                                    inline: true
                                },
                                {
                                    name: "Staff Role",
                                    value: `<@&${config.staffRole}>`,
                                    inline: true
                                }
                            )
                    ],
                    ephemeral: true
                });
            }

            // ----------------------------------------------
            // /ADVERTISE
            // ----------------------------------------------

            if (interaction.commandName === "advertise") {

                const config = getConfig(interaction.guild.id);

                if (!config.logsChannel ||
                    !config.featuredChannel ||
                    !config.staffRole) {

                    return interaction.reply({
                        content:
                            "ServerSpot has not been configured yet. Please ask a server administrator to run `/setup`.",
                        ephemeral: true
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId("serverspot_advertise")
                    .setTitle("Submit a Server Advertisement");

                const inviteInput = new TextInputBuilder()
                    .setCustomId("invite")
                    .setLabel("Discord Invite Link")
                    .setPlaceholder("https://discord.gg/example")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(200);

                const groupInput = new TextInputBuilder()
                    .setCustomId("group")
                    .setLabel("Server / Group Link")
                    .setPlaceholder("Enter your server or group link")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(300);

                const imageInput = new TextInputBuilder()
                    .setCustomId("image")
                    .setLabel("Server Image URL")
                    .setPlaceholder("https://example.com/server-image.png")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(500);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Server Description")
                    .setPlaceholder("Tell people what your server is about...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                const statusInput = new TextInputBuilder()
                    .setCustomId("status")
                    .setLabel("Server Status")
                    .setPlaceholder("Open • Active • Recruiting • etc.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(inviteInput),
                    new ActionRowBuilder().addComponents(groupInput),
                    new ActionRowBuilder().addComponents(imageInput),
                    new ActionRowBuilder().addComponents(descriptionInput),
                    new ActionRowBuilder().addComponents(statusInput)
                );

                return interaction.showModal(modal);
            }
        }

        // ==================================================
        // ADVERTISEMENT FORM
        // ==================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "serverspot_advertise"
        ) {

            // IMPORTANT:
            // A modal must be acknowledged immediately.
            // This prevents "Unknown interaction" errors.

            await interaction.deferReply({
                ephemeral: true
            });

            const config = getConfig(interaction.guild.id);

            if (!config.logsChannel ||
                !config.featuredChannel ||
                !config.staffRole) {

                return interaction.editReply(
                    "ServerSpot has not been configured yet. Please ask an administrator to run `/setup`."
                );
            }

            const invite = interaction.fields.getTextInputValue("invite");
            const group = interaction.fields.getTextInputValue("group");
            const image = interaction.fields.getTextInputValue("image");
            const description =
                interaction.fields.getTextInputValue("description");
            const status =
                interaction.fields.getTextInputValue("status");

            // ----------------------------------------------
            // BASIC LINK VALIDATION
            // ----------------------------------------------

            if (
                !invite.includes("discord.gg/") &&
                !invite.includes("discord.com/invite/")
            ) {

                return interaction.editReply(
                    "That doesn't look like a valid Discord invite link."
                );
            }

            // ----------------------------------------------
            // TRY TO GET SERVER INFORMATION
            // ----------------------------------------------

            let inviteInfo = null;
            let serverName = "Unknown Server";
            let memberCount = "Unknown";
            let serverIcon = image || null;

            try {

                inviteInfo = await client.fetchInvite(invite, {
                    withCounts: true
                });

                if (inviteInfo.guild) {

                    serverName =
                        inviteInfo.guild.name ||
                        "Unknown Server";

                    if (inviteInfo.approximateMemberCount) {
                        memberCount =
                            inviteInfo.approximateMemberCount
                                .toLocaleString();
                    }

                    if (!serverIcon && inviteInfo.guild.icon) {
                        serverIcon =
                            `https://cdn.discordapp.com/icons/${inviteInfo.guild.id}/${inviteInfo.guild.icon}.png?size=512`;
                    }
                }

            } catch (error) {

                console.log(
                    "Could not fetch invite information:",
                    error.message
                );
            }

            // ----------------------------------------------
            // ADVERTISEMENT ID
            // ----------------------------------------------

            const advertisementId =
                `${Date.now()}-${interaction.user.id}`;

            // ----------------------------------------------
            // LOG EMBED
            // ----------------------------------------------

            const logEmbed = new EmbedBuilder()
                .setColor(COLOUR)
                .setTitle("New Server Advertisement")
                .setDescription(
                    `A new advertisement has been submitted for review.`
                )
                .addFields(
                    {
                        name: "Server",
                        value: serverName,
                        inline: true
                    },
                    {
                        name: "Submitted By",
                        value: `${interaction.user}`,
                        inline: true
                    },
                    {
                        name: "Members",
                        value: memberCount.toString(),
                        inline: true
                    },
                    {
                        name: "Status",
                        value: status,
                        inline: true
                    },
                    {
                        name: "Discord Invite",
                        value: invite,
                        inline: false
                    },
                    {
                        name: "Group Link",
                        value: group,
                        inline: false
                    },
                    {
                        name: "Description",
                        value: description,
                        inline: false
                    },
                    {
                        name: "Advertisement ID",
                        value: advertisementId,
                        inline: false
                    }
                )
                .setFooter({
                    text: "ServerSpot • Awaiting staff review"
                })
                .setTimestamp();

            if (serverIcon) {
                logEmbed.setThumbnail(serverIcon);
            }

            const buttons = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `serverspot_accept:${advertisementId}`
                        )
                        .setLabel("Accept")
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `serverspot_decline:${advertisementId}`
                        )
                        .setLabel("Decline")
                        .setStyle(ButtonStyle.Danger)

                );

            const logsChannel =
                interaction.guild.channels.cache.get(
                    config.logsChannel
                );

            if (!logsChannel) {

                return interaction.editReply(
                    "The configured advertisement logs channel could not be found."
                );
            }

            const logMessage = await logsChannel.send({
                embeds: [logEmbed],
                components: [buttons]
            });

            // Store temporary information on the message itself
            // so the staff buttons know who submitted it.

            logMessage.advertisementData = {
                userId: interaction.user.id,
                invite,
                group,
                image: serverIcon,
                description,
                status,
                serverName,
                memberCount
            };

            return interaction.editReply(
                "Your advertisement has been submitted successfully and is now awaiting staff review."
            );
        }

        // ==================================================
        // ACCEPT ADVERTISEMENT
        // ==================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "serverspot_accept:"
            )
        ) {

            const config = getConfig(interaction.guild.id);

            if (!config.staffRole) {
                return interaction.reply({
                    content:
                        "ServerSpot has not been configured correctly.",
                    ephemeral: true
                });
            }

            if (
                !interaction.member.roles.cache.has(
                    config.staffRole
                ) &&
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                return interaction.reply({
                    content:
                        "You do not have permission to review advertisements.",
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            const originalEmbed =
                interaction.message.embeds[0];

            const fields =
                originalEmbed?.fields || [];

            function getField(name) {

                const field = fields.find(
                    field => field.name === name
                );

                return field ? field.value : "";
            }

            const serverName =
                getField("Server") || "Unknown Server";

            const submitter =
                getField("Submitted By");

            const members =
                getField("Members") || "Unknown";

            const status =
                getField("Status") || "Unknown";

            const invite =
                getField("Discord Invite");

            const group =
                getField("Group Link");

            const description =
                getField("Description");

            // ----------------------------------------------
            // GET FEATURED CHANNEL
            // ----------------------------------------------

            const featuredChannel =
                interaction.guild.channels.cache.get(
                    config.featuredChannel
                );

            if (!featuredChannel) {

                return interaction.followUp({
                    content:
                        "The configured Featured Servers channel could not be found.",
                    ephemeral: true
                });
            }

            // ----------------------------------------------
            // FEATURED EMBED
            // ----------------------------------------------

            const featuredEmbed = new EmbedBuilder()
                .setColor(COLOUR)
                .setTitle(serverName)
                .setDescription(description || "No description provided.")
                .addFields(
                    {
                        name: "Status",
                        value: status,
                        inline: true
                    },
                    {
                        name: "Members",
                        value: members.toString(),
                        inline: true
                    },
                    {
                        name: "Advertised By",
                        value: submitter || "Unknown",
                        inline: true
                    }
                )
                .addFields(
                    {
                        name: "Discord",
                        value: `[Join Server](${invite})`,
                        inline: true
                    },
                    {
                        name: "Group",
                        value: `[View Group](${group})`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "ServerSpot • Featured Server"
                })
                .setTimestamp();

            // Use the submitted server image as the thumbnail.

            const thumbnail =
                originalEmbed?.thumbnail?.url;

            if (thumbnail) {
                featuredEmbed.setThumbnail(thumbnail);
            }

            await featuredChannel.send({
                embeds: [featuredEmbed]
            });

            // ----------------------------------------------
            // UPDATE LOG MESSAGE
            // ----------------------------------------------

            const acceptedEmbed =
                EmbedBuilder.from(originalEmbed)
                    .setColor(0x22C55E)
                    .setFooter({
                        text:
                            `Accepted by ${interaction.user.tag}`
                    });

            await interaction.message.edit({
                embeds: [acceptedEmbed],
                components: []
            });

            // ----------------------------------------------
            // DM SUBMITTER
            // ----------------------------------------------

            const userId =
                getField("Submitted By")
                    .replace(/[<@!>]/g, "");

            try {

                const user =
                    await client.users.fetch(userId);

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x22C55E)
                            .setTitle("Advertisement Approved")
                            .setDescription(
                                `Your ServerSpot advertisement for **${serverName}** has been approved and added to the Featured Servers channel.`
                            )
                    ]
                });

            } catch {
                console.log(
                    "Could not DM advertisement submitter."
                );
            }

            return;
        }

        // ==================================================
        // DECLINE ADVERTISEMENT
        // ==================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "serverspot_decline:"
            )
        ) {

            const config = getConfig(interaction.guild.id);

            if (!config.staffRole) {
                return interaction.reply({
                    content:
                        "ServerSpot has not been configured correctly.",
                    ephemeral: true
                });
            }

            if (
                !interaction.member.roles.cache.has(
                    config.staffRole
                ) &&
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.Administrator
                )
            ) {

                return interaction.reply({
                    content:
                        "You do not have permission to review advertisements.",
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            const originalEmbed =
                interaction.message.embeds[0];

            const fields =
                originalEmbed?.fields || [];

            function getField(name) {

                const field = fields.find(
                    field => field.name === name
                );

                return field ? field.value : "";
            }

            const serverName =
                getField("Server") || "Unknown Server";

            const submitter =
                getField("Submitted By");

            const userId =
                submitter.replace(/[<@!>]/g, "");

            const declinedEmbed =
                EmbedBuilder.from(originalEmbed)
                    .setColor(0x555555)
                    .setFooter({
                        text:
                            `Declined by ${interaction.user.tag}`
                    });

            await interaction.message.edit({
                embeds: [declinedEmbed],
                components: []
            });

            // ----------------------------------------------
            // DM USER
            // ----------------------------------------------

            try {

                const user =
                    await client.users.fetch(userId);

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLOUR)
                            .setTitle("Advertisement Declined")
                            .setDescription(
                                `Your ServerSpot advertisement for **${serverName}** was not approved by our moderation team.\n\nYou may correct your advertisement and submit it again using \`/advertise\`.`
                            )
                            .setFooter({
                                text: "ServerSpot"
                            })
                    ]
                });

            } catch {
                console.log(
                    "Could not DM declined advertisement submitter."
                );
            }

            return;
        }

    } catch (error) {

        console.error(
            "Interaction error:",
            error
        );

        // Prevent the bot from crashing if Discord has
        // already received the interaction response.

        try {

            if (interaction.deferred) {

                await interaction.editReply({
                    content:
                        "Something went wrong while processing that request."
                });

            } else if (!interaction.replied) {

                await interaction.reply({
                    content:
                        "Something went wrong while processing that request.",
                    ephemeral: true
                });

            }

        } catch {
            // Interaction already expired or was acknowledged.
        }
    }
});

// ======================================================
// DISCORD ERROR HANDLING
// ======================================================

client.on("error", error => {
    console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("Uncaught exception:", error);
});

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
