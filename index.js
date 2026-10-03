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
    ChannelSelectMenuBuilder,
    ChannelType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ActivityType,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");

const commands = require("./commands");

const {
    getConfig,
    saveConfig,
    resetConfig,
    createAdvertisement,
    getAdvertisement,
    updateAdvertisement,
    findDuplicate,
    listAdvertisements,
    searchAdvertisements,
    randomAdvertisement,
    recentAdvertisements,
    popularAdvertisements,
    statistics
} = require("./database");

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

const RED = 0xE00000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel
    ]
});

const cooldowns = new Map();

function log(type, message) {
    console.log(
        `[${new Date().toISOString()}] [${type}] ${message}`
    );
}

function safeReply(interaction, payload) {
    if (!interaction || !interaction.isRepliable()) {
        return Promise.resolve();
    }

    try {
        if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload).catch(error => {
                log("INTERACTION", error.message);
            });
        }

        return interaction.reply(payload).catch(error => {
            log("INTERACTION", error.message);
        });
    } catch (error) {
        log("INTERACTION", error.message);
        return Promise.resolve();
    }
}

function isStaff(interaction) {
    if (!interaction.guild || !interaction.memberPermissions) {
        return false;
    }

    return interaction.memberPermissions.has(
        PermissionFlagsBits.ManageGuild
    );
}

function makeButton(customId, label, style = ButtonStyle.Secondary, disabled = false) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled);
}

function baseEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(RED)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({
            text: "ServerSpot • Discover. Advertise. Connect."
        });
}

function validateInvite(value) {
    return /^https?:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/i.test(
        value.trim()
    );
}

function validateUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function getInviteCode(invite) {
    const match = invite.match(
        /discord(?:\.gg|\.com\/invite)\/([A-Za-z0-9-]+)/i
    );

    return match ? match[1] : null;
}

async function resolveInvite(invite) {
    try {
        const code = getInviteCode(invite);

        if (!code) return null;

        return await client.fetchInvite(code, {
            withCounts: true
        });
    } catch (error) {
        log("INVITE", `Unable to resolve invite: ${error.message}`);
        return null;
    }
}

function categoryOptions() {
    return [
        "Gaming",
        "Education",
        "Community",
        "Roblox",
        "Minecraft",
        "Social",
        "Technology",
        "Creative",
        "Other"
    ].map(category =>
        new StringSelectMenuOptionBuilder()
            .setLabel(category)
            .setValue(category.toLowerCase())
    );
}

function advertisementEmbed(ad) {
    const embed = baseEmbed(
        ad.server_name,
        ad.description
    );

    embed.addFields(
        {
            name: "Status",
            value: ad.status || "Not specified",
            inline: true
        },
        {
            name: "Members",
            value: ad.members
                ? Number(ad.members).toLocaleString()
                : "Unavailable",
            inline: true
        },
        {
            name: "Category",
            value: ad.category || "Other",
            inline: true
        },
        {
            name: "Submitted By",
            value: `<@${ad.user_id}>`,
            inline: true
        },
        {
            name: "Advertisement ID",
            value: `\`${ad.public_id}\``,
            inline: true
        }
    );

    if (ad.icon && validateUrl(ad.icon)) {
        embed.setThumbnail(ad.icon);
    }

    return embed;
}

function advertisementButtons(ad, staff = false) {
    const rows = [];

    const links = [];

    if (ad.invite) {
        links.push(
            new ButtonBuilder()
                .setLabel("Join Server")
                .setStyle(ButtonStyle.Link)
                .setURL(ad.invite)
        );
    }

    if (ad.website && validateUrl(ad.website)) {
        links.push(
            new ButtonBuilder()
                .setLabel("Website")
                .setStyle(ButtonStyle.Link)
                .setURL(ad.website)
        );
    }

    if (links.length) {
        rows.push(new ActionRowBuilder().addComponents(links));
    }

    if (staff && ad.state === "pending") {
        rows.push(
            new ActionRowBuilder().addComponents(
                makeButton(
                    `ad_accept:${ad.public_id}`,
                    "Accept",
                    ButtonStyle.Success
                ),
                makeButton(
                    `ad_decline:${ad.public_id}`,
                    "Decline",
                    ButtonStyle.Danger
                ),
                makeButton(
                    `ad_view:${ad.public_id}`,
                    "View Server",
                    ButtonStyle.Secondary
                )
            )
        );
    }

    return rows;
}

