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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const EMBED_COLOR = 0xE00000;

// =====================================================
// DATA
// =====================================================

const advertisements = new Map();
const guildSettings = new Map();
const featured = new Set();
const blacklisted = new Set();

// =====================================================
// COMMANDS
// =====================================================

const commands = [

    // USER COMMANDS

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
                .setDescription("What are you looking for?")
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

    // STAFF COMMANDS

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
        .setDescription("Remove a server from featured")
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
// COMMAND REGISTRATION
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

        console.log(
            "ServerSpot commands registered successfully."
        );

    } catch (error) {
        console.error(
            "Command registration failed:",
            error
        );
    }
}

// =====================================================
// READY
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
        // ACCEPT BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "serverspot_accept_"
            )
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "You do not have permission to accept advertisements.",
                    ephemeral: true
                });
            }

            const advertisementId =
                interaction.customId.replace(
                    "serverspot_accept_",
                    ""
                );

            const advertisement =
                advertisements.get(
                    advertisementId
                );

            if (!advertisement) {
                return interaction.reply({
                    content:
                        "This advertisement could not be found. It may have expired or the bot may have restarted.",
                    ephemeral: true
                });
            }

            if (
                advertisement.status !==
                "Pending"
            ) {
                return interaction.reply({
                    content:
                        `This advertisement has already been ${advertisement.status.toLowerCase()}.`,
                    ephemeral: true
                });
            }

            const settings =
                guildSettings.get(
                    advertisement.guildId
                );

            if (!settings) {
                return interaction.reply({
                    content:
                        "ServerSpot has not been configured correctly. Please run `/setup` again.",
                    ephemeral: true
                });
            }

            const channel =
                await client.channels.fetch(
                    settings.advertisementChannel
                ).catch(() => null);

            if (!channel) {
                return interaction.reply({
                    content:
                        "The public advertisement channel could not be found.",
                    ephemeral: true
                });
            }

            // Mark as approved
            advertisement.status = "Approved";

            advertisement.approvedBy =
                interaction.user.id;

            // Public advertisement
            const publicEmbed =
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(
                        advertisement.name
                    )
                    .setDescription(
                        advertisement.description
                    )
                    .addFields(
                        {
                            name: "Category",
                            value:
                                advertisement.category,
                            inline: true
                        },
                        {
                            name: "Discord",
                            value:
                                `[Join Server](${advertisement.invite})`,
                            inline: true
                        },
                        {
                            name: "Group",
                            value:
                                `[View Group](${advertisement.group})`,
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "ServerSpot • Discover. Advertise. Connect."
                    })
                    .setTimestamp();

            await channel.send({
                embeds: [
                    publicEmbed
                ]
            });

            // Update logs message
            const approvedLog =
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(
                        "Advertisement Approved"
                    )
                    .addFields(
                        {
                            name: "Server",
                            value:
                                advertisement.name
                        },
                        {
                            name: "Submitted By",
                            value:
                                `<@${advertisement.userId}>`
                        },
                        {
                            name: "Approved By",
                            value:
                                `<@${interaction.user.id}>`
                        },
                        {
                            name: "Status",
                            value:
                                "Approved"
                        }
                    )
                    .setTimestamp();

            await interaction.message.edit({
                embeds: [
                    approvedLog
                ],
                components: []
            });

            // DM advertiser
            try {

                const user =
                    await client.users.fetch(
                        advertisement.userId
                    );

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                EMBED_COLOR
                            )
                            .setTitle(
                                "Advertisement Approved"
                            )
                            .setDescription(
                                `Your ServerSpot advertisement for **${advertisement.name}** has been approved and published.`
                            )
                    ]
                });

            } catch {
                console.log(
                    "Could not DM advertiser."
                );
            }

            return interaction.reply({
                content:
                    "Advertisement accepted and published.",
                ephemeral: true
            });
        }

        // =================================================
        // DECLINE BUTTON
        // =================================================

        if (
            interaction.isButton() &&
            interaction.customId.startsWith(
                "serverspot_decline_"
            )
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "You do not have permission to decline advertisements.",
                    ephemeral: true
                });
            }

            const advertisementId =
                interaction.customId.replace(
                    "serverspot_decline_",
                    ""
                );

            const advertisement =
                advertisements.get(
                    advertisementId
                );

            if (!advertisement) {
                return interaction.reply({
                    content:
                        "This advertisement could not be found. It may have expired or the bot may have restarted.",
                    ephemeral: true
                });
            }

            if (
                advertisement.status !==
                "Pending"
            ) {
                return interaction.reply({
                    content:
                        `This advertisement has already been ${advertisement.status.toLowerCase()}.`,
                    ephemeral: true
                });
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `serverspot_decline_modal_${advertisementId}`
                    )
                    .setTitle(
                        "Decline Advertisement"
                    );

            const reason =
                new TextInputBuilder()
                    .setCustomId(
                        "reason"
                    )
                    .setLabel(
                        "Reason for declining"
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setPlaceholder(
                        "Explain why this advertisement is being declined..."
                    )
                    .setRequired(true)
                    .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        reason
                    )
            );

            return interaction.showModal(
                modal
            );
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
                    content:
                        "You do not have permission to decline advertisements.",
                    ephemeral: true
                });
            }

            const advertisementId =
                interaction.customId.replace(
                    "serverspot_decline_modal_",
                    ""
                );

            const advertisement =
                advertisements.get(
                    advertisementId
                );

            if (!advertisement) {
                return interaction.reply({
                    content:
                        "This advertisement could not be found.",
                    ephemeral: true
                });
            }

            const reason =
                interaction.fields.getTextInputValue(
                    "reason"
                );

            advertisement.status =
                "Declined";

            advertisement.declinedBy =
                interaction.user.id;

            advertisement.reason =
                reason;

            const declinedLog =
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(
                        "Advertisement Declined"
                    )
                    .addFields(
                        {
                            name: "Server",
                            value:
                                advertisement.name
                        },
                        {
                            name: "Submitted By",
                            value:
                                `<@${advertisement.userId}>`
                        },
                        {
                            name: "Declined By",
                            value:
                                `<@${interaction.user.id}>`
                        },
                        {
                            name: "Reason",
                            value:
                                reason
                        },
                        {
                            name: "Status",
                            value:
                                "Declined"
                        }
                    )
                    .setTimestamp();

            await interaction.message.edit({
                embeds: [
                    declinedLog
                ],
                components: []
            });

            // DM advertiser
            try {

                const user =
                    await client.users.fetch(
                        advertisement.userId
                    );

                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                EMBED_COLOR
                            )
                            .setTitle(
                                "Advertisement Declined"
                            )
                            .setDescription(
                                `Your ServerSpot advertisement for **${advertisement.name}** was declined.`
                            )
                            .addFields({
                                name:
                                    "Reason",
                                value:
                                    reason
                            })
                    ]
                });

            } catch {
                console.log(
                    "Could not DM advertiser."
                );
            }

            return interaction.reply({
                content:
                    "Advertisement declined. The advertiser has been notified.",
                ephemeral: true
            });
        }

        // =================================================
        // ADVERTISE COMMAND
        // =================================================

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName ===
                "advertise"
        ) {

            const settings =
                guildSettings.get(
                    interaction.guild.id
                );

            if (!settings) {
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

            const name =
                new TextInputBuilder()
                    .setCustomId(
                        "server_name"
                    )
                    .setLabel(
                        "Server Name"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setPlaceholder(
                        "Example Community"
                    )
                    .setRequired(true)
                    .setMaxLength(100);

            const invite =
                new TextInputBuilder()
                    .setCustomId(
                        "invite"
                    )
                    .setLabel(
                        "Discord Invite Link"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setPlaceholder(
                        "https://discord.gg/example"
                    )
                    .setRequired(true)
                    .setMaxLength(300);

            const group =
                new TextInputBuilder()
                    .setCustomId(
                        "group"
                    )
                    .setLabel(
                        "Group Link"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setPlaceholder(
                        "https://example.com/group"
                    )
                    .setRequired(true)
                    .setMaxLength(300);

            const description =
                new TextInputBuilder()
                    .setCustomId(
                        "description"
                    )
                    .setLabel(
                        "Server Description"
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setPlaceholder(
                        "Tell people about your server..."
                    )
                    .setRequired(true)
                    .setMaxLength(1000);

            const category =
                new TextInputBuilder()
                    .setCustomId(
                        "category"
                    )
                    .setLabel(
                        "Category"
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setPlaceholder(
                        "Gaming, Social, Roleplay..."
                    )
                    .setRequired(true)
                    .setMaxLength(50);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(name),

                new ActionRowBuilder()
                    .addComponents(invite),

                new ActionRowBuilder()
                    .addComponents(group),

                new ActionRowBuilder()
                    .addComponents(description),

                new ActionRowBuilder()
                    .addComponents(category)
            );

            return interaction.showModal(
                modal
            );
        }

        // =================================================
        // ADVERTISE FORM SUBMISSION
        // =================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                "serverspot_advertise"
        ) {

            const name =
                interaction.fields.getTextInputValue(
                    "server_name"
                );

            const invite =
                interaction.fields.getTextInputValue(
                    "invite"
                );

            const group =
                interaction.fields.getTextInputValue(
                    "group"
                );

            const description =
                interaction.fields.getTextInputValue(
                    "description"
                );

            const category =
                interaction.fields.getTextInputValue(
                    "category"
                );

            if (
                !validURL(invite) ||
                !validURL(group)
            ) {
                return interaction.reply({
                    content:
                        "Please provide valid links.",
                    ephemeral: true
                });
            }

            const settings =
                guildSettings.get(
                    interaction.guild.id
                );

            if (!settings) {
                return interaction.reply({
                    content:
                        "ServerSpot has not been configured.",
                    ephemeral: true
                });
            }

            const logsChannel =
                await client.channels.fetch(
                    settings.logsChannel
                ).catch(() => null);

            if (!logsChannel) {
                return interaction.reply({
                    content:
                        "The advertisement logs channel could not be found.",
                    ephemeral: true
                });
            }

            // Unique ID
            const advertisementId =
                `${interaction.guild.id}_${interaction.user.id}_${Date.now()}`;

            const advertisement = {
                id:
                    advertisementId,

                guildId:
                    interaction.guild.id,

                userId:
                    interaction.user.id,

                name,

                invite,

                group,

                description,

                category,

                status:
                    "Pending",

                submittedAt:
                    Date.now()
            };

            advertisements.set(
                advertisementId,
                advertisement
            );

            // Logs embed
            const logEmbed =
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(
                        "New Advertisement"
                    )
                    .setDescription(
                        "A new server advertisement has been submitted and is awaiting staff review."
                    )
                    .addFields(
                        {
                            name: "Server Name",
                            value:
                                name
                        },
                        {
                            name: "Submitted By",
                            value:
                                `<@${interaction.user.id}>`,
                            inline: true
                        },
                        {
                            name: "Category",
                            value:
                                category,
                            inline: true
                        },
                        {
                            name: "Discord Invite",
                            value:
                                `[Open Invite](${invite})`
                        },
                        {
                            name: "Group Link",
                            value:
                                `[Open Group](${group})`
                        },
                        {
                            name: "Description",
                            value:
                                description
                        },
                        {
                            name: "Status",
                            value:
                                "Pending Review"
                        }
                    )
                    .setFooter({
                        text:
                            "ServerSpot Advertisement Review"
                    })
                    .setTimestamp();

            // Buttons
            const buttons =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `serverspot_accept_${advertisementId}`
                            )
                            .setLabel(
                                "Accept"
                            )
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `serverspot_decline_${advertisementId}`
                            )
                            .setLabel(
                                "Decline"
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            )

                    );

            await logsChannel.send({
                embeds: [
                    logEmbed
                ],
                components: [
                    buttons
                ]
            });

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Advertisement Submitted"
                        )
                        .setDescription(
                            "Your advertisement has been sent to the ServerSpot staff team for review."
                        )
                ],
                ephemeral: true
            });
        }

        // =================================================
        // COMMANDS
        // =================================================

        if (!interaction.isChatInputCommand()) {
            return;
        }

        // =================================================
        // SETUP
        // =================================================

        if (
            interaction.commandName ===
            "setup"
        ) {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "You must be an administrator to use this command.",
                    ephemeral: true
                });
            }

            const logs =
                interaction.options.getChannel(
                    "logs"
                );

            const advertisementsChannel =
                interaction.options.getChannel(
                    "advertisements"
                );

            guildSettings.set(
                interaction.guild.id,
                {
                    logsChannel:
                        logs.id,

                    advertisementChannel:
                        advertisementsChannel.id
                }
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Setup Complete"
                        )
                        .addFields(
                            {
                                name:
                                    "Advertisement Logs",
                                value:
                                    `${logs}`
                            },
                            {
                                name:
                                    "Advertisement Channel",
                                value:
                                    `${advertisementsChannel}`
                            }
                        )
                ],
                ephemeral: true
            });
        }

        // =================================================
        // STAFF COMMANDS
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

        if (
            interaction.commandName ===
            "review"
        ) {

            const pending =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                            "Pending"
                    );

            if (!pending.length) {
                return interaction.reply({
                    content:
                        "There are no pending advertisements.",
                    ephemeral: true
                });
            }

            const list =
                pending
                    .slice(0, 20)
                    .map(
                        ad =>
                            `**${ad.name}** — <@${ad.userId}>`
                    )
                    .join("\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Pending Advertisements"
                        )
                        .setDescription(
                            list
                        )
                ],
                ephemeral: true
            });
        }

        // =================================================
        // REMOVE
        // =================================================

        if (
            interaction.commandName ===
            "remove"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            const entry =
                [...advertisements.entries()]
                    .find(
                        ([id, ad]) =>
                            ad.name
                                .toLowerCase() ===
                            name
                    );

            if (!entry) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });
            }

            const [id, ad] =
                entry;

            advertisements.delete(
                id
            );

            featured.delete(
                id
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Advertisement Removed"
                        )
                        .setDescription(
                            `**${ad.name}** has been removed from ServerSpot.`
                        )
                ]
            });
        }

        // =================================================
        // FEATURE
        // =================================================

        if (
            interaction.commandName ===
            "feature"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(
                        ad =>
                            ad.name
                                .toLowerCase() ===
                                name &&
                            ad.status ===
                                "Approved"
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That approved server could not be found.",
                    ephemeral: true
                });
            }

            featured.add(
                ad.id
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Server Featured"
                        )
                        .setDescription(
                            `**${ad.name}** is now featured.`
                        )
                ]
            });
        }

        // =================================================
        // UNFEATURE
        // =================================================

        if (
            interaction.commandName ===
            "unfeature"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(
                        ad =>
                            ad.name
                                .toLowerCase() ===
                            name
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });
            }

            featured.delete(
                ad.id
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Server Unfeatured"
                        )
                        .setDescription(
                            `**${ad.name}** has been removed from featured servers.`
                        )
                ]
            });
        }

        // =================================================
        // BLACKLIST
        // =================================================

        if (
            interaction.commandName ===
            "blacklist"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            blacklisted.add(
                name
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Server Blacklisted"
                        )
                        .setDescription(
                            `**${name}** has been blacklisted.`
                        )
                ]
            });
        }

        // =================================================
        // UNBLACKLIST
        // =================================================

        if (
            interaction.commandName ===
            "unblacklist"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            blacklisted.delete(
                name
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Blacklist Removed"
                        )
                        .setDescription(
                            `**${name}** has been removed from the blacklist.`
                        )
                ]
            });
        }

        // =================================================
        // STATS
        // =================================================

        if (
            interaction.commandName ===
            "stats"
        ) {

            const total =
                advertisements.size;

            const approved =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                            "Approved"
                    ).length;

            const pending =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                            "Pending"
                    ).length;

            const declined =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                            "Declined"
                    ).length;

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Statistics"
                        )
                        .addFields(
                            {
                                name:
                                    "Total",
                                value:
                                    `${total}`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Approved",
                                value:
                                    `${approved}`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Pending",
                                value:
                                    `${pending}`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Declined",
                                value:
                                    `${declined}`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Featured",
                                value:
                                    `${featured.size}`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Blacklisted",
                                value:
                                    `${blacklisted.size}`,
                                inline:
                                    true
                            }
                        )
                ],
                ephemeral: true
            });
        }

        // =================================================
        // ANNOUNCE
        // =================================================

        if (
            interaction.commandName ===
            "announce"
        ) {

            const message =
                interaction.options.getString(
                    "message"
                );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Announcement"
                        )
                        .setDescription(
                            message
                        )
                        .setFooter({
                            text:
                                "ServerSpot"
                        })
                ]
            });
        }

        // =================================================
        // BROWSE
        // =================================================

        if (
            interaction.commandName ===
            "browse"
        ) {

            const results =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                            "Approved"
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "There are currently no approved advertisements.",
                    ephemeral: true
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
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Listings"
                        )
                        .setDescription(
                            list
                        )
                ]
            });
        }

        // =================================================
        // SEARCH
        // =================================================

        if (
            interaction.commandName ===
            "search"
        ) {

            const query =
                interaction.options
                    .getString(
                        "query"
                    )
                    .toLowerCase();

            const results =
                [...advertisements.values()]
                    .filter(
                        ad =>
                            ad.status ===
                                "Approved" &&
                            (
                                ad.name
                                    .toLowerCase()
                                    .includes(
                                        query
                                    ) ||
                                ad.description
                                    .toLowerCase()
                                    .includes(
                                        query
                                    ) ||
                                ad.category
                                    .toLowerCase()
                                    .includes(
                                        query
                                    )
                            )
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "No matching servers were found.",
                    ephemeral: true
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
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Search Results"
                        )
                        .setDescription(
                            list
                        )
                ]
            });
        }

        // =================================================
        // SERVER
        // =================================================

        if (
            interaction.commandName ===
            "server"
        ) {

            const name =
                interaction.options
                    .getString(
                        "name"
                    )
                    .toLowerCase();

            const ad =
                [...advertisements.values()]
                    .find(
                        ad =>
                            ad.status ===
                                "Approved" &&
                            ad.name
                                .toLowerCase() ===
                                name
                    );

            if (!ad) {
                return interaction.reply({
                    content:
                        "That server could not be found.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            ad.name
                        )
                        .setDescription(
                            ad.description
                        )
                        .addFields(
                            {
                                name:
                                    "Category",
                                value:
                                    ad.category,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Discord",
                                value:
                                    `[Join Server](${ad.invite})`,
                                inline:
                                    true
                            },
                            {
                                name:
                                    "Group",
                                value:
                                    `[View Group](${ad.group})`,
                                inline:
                                    true
                            }
                        )
                ]
            });
        }

        // =================================================
        // FEATURED
        // =================================================

        if (
            interaction.commandName ===
            "featured"
        ) {

            const results =
                [...featured]
                    .map(
                        id =>
                            advertisements.get(
                                id
                            )
                    )
                    .filter(
                        ad =>
                            ad &&
                            ad.status ===
                                "Approved"
                    );

            if (!results.length) {
                return interaction.reply({
                    content:
                        "There are currently no featured servers.",
                    ephemeral: true
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
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "Featured Servers"
                        )
                        .setDescription(
                            list
                        )
                ]
            });
        }

        // =================================================
        // CATEGORIES
        // =================================================

        if (
            interaction.commandName ===
            "categories"
        ) {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Categories"
                        )
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
        // ABOUT
        // =================================================

        if (
            interaction.commandName ===
            "about"
        ) {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "About ServerSpot"
                        )
                        .setDescription(
                            "ServerSpot helps people discover new Discord communities and gives server owners a place to showcase their servers.\n\n" +
                            "Discover. Advertise. Connect."
                        )
                ]
            });
        }

        // =================================================
        // RULES
        // =================================================

        if (
            interaction.commandName ===
            "rules"
        ) {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Guidelines"
                        )
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
        // HELP
        // =================================================

        if (
            interaction.commandName ===
            "help"
        ) {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            EMBED_COLOR
                        )
                        .setTitle(
                            "ServerSpot Commands"
                        )
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
                ephemeral: true
            });
        }

    } catch (error) {

        console.error(
            "Interaction error:",
            error
        );

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.reply({
                content:
                    "Something went wrong while processing this request.",
                ephemeral: true
            }).catch(() => {});

        }
    }

});

// =====================================================
// START BOT
// =====================================================

if (!TOKEN || !CLIENT_ID) {

    console.error(
        "DISCORD_TOKEN or CLIENT_ID is missing."
    );

    process.exit(1);
}

client.login(TOKEN);
