const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const commands = [
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View ServerSpot bot commands"),

    new SlashCommandBuilder()
        .setName("rules")
        .setDescription("View the ServerSpot guidelines"),

    new SlashCommandBuilder()
        .setName("about")
        .setDescription("Learn more about ServerSpot"),

    new SlashCommandBuilder()
        .setName("advertise")
        .setDescription("Get information about advertising your server"),

    new SlashCommandBuilder()
        .setName("featured")
        .setDescription("View information about featured servers")
].map(command => command.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or CLIENT_ID environment variable.");
    process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function registerCommands() {
    try {
        console.log("Registering ServerSpot commands...");

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log("ServerSpot commands registered successfully.");
    } catch (error) {
        console.error("Command registration failed:", error);
    }
}

client.once("ready", async () => {
    console.log(`ServerSpot is online as ${client.user.tag}`);
    console.log(`Serving ${client.guilds.cache.size} server(s).`);

    await registerCommands();
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {

        case "help":
            await interaction.reply({
                content:
                    "**ServerSpot Help**\n\n" +
                    "`/about` — Learn about ServerSpot\n" +
                    "`/advertise` — Advertising information\n" +
                    "`/featured` — Featured server information\n" +
                    "`/rules` — View ServerSpot guidelines\n" +
                    "`/help` — View this menu",
                ephemeral: true
            });
            break;

        case "about":
            await interaction.reply({
                content:
                    "**ServerSpot**\n\n" +
                    "ServerSpot is a platform designed to help users discover new Discord communities and give server owners a place to showcase their servers.\n\n" +
                    "**Discover. Advertise. Connect.**",
                ephemeral: true
            });
            break;

        case "advertise":
            await interaction.reply({
                content:
                    "**Advertising on ServerSpot**\n\n" +
                    "Server owners can submit their communities through the official ServerSpot advertising system.\n\n" +
                    "Please make sure your advertisement contains accurate information and that your server follows Discord's rules and ServerSpot's guidelines.",
                ephemeral: true
            });
            break;

        case "featured":
            await interaction.reply({
                content:
                    "**Featured Servers**\n\n" +
                    "Featured status is reserved for servers selected by the ServerSpot team.\n\n" +
                    "Featured placement is not guaranteed and may be changed or removed at any time.",
                ephemeral: true
            });
            break;

        case "rules":
            await interaction.reply({
                content:
                    "**ServerSpot Guidelines**\n\n" +
                    "**1. Respect others**\n" +
                    "Treat members, server owners and staff appropriately.\n\n" +
                    "**2. Keep it appropriate**\n" +
                    "Do not share explicit, excessively violent or inappropriate content.\n\n" +
                    "**3. No discrimination**\n" +
                    "Discrimination and hate speech are not permitted.\n\n" +
                    "**4. No spam or abuse**\n" +
                    "Do not spam, manipulate listings or abuse ServerSpot systems.\n\n" +
                    "**5. Follow Discord's rules**\n" +
                    "All users and advertised servers must follow Discord's Terms of Service and Community Guidelines.",
                ephemeral: true
            });
            break;
    }
});

client.login(token);