function setupEmbed(guildId) {
    const config = getConfig(guildId);

    const channelName = id =>
        id ? `<#${id}>` : "`Not configured`";

    return baseEmbed(
        "ServerSpot Setup",
        "Configure the channels used by ServerSpot.\n\n" +
        "Select the channels below and press **Save Configuration** when finished."
    ).addFields(
        {
            name: "Advertisement Logs",
            value: channelName(config?.logs_channel_id),
            inline: false
        },
        {
            name: "Featured Servers",
            value: channelName(config?.featured_channel_id),
            inline: false
        },
        {
            name: "Moderation Logs",
            value: channelName(config?.moderation_channel_id),
            inline: false
        },
        {
            name: "Announcements",
            value: channelName(config?.announcements_channel_id),
            inline: false
        }
    );
}

function setupComponents(guildId) {
    const config = getConfig(guildId);

    const logs = new ChannelSelectMenuBuilder()
        .setCustomId("setup_logs")
        .setPlaceholder(
            config?.logs_channel_id
                ? "Change Advertisement Logs"
                : "Select Advertisement Logs"
        )
        .setChannelTypes(ChannelType.GuildText);

    const featured = new ChannelSelectMenuBuilder()
        .setCustomId("setup_featured")
        .setPlaceholder(
            config?.featured_channel_id
                ? "Change Featured Servers"
                : "Select Featured Servers"
        )
        .setChannelTypes(ChannelType.GuildText);

    const moderation = new ChannelSelectMenuBuilder()
        .setCustomId("setup_moderation")
        .setPlaceholder(
            config?.moderation_channel_id
                ? "Change Moderation Logs"
                : "Select Moderation Logs"
        )
        .setChannelTypes(ChannelType.GuildText);

    const announcements = new ChannelSelectMenuBuilder()
        .setCustomId("setup_announcements")
        .setPlaceholder(
            config?.announcements_channel_id
                ? "Change Announcements"
                : "Select Announcements"
        )
        .setChannelTypes(ChannelType.GuildText);

    return [
        new ActionRowBuilder().addComponents(logs),
        new ActionRowBuilder().addComponents(featured),
        new ActionRowBuilder().addComponents(moderation),
        new ActionRowBuilder().addComponents(announcements),
        new ActionRowBuilder().addComponents(
            makeButton(
                "setup_save",
                "Save Configuration",
                ButtonStyle.Success
            ),
            makeButton(
                "setup_reset",
                "Reset",
                ButtonStyle.Danger
            ),
            makeButton(
                "setup_cancel",
                "Cancel",
                ButtonStyle.Secondary
            )
        )
    ];
}

async function showAdvertiseModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("advertise_modal")
        .setTitle("ServerSpot Advertisement");

    const serverName = new TextInputBuilder()
        .setCustomId("server_name")
        .setLabel("Server Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder("Example Community");

    const invite = new TextInputBuilder()
        .setCustomId("invite")
        .setLabel("Discord Invite")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("https://discord.gg/example");

    const website = new TextInputBuilder()
        .setCustomId("website")
        .setLabel("Website / Group Link")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder("https://example.com");

    const description = new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Server Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder("Tell people what makes your server worth joining.");

    const status = new TextInputBuilder()
        .setCustomId("status")
        .setLabel("Server Status")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder("Active");

    modal.addComponents(
        new ActionRowBuilder().addComponents(serverName),
        new ActionRowBuilder().addComponents(invite),
        new ActionRowBuilder().addComponents(website),
        new ActionRowBuilder().addComponents(description),
        new ActionRowBuilder().addComponents(status)
    );

    await interaction.showModal(modal);
}

const setupSessions = new Map();

async function handleSetupSelect(interaction) {
    if (!isStaff(interaction)) {
        return safeReply(interaction, {
            content: "You do not have permission to configure ServerSpot.",
            flags: MessageFlags.Ephemeral
        });
    }

    const guildId = interaction.guildId;

    if (!setupSessions.has(guildId)) {
        setupSessions.set(guildId, {});
    }

    const session = setupSessions.get(guildId);

    const channelId = interaction.values[0];

    if (interaction.customId === "setup_logs") {
        session.logs_channel_id = channelId;
    }

    if (interaction.customId === "setup_featured") {
        session.featured_channel_id = channelId;
    }

    if (interaction.customId === "setup_moderation") {
        session.moderation_channel_id = channelId;
    }

    if (interaction.customId === "setup_announcements") {
        session.announcements_channel_id = channelId;
    }

    await interaction.update({
        embeds: [setupEmbed(guildId)],
        components: setupComponents(guildId)
    });
}

