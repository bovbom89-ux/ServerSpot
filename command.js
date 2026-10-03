const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const commands = [

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Submit your Discord server to ServerSpot."),

    new SlashCommandBuilder()
        .setName("discover")
        .setDescription("Browse approved ServerSpot communities."),

    new SlashCommandBuilder()
        .setName("random")
        .setDescription("Discover a random ServerSpot community."),

    new SlashCommandBuilder()
        .setName("server")
        .setDescription("Search for an advertised server.")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("The server name to search for.")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("View information about this Discord server."),

    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View ServerSpot statistics."),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot commands."),

    new SlashCommandBuilder()
        .setName("recent")
        .setDescription("View recently approved communities."),

    new SlashCommandBuilder()
        .setName("popular")
        .setDescription("View popular advertised communities."),

    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure ServerSpot.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("pending")
        .setDescription("View pending advertisements.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("review")
        .setDescription("Review an advertisement.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("advertisements")
        .setDescription("View the ServerSpot advertisement dashboard.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove an approved advertisement.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("edit")
        .setDescription("Edit an approved advertisement.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("announce")
        .setDescription("Send a ServerSpot announcement.")
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Announcement message.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("servercheck")
        .setDescription("Inspect an advertisement.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Advertisement ID.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

    new SlashCommandBuilder()
        .setName("health")
        .setDescription("View ServerSpot system health.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
];

module.exports = commands.map(command => command.toJSON());
