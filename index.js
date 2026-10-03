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
    ActionRowBuilder
} = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

// Optional: put your Discord user ID here in Render as STAFF_ROLE_ID
// If you don't set it, Discord Administrator permission is required.
const staffRoleId = process.env.STAFF_ROLE_ID;

// Temporary storage.
// Later we can replace this with a proper database.
const advertisements = new Map();
const blacklisted = new Set();
const featured = new Set();

const commands = [

    // =========================
    // USER COMMANDS
    // =========================

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit a server advertisement"),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search ServerSpot for a community")
        .addStringOption(option =>
            option
                .setName("query")
                .setDescription("What are you looking for?")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("browse")
        .setDescription("Browse available ServerSpot listings"),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("View information about a listed server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("featured")
        .setDescription("View featured ServerSpot servers"),

    new SlashCommandBuilder()
        .setName("categories")
        .setDescription("Browse ServerSpot server categories"),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn more about ServerSpot"),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View ServerSpot guidelines"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands"),

    // =========================
    // STAFF COMMANDS
    // =========================

    new SlashCommandBuilder()
        .setName("review")
        .setDescription("View submitted server advertisements"),

    new SlashCommandBuilder()
        .setName("approve")
        .setDescription("Approve a server advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("reject")
        .setDescription("Reject a server advertisement")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("feature")
        .setDescription("Feature a server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unfeature")
        .setDescription("Remove a server from featured")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a server listing")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("blacklist")
        .setDescription("Blacklist a server")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unblacklist")
        .setDescription("Remove a server from the blacklist")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Name of the server")
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


// =========================
// STAFF CHECK
// =========================

function isStaff(interaction) {

    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (staffRoleId && interaction.member?.roles?.cache?.has(staffRoleId)) {
        return true;
    }

    return false;
}


// =========================
// COMMAND REGISTRATION
// =========================

async function registerCommands() {

    try {

        console.log("Registering ServerSpot commands...");

        const rest = new REST({ version: "10" }).setToken(token);

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


// =========================
// BOT READY
// =========================

client.once("ready", async () => {

    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} server(s).`);

    await registerCommands();

});


// =========================
// INTERACTIONS
// =========================

client.on("interactionCreate", async interaction => {

    try {

        // =========================
        // ADVERTISE MODAL
        // =========================

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
                .setRequired(true)
                .setMaxLength(100);

            const description = new TextInputBuilder()
                .setCustomId("server_description")
                .setLabel("Server Description")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            const invite = new TextInputBuilder()
                .setCustomId("server_invite")
                .setLabel("Discord Invite")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200);

            const category = new TextInputBuilder()
                .setCustomId("server_category")
                .setLabel("Category")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50);

            modal.addComponents(
                new ActionRowBuilder().addComponents(serverName),
                new ActionRowBuilder().addComponents(description),
                new ActionRowBuilder().addComponents(invite),
                new ActionRowBuilder().addComponents(category)
            );

            await interaction.showModal(modal);

            return;
        }


        // =========================
        // ADVERTISEMENT SUBMISSION
        // =========================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "advertise_modal"
        ) {

            const name = interaction.fields.getTextInputValue("server_name");
            const description = interaction.fields.getTextInputValue("server_description");
            const invite = interaction.fields.getTextInputValue("server_invite");
            const category = interaction.fields.getTextInputValue("server_category");

            const key = name.toLowerCase();

            if (blacklisted.has(key)) {

                await interaction.reply({
                    content: "This server is currently not permitted to advertise on ServerSpot.",
                    ephemeral: true
                });

                return;
            }

            advertisements.set(key, {
                name,
                description,
                invite,
                category,
                owner: interaction.user.id,
                status: "Pending",
                submittedAt: Date.now()
            });

            await interaction.reply({
                content:
                    "**Advertisement submitted successfully.**\n\n" +
                    `**Server:** ${name}\n` +
                    `**Category:** ${category}\n\n` +
                    "Your advertisement has been submitted for staff review.",
                ephemeral: true
            });

            console.log(`New advertisement submitted: ${name}`);

            return;
        }


        if (!interaction.isChatInputCommand()) return;


        // =========================
        // USER COMMANDS
        // =========================

        switch (interaction.commandName) {

            case "help":

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("ServerSpot Commands")
                            .setDescription(
                                "**User Commands**\n\n" +
                                "`/advertise` — Submit a server advertisement\n" +
                                "`/search` — Search for communities\n" +
                                "`/browse` — Browse server listings\n" +
                                "`/server` — View a server listing\n" +
                                "`/featured` — View featured servers\n" +
                                "`/categories` — Browse categories\n" +
                                "`/about` — Learn about ServerSpot\n" +
                                "`/rules` — View the guidelines\n" +
                                "`/help` — View this menu\n\n" +

                                "**Staff Commands**\n\n" +
                                "`/review` — Review advertisements\n" +
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

                break;


            case "about":

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("About ServerSpot")
                            .setDescription(
                                "ServerSpot is a platform designed to help people discover new Discord communities and give server owners a place to showcase their servers.\n\n" +
                                "Our goal is to make finding and advertising Discord communities simple, organised and accessible."
                            )
                            .setFooter({
                                text: "ServerSpot • Discover. Advertise. Connect."
                            })
                    ]
                });

                break;


            case "rules":

                await interaction.reply({
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
                            .setFooter({
                                text: "ServerSpot"
                            })
                    ]
                });

                break;


            case "categories":

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("ServerSpot Categories")
                            .setDescription(
                                "Available server categories include:\n\n" +
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

                break;


            case "browse": {

                const approved = [...advertisements.values()]
                    .filter(server => server.status === "Approved");

                if (approved.length === 0) {

                    await interaction.reply({
                        content: "There are currently no approved server listings.",
                        ephemeral: true
                    });

                    break;
                }

                const list = approved
                    .slice(0, 10)
                    .map(server =>
                        `**${server.name}**\n${server.category} • [Join Server](${server.invite})`
                    )
                    .join("\n\n");

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("ServerSpot Listings")
                            .setDescription(list)
                    ]
                });

                break;
            }


            case "search": {

                const query = interaction.options
                    .getString("query")
                    .toLowerCase();

                const results = [...advertisements.values()]
                    .filter(server =>
                        server.status === "Approved" &&
                        (
                            server.name.toLowerCase().includes(query) ||
                            server.description.toLowerCase().includes(query) ||
                            server.category.toLowerCase().includes(query)
                        )
                    );

                if (results.length === 0) {

                    await interaction.reply({
                        content: `No ServerSpot listings were found for **${query}**.`,
                        ephemeral: true
                    });

                    break;
                }

                const list = results
                    .slice(0, 10)
                    .map(server =>
                        `**${server.name}**\n${server.category} • [Join Server](${server.invite})`
                    )
                    .join("\n\n");

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`Search Results: ${query}`)
                            .setDescription(list)
                    ]
                });

                break;
            }


            case "server": {

                const name = interaction.options
                    .getString("name")
                    .toLowerCase();

                const server = advertisements.get(name);

                if (!server || server.status !== "Approved") {

                    await interaction.reply({
                        content: "That server could not be found.",
                        ephemeral: true
                    });

                    break;
                }

                await interaction.reply({
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
                                    name: "Join",
                                    value: `[Join Server](${server.invite})`,
                                    inline: true
                                }
                            )
                    ]
                });

                break;
            }


            case "featured": {

                const featuredServers = [...featured]
                    .map(name => advertisements.get(name))
                    .filter(server =>
                        server && server.status === "Approved"
                    );

                if (featuredServers.length === 0) {

                    await interaction.reply({
                        content: "There are currently no featured servers.",
                        ephemeral: true
                    });

                    break;
                }

                const list = featuredServers
                    .map(server =>
                        `**${server.name}**\n${server.description}\n[Join Server](${server.invite})`
                    )
                    .join("\n\n");

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Featured Servers")
                            .setDescription(list)
                    ]
                });

                break;
            }


            // =========================
            // STAFF COMMANDS
            // =========================

            case "review":

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const pending = [...advertisements.values()]
                    .filter(server => server.status === "Pending");

                if (pending.length === 0) {

                    await interaction.reply({
                        content: "There are currently no advertisements waiting for review.",
                        ephemeral: true
                    });

                    break;
                }

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Pending Advertisements")
                            .setDescription(
                                pending.map(server =>
                                    `**${server.name}**\n` +
                                    `Category: ${server.category}\n` +
                                    `Submitted by: <@${server.owner}>\n`
                                ).join("\n")
                            )
                    ],
                    ephemeral: true
                });

                break;


            case "approve": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const approveName = interaction.options
                    .getString("name")
                    .toLowerCase();

                const approveServer = advertisements.get(approveName);

                if (!approveServer) {

                    await interaction.reply({
                        content: "That advertisement could not be found.",
                        ephemeral: true
                    });

                    break;
                }

                approveServer.status = "Approved";

                await interaction.reply(
                    `**${approveServer.name}** has been approved and is now listed on ServerSpot.`
                );

                break;
            }


            case "reject": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const rejectName = interaction.options
                    .getString("name")
                    .toLowerCase();

                const rejectServer = advertisements.get(rejectName);

                if (!rejectServer) {

                    await interaction.reply({
                        content: "That advertisement could not be found.",
                        ephemeral: true
                    });

                    break;
                }

                advertisements.delete(rejectName);

                await interaction.reply(
                    `**${rejectServer.name}** has been rejected and removed from the review queue.`
                );

                break;
            }


            case "feature": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const featureName = interaction.options
                    .getString("name")
                    .toLowerCase();

                const featureServer = advertisements.get(featureName);

                if (!featureServer || featureServer.status !== "Approved") {

                    await interaction.reply({
                        content: "That server must be approved before it can be featured.",
                        ephemeral: true
                    });

                    break;
                }

                featured.add(featureName);

                await interaction.reply(
                    `**${featureServer.name}** is now a featured ServerSpot server.`
                );

                break;
            }


            case "unfeature": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const unfeatureName = interaction.options
                    .getString("name")
                    .toLowerCase();

                featured.delete(unfeatureName);

                await interaction.reply(
                    `**${unfeatureName}** has been removed from featured servers.`
                );

                break;
            }


            case "remove": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const removeName = interaction.options
                    .getString("name")
                    .toLowerCase();

                if (!advertisements.has(removeName)) {

                    await interaction.reply({
                        content: "That server could not be found.",
                        ephemeral: true
                    });

                    break;
                }

                advertisements.delete(removeName);
                featured.delete(removeName);

                await interaction.reply(
                    `**${removeName}** has been removed from ServerSpot.`
                );

                break;
            }


            case "blacklist": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const blacklistName = interaction.options
                    .getString("name")
                    .toLowerCase();

                blacklisted.add(blacklistName);
                advertisements.delete(blacklistName);
                featured.delete(blacklistName);

                await interaction.reply(
                    `**${blacklistName}** has been blacklisted from ServerSpot.`
                );

                break;
            }


            case "unblacklist": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const unblacklistName = interaction.options
                    .getString("name")
                    .toLowerCase();

                blacklisted.delete(unblacklistName);

                await interaction.reply(
                    `**${unblacklistName}** has been removed from the blacklist.`
                );

                break;
            }


            case "stats": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const total = advertisements.size;
                const approved = [...advertisements.values()]
                    .filter(server => server.status === "Approved").length;
                const pendingCount = [...advertisements.values()]
                    .filter(server => server.status === "Pending").length;

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("ServerSpot Statistics")
                            .addFields(
                                {
                                    name: "Total Listings",
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
                                    value: `${pendingCount}`,
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

                break;
            }


            case "announce": {

                if (!isStaff(interaction)) {

                    await interaction.reply({
                        content: "You do not have permission to use this command.",
                        ephemeral: true
                    });

                    break;
                }

                const message = interaction.options
                    .getString("message");

                await interaction.reply({
                    content:
                        "**ServerSpot Announcement**\n\n" +
                        message
                });

                break;
            }

        }

    } catch (error) {

        console.error("Interaction error:", error);

        if (!interaction.replied && !interaction.deferred) {

            await interaction.reply({
                content: "An unexpected error occurred while processing this command.",
                ephemeral: true
            });

        }

    }

});


// =========================
// LOGIN
// =========================

if (!token || !clientId) {

    console.error(
        "Missing DISCORD_TOKEN or CLIENT_ID environment variable."
    );

    process.exit(1);
}

client.login(token);