async function handleAdvertisementSubmit(interaction) {
    const guildId = interaction.guildId;

    if (!guildId) {
        return safeReply(interaction, {
            content: "Advertisements can only be submitted inside a server.",
            flags: MessageFlags.Ephemeral
        });
    }

    const config = getConfig(guildId);

    if (!config?.logs_channel_id) {
        return safeReply(interaction, {
            content: "ServerSpot has not been configured yet. Ask a server administrator to run `/setup`.",
            flags: MessageFlags.Ephemeral
        });
    }

    const cooldownKey = `${guildId}:${interaction.user.id}`;
    const lastSubmission = cooldowns.get(cooldownKey);

    if (lastSubmission && Date.now() - lastSubmission < 300000) {
        const remaining = Math.ceil(
            (300000 - (Date.now() - lastSubmission)) / 60000
        );

        return safeReply(interaction, {
            content: `You can submit another advertisement in approximately ${remaining} minute(s).`,
            flags: MessageFlags.Ephemeral
        });
    }

    const serverName = interaction.fields.getTextInputValue("server_name").trim();
    const invite = interaction.fields.getTextInputValue("invite").trim();
    const website = interaction.fields.getTextInputValue("website").trim();
    const description = interaction.fields.getTextInputValue("description").trim();
    const status = interaction.fields.getTextInputValue("status").trim();

    if (!validateInvite(invite)) {
        return safeReply(interaction, {
            content: "Please provide a valid Discord invite link.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (website && !validateUrl(website)) {
        return safeReply(interaction, {
            content: "The website / group link is not a valid URL.",
            flags: MessageFlags.Ephemeral
        });
    }

    const duplicate = findDuplicate(guildId, invite);

    if (duplicate) {
        return safeReply(interaction, {
            content: `This server already has an active ServerSpot advertisement: \`${duplicate.public_id}\`.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const inviteData = await resolveInvite(invite);

    const members =
        inviteData?.approximateMemberCount ||
        inviteData?.guild?.approximateMemberCount ||
        null;

    const icon =
        inviteData?.guild?.iconURL?.({
            extension: "png",
            size: 256
        }) || null;

    const publicId =
        `SS-${String(Date.now()).slice(-6)}-${Math.floor(
            Math.random() * 90 + 10
        )}`;

    const ad = createAdvertisement({
        public_id: publicId,
        guild_id: guildId,
        user_id: interaction.user.id,
        server_name: serverName,
        invite,
        website,
        description,
        status,
        category: "other",
        members,
        icon
    });

    cooldowns.set(cooldownKey, Date.now());

    const logsChannel =
        interaction.guild.channels.cache.get(config.logs_channel_id) ||
        await interaction.guild.channels.fetch(config.logs_channel_id).catch(() => null);

    if (!logsChannel || !logsChannel.isTextBased()) {
        return safeReply(interaction, {
            content: "The configured Advertisement Logs channel could not be found. Please ask staff to run `/setup` again.",
            flags: MessageFlags.Ephemeral
        });
    }

    const message = await logsChannel.send({
        embeds: [advertisementEmbed(ad)],
        components: advertisementButtons(ad, true)
    });

    updateAdvertisement(ad.public_id, {
        logs_message_id: message.id
    });

    log(
        "ADVERTISEMENT",
        `${publicId} submitted by ${interaction.user.tag}`
    );

    return safeReply(interaction, {
        embeds: [
            baseEmbed(
                "Advertisement Submitted",
                `Your server has been submitted successfully and is now awaiting staff review.\n\n**Advertisement ID**\n\`${publicId}\``
            )
        ],
        flags: MessageFlags.Ephemeral
    });
}

async function approveAdvertisement(interaction, publicId) {
    if (!isStaff(interaction)) {
        return safeReply(interaction, {
            content: "You do not have permission to approve advertisements.",
            flags: MessageFlags.Ephemeral
        });
    }

    const ad = getAdvertisement(publicId);

    if (!ad) {
        return safeReply(interaction, {
            content: "That advertisement could not be found.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (ad.state !== "pending") {
        return safeReply(interaction, {
            content: `This advertisement has already been ${ad.state}.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const config = getConfig(ad.guild_id);

    if (!config?.featured_channel_id) {
        return safeReply(interaction, {
            content: "The Featured Servers channel has not been configured.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferUpdate();

    const channel =
        interaction.guild.channels.cache.get(config.featured_channel_id) ||
        await interaction.guild.channels.fetch(config.featured_channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return safeReply(interaction, {
            content: "The configured Featured Servers channel could not be found.",
            flags: MessageFlags.Ephemeral
        });
    }

    updateAdvertisement(publicId, {
        state: "approved",
        reviewer_id: interaction.user.id,
        reviewed_at: Date.now()
    });

    const updated = getAdvertisement(publicId);

    const featuredMessage = await channel.send({
        embeds: [advertisementEmbed(updated)],
        components: advertisementButtons(updated)
    });

    updateAdvertisement(publicId, {
        featured_message_id: featuredMessage.id
    });

    const disabledComponents = advertisementButtons(ad, true).map(row => {
        const newRow = new ActionRowBuilder();

        for (const component of row.components) {
            if (component.data.style === ButtonStyle.Link) {
                newRow.addComponents(
                    ButtonBuilder.from(component)
                );
            } else {
                newRow.addComponents(
                    ButtonBuilder.from(component).setDisabled(true)
                );
            }
        }

        return newRow;
    });

    await interaction.message.edit({
        embeds: [
            advertisementEmbed(updated).addFields({
                name: "Review",
                value: `Approved by <@${interaction.user.id}>`,
                inline: false
            })
        ],
        components: disabledComponents
    }).catch(error => {
        log("MESSAGE", error.message);
    });

    const advertiser = await client.users.fetch(ad.user_id).catch(() => null);

    if (advertiser) {
        await advertiser.send({
            embeds: [
                baseEmbed(
                    "Advertisement Approved",
                    `Your server **${ad.server_name}** has been approved and is now listed on ServerSpot.`
                )
            ]
        }).catch(() => {});
    }

    log(
        "APPROVED",
        `${publicId} approved by ${interaction.user.tag}`
    );
}

async function declineAdvertisement(interaction, publicId) {
    if (!isStaff(interaction)) {
        return safeReply(interaction, {
            content: "You do not have permission to decline advertisements.",
            flags: MessageFlags.Ephemeral
        });
    }

    const ad = getAdvertisement(publicId);

    if (!ad) {
        return safeReply(interaction, {
            content: "That advertisement could not be found.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (ad.state !== "pending") {
        return safeReply(interaction, {
            content: `This advertisement has already been ${ad.state}.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`decline_modal:${publicId}`)
        .setTitle("Decline Advertisement");

    const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for decline")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder("Explain why this advertisement cannot be approved.");

    modal.addComponents(
        new ActionRowBuilder().addComponents(reason)
    );

    return interaction.showModal(modal);
}

async function handleDeclineSubmit(interaction, publicId) {
    const ad = getAdvertisement(publicId);

    if (!ad) {
        return safeReply(interaction, {
            content: "That advertisement could not be found.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (ad.state !== "pending") {
        return safeReply(interaction, {
            content: "This advertisement has already been processed.",
            flags: MessageFlags.Ephemeral
        });
    }

    const reason = interaction.fields.getTextInputValue("reason").trim();

    updateAdvertisement(publicId, {
        state: "declined",
        reviewer_id: interaction.user.id,
        review_reason: reason,
        reviewed_at: Date.now()
    });

    const updated = getAdvertisement(publicId);

    await interaction.reply({
        content: `Advertisement \`${publicId}\` declined.`,
        flags: MessageFlags.Ephemeral
    });

    if (interaction.message) {
        await interaction.message.edit({
            embeds: [
                advertisementEmbed(updated).addFields({
                    name: "Review",
                    value:
                        `Declined by <@${interaction.user.id}>\n` +
                        `**Reason:** ${reason}`,
                    inline: false
                })
            ],
            components: advertisementButtons(updated, true).map(row => {
                const newRow = new ActionRowBuilder();

                for (const component of row.components) {
                    if (component.data.style === ButtonStyle.Link) {
                        newRow.addComponents(
                            ButtonBuilder.from(component)
                        );
                    } else {
                        newRow.addComponents(
                            ButtonBuilder.from(component).setDisabled(true)
                        );
                    }
                }

                return newRow;
            })
        }).catch(() => {});
    }

    const advertiser = await client.users.fetch(ad.user_id).catch(() => null);

    if (advertiser) {
        await advertiser.send({
            embeds: [
                baseEmbed(
                    "Advertisement Declined",
                    `Your advertisement for **${ad.server_name}** was not approved.\n\n**Reason**\n${reason}`
                )
            ]
        }).catch(() => {});
    }

    log(
        "DECLINED",
        `${publicId} declined by ${interaction.user.tag}`
    );
}

function discoveryComponents(prefix, index, total) {
    return [
        new ActionRowBuilder().addComponents(
            makeButton(
                `${prefix}_prev:${index}`,
                "Previous",
                ButtonStyle.Secondary,
                index <= 0
            ),
            makeButton(
                `${prefix}_next:${index}`,
                "Next",
                ButtonStyle.Secondary,
                index >= total - 1
            ),
            makeButton(
                `${prefix}_random`,
                "Random",
                ButtonStyle.Primary
            ),
            makeButton(
                `${prefix}_close`,
                "Close",
                ButtonStyle.Danger
            )
        )
    ];
}

function discoveryEmbed(ad, index, total) {
    const embed = advertisementEmbed(ad);

    embed.setFooter({
        text:
            `ServerSpot • ${index + 1}/${total} • Discover. Advertise. Connect.`
    });

    return embed;
}

async function sendDiscovery(interaction, ads, index = 0) {
    if (!ads.length) {
        return safeReply(interaction, {
            embeds: [
                baseEmbed(
                    "No Communities Found",
                    "There are currently no approved ServerSpot communities to display."
                )
            ],
            flags: MessageFlags.Ephemeral
        });
    }

    const safeIndex = Math.max(
        0,
        Math.min(index, ads.length - 1)
    );

    return safeReply(interaction, {
        embeds: [
            discoveryEmbed(
                ads[safeIndex],
                safeIndex,
                ads.length
            )
        ],
        components: discoveryComponents(
            "discover",
            safeIndex,
            ads.length
        ),
        flags: MessageFlags.Ephemeral
    });
}

client.once("clientReady", async () => {
    log(
        "STARTUP",
        `ServerSpot is online as ${client.user.tag}`
    );

    client.user.setPresence({
        activities: [
            {
                name: "Discover. Advertise. Connect.",
                type: ActivityType.Watching
            }
        ],
        status: "online"
    });

    try {
        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        log(
            "COMMANDS",
            `${commands.length} commands registered successfully.`
        );
    } catch (error) {
        log(
            "COMMANDS",
            `Registration failed: ${error.stack || error.message}`
        );
    }

    log(
        "READY",
        `Serving ${client.guilds.cache.size} server(s).`
    );
});

client.on("interactionCreate", async interaction => {
    try {

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "advertise") {
                return showAdvertiseModal(interaction);
            }

            if (interaction.commandName === "discover") {
                const ads = listAdvertisements(
                    interaction.guildId,
                    "approved",
                    25
                );

                return sendDiscovery(interaction, ads);
            }

            if (interaction.commandName === "random") {
                const ad = randomAdvertisement(interaction.guildId);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "There are currently no approved communities.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                return safeReply(interaction, {
                    embeds: [advertisementEmbed(ad)],
                    components: advertisementButtons(ad),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "server") {
                const name = interaction.options.getString("name");

                const results = searchAdvertisements(
                    interaction.guildId,
                    name
                );

                if (!results.length) {
                    return safeReply(interaction, {
                        embeds: [
                            baseEmbed(
                                "No Results",
                                `No approved ServerSpot community matching **${name}** was found.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return sendDiscovery(interaction, results);
            }

            if (interaction.commandName === "recent") {
                return sendDiscovery(
                    interaction,
                    recentAdvertisements(interaction.guildId)
                );
            }

            if (interaction.commandName === "popular") {
                return sendDiscovery(
                    interaction,
                    popularAdvertisements(interaction.guildId)
                );
            }

            if (interaction.commandName === "serverinfo") {
                const guild = interaction.guild;
                await guild.fetch();

                const owner = await guild.fetchOwner().catch(() => null);

                const embed = baseEmbed(
                    guild.name,
                    "Information about this Discord community."
                );

                if (guild.iconURL()) {
                    embed.setThumbnail(guild.iconURL({
                        extension: "png",
                        size: 256
                    }));
                }

                embed.addFields(
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
                        value: owner
                            ? `<@${owner.id}>`
                            : "Unavailable",
                        inline: true
                    },
                    {
                        name: "Created",
                        value:
                            `<t:${Math.floor(
                                guild.createdTimestamp / 1000
                            )}:F>`,
                        inline: false
                    },
                    {
                        name: "Boost Level",
                        value: `Level ${guild.premiumTier}`,
                        inline: true
                    }
                );

                return safeReply(interaction, {
                    embeds: [embed]
                });
            }

            if (interaction.commandName === "stats") {
                const stats = statistics(interaction.guildId);

                return safeReply(interaction, {
                    embeds: [
                        baseEmbed(
                            "ServerSpot Statistics",
                            "Current advertisement statistics for this ServerSpot installation."
                        ).addFields(
                            {
                                name: "Total Advertisements",
                                value: stats.total.toString(),
                                inline: true
                            },
                            {
                                name: "Approved",
                                value: stats.approved.toString(),
                                inline: true
                            },
                            {
                                name: "Pending",
                                value: stats.pending.toString(),
                                inline: true
                            },
                            {
                                name: "Declined",
                                value: stats.declined.toString(),
                                inline: true
                            }
                        )
                    ]
                });
            }

            if (interaction.commandName === "help") {
                const embed = baseEmbed(
                    "ServerSpot Help",
                    "Discover. Advertise. Connect."
                );

                embed.addFields(
                    {
                        name: "Discovery",
                        value:
                            "`/discover`\n" +
                            "`/random`\n" +
                            "`/server`\n" +
                            "`/recent`\n" +
                            "`/popular`",
                        inline: true
                    },
                    {
                        name: "Advertising",
                        value:
                            "`/advertise`\n" +
                            "`/stats`",
                        inline: true
                    },
                    {
                        name: "Information",
                        value:
                            "`/serverinfo`\n" +
                            "`/help`",
                        inline: true
                    },
                    {
                        name: "Staff",
                        value:
                            "`/setup`\n" +
                            "`/pending`\n" +
                            "`/review`\n" +
                            "`/advertisements`\n" +
                            "`/remove`\n" +
                            "`/edit`\n" +
                            "`/announce`\n" +
                            "`/servercheck`\n" +
                            "`/health`",
                        inline: false
                    }
                );

                return safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "setup") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use `/setup`.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const config = getConfig(interaction.guildId);

                setupSessions.set(
                    interaction.guildId,
                    {
                        logs_channel_id:
                            config?.logs_channel_id || null,
                        featured_channel_id:
                            config?.featured_channel_id || null,
                        moderation_channel_id:
                            config?.moderation_channel_id || null,
                        announcements_channel_id:
                            config?.announcements_channel_id || null
                    }
                );

                return safeReply(interaction, {
                    embeds: [setupEmbed(interaction.guildId)],
                    components: setupComponents(interaction.guildId),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "pending") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const ads = listAdvertisements(
                    interaction.guildId,
                    "pending",
                    10
                );

                if (!ads.length) {
                    return safeReply(interaction, {
                        content: "There are no pending advertisements.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const options = ads.slice(0, 25).map(ad =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ad.server_name.slice(0, 100))
                        .setDescription(
                            `${ad.public_id} • ${ad.status}`.slice(0, 100)
                        )
                        .setValue(ad.public_id)
                );

                const menu = new StringSelectMenuBuilder()
                    .setCustomId("pending_select")
                    .setPlaceholder("Select an advertisement")
                    .addOptions(options);

                return safeReply(interaction, {
                    embeds: [
                        baseEmbed(
                            "Pending Advertisements",
                            "Select an advertisement to review."
                        )
                    ],
                    components: [
                        new ActionRowBuilder().addComponents(menu)
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "review") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const id = interaction.options.getString("id");
                const ad = getAdvertisement(id);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "Advertisement not found.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                return safeReply(interaction, {
                    embeds: [advertisementEmbed(ad)],
                    components: advertisementButtons(
                        ad,
                        true
                    ),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "advertisements") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const stats = statistics(interaction.guildId);

                return safeReply(interaction, {
                    embeds: [
                        baseEmbed(
                            "Advertisement Dashboard",
                            "ServerSpot moderation overview."
                        ).addFields(
                            {
                                name: "Pending",
                                value: stats.pending.toString(),
                                inline: true
                            },
                            {
                                name: "Approved",
                                value: stats.approved.toString(),
                                inline: true
                            },
                            {
                                name: "Declined",
                                value: stats.declined.toString(),
                                inline: true
                            },
                            {
                                name: "Total",
                                value: stats.total.toString(),
                                inline: true
                            }
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "remove") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const id = interaction.options.getString("id");
                const ad = getAdvertisement(id);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "Advertisement not found.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (ad.state !== "approved") {
                    return safeReply(interaction, {
                        content: "Only approved advertisements can be removed.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                updateAdvertisement(id, {
                    state: "removed",
                    reviewer_id: interaction.user.id,
                    reviewed_at: Date.now()
                });

                const config = getConfig(interaction.guildId);

                if (config?.featured_channel_id && ad.featured_message_id) {
                    const channel =
                        interaction.guild.channels.cache.get(
                            config.featured_channel_id
                        );

                    if (channel?.isTextBased()) {
                        const message =
                            await channel.messages.fetch(
                                ad.featured_message_id
                            ).catch(() => null);

                        if (message) {
                            await message.delete().catch(() => {});
                        }
                    }
                }

                return safeReply(interaction, {
                    content: `Advertisement \`${id}\` has been removed.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "announce") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const config = getConfig(interaction.guildId);

                if (!config?.announcements_channel_id) {
                    return safeReply(interaction, {
                        content: "The announcements channel has not been configured.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const channel =
                    interaction.guild.channels.cache.get(
                        config.announcements_channel_id
                    );

                if (!channel?.isTextBased()) {
                    return safeReply(interaction, {
                        content: "The configured announcements channel could not be found.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const message =
                    interaction.options.getString("message");

                await channel.send({
                    embeds: [
                        baseEmbed(
                            "ServerSpot Announcement",
                            message
                        )
                    ]
                });

                return safeReply(interaction, {
                    content: "Announcement sent.",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "servercheck") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const id = interaction.options.getString("id");
                const ad = getAdvertisement(id);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "Advertisement not found.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = advertisementEmbed(ad);

                embed.addFields(
                    {
                        name: "State",
                        value: ad.state,
                        inline: true
                    },
                    {
                        name: "Submitted",
                        value:
                            `<t:${Math.floor(
                                ad.submitted_at / 1000
                            )}:F>`,
                        inline: true
                    },
                    {
                        name: "Reviewer",
                        value: ad.reviewer_id
                            ? `<@${ad.reviewer_id}>`
                            : "Not reviewed",
                        inline: true
                    }
                );

                return safeReply(interaction, {
                    embeds: [embed],
                    components: advertisementButtons(ad),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "health") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const config = getConfig(interaction.guildId);

                return safeReply(interaction, {
                    embeds: [
                        baseEmbed(
                            "ServerSpot Health",
                            "Current system status."
                        ).addFields(
                            {
                                name: "Bot",
                                value: "Online",
                                inline: true
                            },
                            {
                                name: "Latency",
                                value: `${client.ws.ping}ms`,
                                inline: true
                            },
                            {
                                name: "Database",
                                value: "Online",
                                inline: true
                            },
                            {
                                name: "Guilds",
                                value: client.guilds.cache.size.toString(),
                                inline: true
                            },
                            {
                                name: "Uptime",
                                value:
                                    `${Math.floor(
                                        process.uptime() / 3600
                                    )}h`,
                                inline: true
                            },
                            {
                                name: "Configuration",
                                value: config
                                    ? "Configured"
                                    : "Not configured",
                                inline: true
                            }
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === "edit") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                return safeReply(interaction, {
                    content:
                        "The advertisement editing interface is ready for the next update. Use `/review` to inspect the advertisement.",
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (interaction.isModalSubmit()) {

            if (interaction.customId === "advertise_modal") {
                return handleAdvertisementSubmit(interaction);
            }

            if (interaction.customId.startsWith("decline_modal:")) {
                const id =
                    interaction.customId.split(":")[1];

                return handleDeclineSubmit(
                    interaction,
                    id
                );
            }
        }

        if (interaction.isChannelSelectMenu()) {
            if (
                [
                    "setup_logs",
                    "setup_featured",
                    "setup_moderation",
                    "setup_announcements"
                ].includes(interaction.customId)
            ) {
                return handleSetupSelect(interaction);
            }
        }

        if (interaction.isStringSelectMenu()) {

            if (interaction.customId === "pending_select") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to use this.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const id = interaction.values[0];
                const ad = getAdvertisement(id);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "Advertisement no longer exists.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                return interaction.update({
                    embeds: [advertisementEmbed(ad)],
                    components: advertisementButtons(ad, true)
                });
            }
        }

        if (interaction.isButton()) {

            if (interaction.customId === "setup_save") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to configure ServerSpot.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const session =
                    setupSessions.get(interaction.guildId);

                if (!session?.logs_channel_id) {
                    return safeReply(interaction, {
                        content: "Please select an Advertisement Logs channel.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!session?.featured_channel_id) {
                    return safeReply(interaction, {
                        content: "Please select a Featured Servers channel.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                saveConfig(interaction.guildId, session);
                setupSessions.delete(interaction.guildId);

                return interaction.update({
                    embeds: [
                        baseEmbed(
                            "Setup Saved",
                            "ServerSpot has been configured successfully."
                        )
                    ],
                    components: []
                });
            }

            if (interaction.customId === "setup_reset") {
                if (!isStaff(interaction)) {
                    return safeReply(interaction, {
                        content: "You do not have permission to do this.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                resetConfig(interaction.guildId);
                setupSessions.delete(interaction.guildId);

                return interaction.update({
                    embeds: [
                        baseEmbed(
                            "Configuration Reset",
                            "ServerSpot configuration has been reset."
                        )
                    ],
                    components: []
                });
            }

            if (interaction.customId === "setup_cancel") {
                setupSessions.delete(interaction.guildId);

                return interaction.update({
                    embeds: [
                        baseEmbed(
                            "Setup Cancelled",
                            "No changes were saved."
                        )
                    ],
                    components: []
                });
            }

            if (interaction.customId.startsWith("ad_accept:")) {
                const id =
                    interaction.customId.split(":")[1];

                return approveAdvertisement(
                    interaction,
                    id
                );
            }

            if (interaction.customId.startsWith("ad_decline:")) {
                const id =
                    interaction.customId.split(":")[1];

                return declineAdvertisement(
                    interaction,
                    id
                );
            }

            if (interaction.customId.startsWith("ad_view:")) {
                const id =
                    interaction.customId.split(":")[1];

                const ad = getAdvertisement(id);

                if (!ad) {
                    return safeReply(interaction, {
                        content: "Advertisement not found.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                return safeReply(interaction, {
                    embeds: [advertisementEmbed(ad)],
                    components: advertisementButtons(ad),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.customId.startsWith("discover_")) {

                const ads = listAdvertisements(
                    interaction.guildId,
                    "approved",
                    25
                );

                if (!ads.length) {
                    return safeReply(interaction, {
                        content: "There are currently no approved communities.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (interaction.customId === "discover_close") {
                    return interaction.update({
                        content: "ServerSpot discovery closed.",
                        embeds: [],
                        components: []
                    });
                }

                if (interaction.customId === "discover_random") {
                    const random =
                        ads[Math.floor(Math.random() * ads.length)];

                    return interaction.update({
                        embeds: [advertisementEmbed(random)],
                        components: discoveryComponents(
                            "discover",
                            ads.indexOf(random),
                            ads.length
                        )
                    });
                }

                const parts =
                    interaction.customId.split(":");

                const current =
                    Number(parts[1] || 0);

                let next = current;

                if (interaction.customId.startsWith("discover_prev")) {
                    next = Math.max(0, current - 1);
                }

                if (interaction.customId.startsWith("discover_next")) {
                    next = Math.min(
                        ads.length - 1,
                        current + 1
                    );
                }

                return interaction.update({
                    embeds: [
                        discoveryEmbed(
                            ads[next],
                            next,
                            ads.length
                        )
                    ],
                    components: discoveryComponents(
                        "discover",
                        next,
                        ads.length
                    )
                });
            }
        }

    } catch (error) {
        log(
            "ERROR",
            error.stack || error.message
        );

        if (
            error.code === 10062 ||
            error.code === 40060
        ) {
            return;
        }

        return safeReply(interaction, {
            content:
                "Something went wrong while processing your request. Please try again.",
            flags: MessageFlags.Ephemeral
        });
    }
});

client.on("error", error => {
    log(
        "CLIENT",
        error.stack || error.message
    );
});

process.on("unhandledRejection", error => {
    log(
        "UNHANDLED_REJECTION",
        error?.stack || error
    );
});

process.on("uncaughtException", error => {
    log(
        "UNCAUGHT_EXCEPTION",
        error.stack || error.message
    );
});

client.login(TOKEN);
