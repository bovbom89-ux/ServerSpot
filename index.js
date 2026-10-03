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
  ChannelType,
  MessageFlags
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const COLOR = 0xE00000;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID.");
  process.exit(1);
}

/* =========================
   SERVERSPOT DATABASE
========================= */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "serverspot-data.json");

let db = {
  guilds: {},
  ads: {},
  featured: [],
  verified: [],
  blacklisted: [],
  cooldowns: {},
  reviewNumber: 0
};

if (fs.existsSync(DATA_FILE)) {
  try {
    db = {
      ...db,
      ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    };
  } catch (error) {
    console.error("Could not load database:", error);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("Could not save database:", error);
  }
}

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================
   RENDER WEB SERVER
========================= */

const http = require("http");

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    res.end("ServerSpot is online.");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`Web server listening on port ${PORT}`);
  });

/* =========================
   HELPERS
========================= */

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "ServerSpot • Discover. Advertise. Connect."
    })
    .setTimestamp();
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function generateID() {
  db.reviewNumber++;

  return `SS-${String(db.reviewNumber).padStart(5, "0")}`;
}

function validDiscordInvite(url) {
  return /^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/i.test(
    url
  );
}

function validURL(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function getSettings(guildId) {
  return db.guilds[guildId];
}

function getApprovedAds() {
  return Object.values(db.ads).filter(
    ad => ad.status === "approved"
  );
}

function findAd(name) {
  return Object.values(db.ads).find(
    ad =>
      ad.name.toLowerCase() === name.toLowerCase()
  );
}

/* =========================
   PUBLIC ADVERTISEMENT EMBED
========================= */

function publicAdvertisement(ad) {
  const verified = db.verified.includes(ad.id);

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(ad.name)
    .setDescription(ad.description)
    .addFields(
      {
        name: "Category",
        value: ad.category || "Other",
        inline: true
      },
      {
        name: "Members",
        value: ad.members || "Not provided",
        inline: true
      },
      {
        name: "Status",
        value: verified
          ? "Verified"
          : "Approved",
        inline: true
      },
      {
        name: "Links",
        value:
          `[Join Discord](${ad.invite})\n` +
          `[Group / Game](${ad.group})`
      }
    )
    .setFooter({
      text: "ServerSpot • Discover. Advertise. Connect."
    })
    .setTimestamp();
}

/* =========================
   REVIEW EMBED
========================= */

function reviewEmbed(ad) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("ServerSpot Advertisement Review")
    .setDescription(
      "A new advertisement has been submitted and is waiting for staff review."
    )
    .addFields(
      {
        name: "Review ID",
        value: ad.reviewId,
        inline: true
      },
      {
        name: "Server",
        value: ad.name,
        inline: true
      },
      {
        name: "Category",
        value: ad.category || "Other",
        inline: true
      },
      {
        name: "Submitted By",
        value: `<@${ad.userId}>`,
        inline: true
      },
      {
        name: "Members",
        value: ad.members || "Not provided",
        inline: true
      },
      {
        name: "Status",
        value:
          ad.status.charAt(0).toUpperCase() +
          ad.status.slice(1),
        inline: true
      },
      {
        name: "Description",
        value: ad.description
      },
      {
        name: "Discord Invite",
        value: `[Open Invite](${ad.invite})`,
        inline: true
      },
      {
        name: "Group / Game",
        value: `[Open Link](${ad.group})`,
        inline: true
      }
    )
    .setFooter({
      text: "ServerSpot Staff Review"
    })
    .setTimestamp();
}

/* =========================
   REVIEW BUTTONS
========================= */

function reviewButtons(adId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_ad:${adId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`decline_ad:${adId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`details_ad:${adId}`)
      .setLabel("Details")
      .setStyle(ButtonStyle.Secondary)
  );
}

/* =========================
   COMMANDS
========================= */

const commands = [

  /* USER COMMANDS */

  new SlashCommandBuilder()
    .setName("advertise")
    .setDescription(
      "Submit your Discord server to ServerSpot."
    ),

  new SlashCommandBuilder()
    .setName("browse")
    .setDescription(
      "Browse approved ServerSpot advertisements."
    ),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription(
      "Search ServerSpot advertisements."
    )
    .addStringOption(option =>
      option
        .setName("query")
        .setDescription(
          "Search for a server."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription(
      "View an advertised server."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("myads")
    .setDescription(
      "View your advertisements."
    ),

  new SlashCommandBuilder()
    .setName("featured")
    .setDescription(
      "View featured servers."
    ),

  new SlashCommandBuilder()
    .setName("categories")
    .setDescription(
      "View ServerSpot categories."
    ),

  new SlashCommandBuilder()
    .setName("bump")
    .setDescription(
      "Bump your approved advertisement."
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "View ServerSpot commands."
    ),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription(
      "View ServerSpot guidelines."
    ),

  new SlashCommandBuilder()
    .setName("about")
    .setDescription(
      "Learn about ServerSpot."
    ),

  /* STAFF COMMANDS */

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "Configure ServerSpot."
    )
    .addChannelOption(option =>
      option
        .setName("logs")
        .setDescription(
          "Advertisement review channel."
        )
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("advertisements")
        .setDescription(
          "Public advertisement channel."
        )
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("audit")
        .setDescription(
          "Staff audit log channel."
        )
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("review")
    .setDescription(
      "View pending advertisements."
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription(
      "View ServerSpot statistics."
    ),

  new SlashCommandBuilder()
    .setName("feature")
    .setDescription(
      "Feature a server."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unfeature")
    .setDescription(
      "Remove a server from featured."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription(
      "Verify a server."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unverify")
    .setDescription(
      "Remove server verification."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription(
      "Remove a server advertisement."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription(
      "Blacklist a server name."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription(
      "Remove a server from the blacklist."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription(
          "Server name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription(
      "Create a ServerSpot announcement."
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription(
          "Announcement message."
        )
        .setRequired(true)
    )

].map(command => command.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */

async function registerCommands() {

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
}

/* =========================
   BOT READY
========================= */

client.once("clientReady", async () => {

  console.log(
    `ServerSpot is online as ${client.user.tag}`
  );

  console.log(
    `Serving ${client.guilds.cache.size} server(s).`
  );

  try {

    await registerCommands();

  } catch (error) {

    console.error(
      "Command registration failed:",
      error
    );

  }

});

/* =========================
   INTERACTIONS
========================= */

client.on(
  "interactionCreate",
  async interaction => {

    try {

      /* =====================
         BUTTONS
      ===================== */

      if (interaction.isButton()) {

        const parts =
          interaction.customId.split(":");

        const action = parts[0];
        const adId = parts[1];

        const ad = db.ads[adId];

        if (!ad) {

          return interaction.reply({
            content:
              "This advertisement no longer exists.",
            flags: MessageFlags.Ephemeral
          });

        }

        if (action === "details_ad") {

          return interaction.reply({
            embeds: [
              reviewEmbed(ad)
            ],
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          action === "accept_ad" ||
          action === "decline_ad"
        ) {

          if (!isStaff(interaction)) {

            return interaction.reply({
              content:
                "Only ServerSpot staff can review advertisements.",
              flags:
                MessageFlags.Ephemeral
            });

          }

        }

        /* =====================
           ACCEPT
        ===================== */

        if (action === "accept_ad") {

          await interaction.deferReply({
            flags:
              MessageFlags.Ephemeral
          });

          if (ad.status !== "pending") {

            return interaction.editReply(
              `This advertisement is already **${ad.status}**.`
            );

          }

          const settings =
            getSettings(ad.guildId);

          if (!settings) {

            return interaction.editReply(
              "ServerSpot has not been configured correctly. Please run `/setup`."
            );

          }

          const channel =
            await client.channels.fetch(
              settings.advertisementChannel
            ).catch(() => null);

          if (!channel || !channel.isTextBased()) {

            return interaction.editReply(
              "The public advertisement channel could not be found."
            );

          }

          ad.status = "approved";
          ad.approvedBy =
            interaction.user.id;
          ad.approvedAt =
            Date.now();

          saveDatabase();

          await channel.send({

            embeds: [
              publicAdvertisement(ad)
            ],

            components: [

              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setLabel(
                      "Join Discord"
                    )
                    .setStyle(
                      ButtonStyle.Link
                    )
                    .setURL(
                      ad.invite
                    ),

                  new ButtonBuilder()
                    .setLabel(
                      "Group / Game"
                    )
                    .setStyle(
                      ButtonStyle.Link
                    )
                    .setURL(
                      ad.group
                    )

                )

            ]

          });

          await interaction.message.edit({

            embeds: [
              reviewEmbed(ad)
            ],

            components: []

          }).catch(() => {});

          try {

            const user =
              await client.users.fetch(
                ad.userId
              );

            await user.send({

              embeds: [

                embed(
                  "Advertisement Approved",
                  `Your **${ad.name}** advertisement has been approved and published on ServerSpot.`
                )

              ]

            });

          } catch {}

          return interaction.editReply(
            "Advertisement approved and published successfully."
          );

        }

        /* =====================
           DECLINE
        ===================== */

        if (action === "decline_ad") {

          const modal =
            new ModalBuilder()
              .setCustomId(
                `decline_modal:${adId}`
              )
              .setTitle(
                "Decline Advertisement"
              );

          const reason =
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel(
                "Reason for declining"
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setPlaceholder(
                "Explain why this advertisement is being declined."
              )
              .setRequired(true)
              .setMaxLength(1000);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(reason)
          );

          return interaction.showModal(
            modal
          );

        }

      }

      /* =====================
         ADVERTISE MODAL
      ===================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "advertise_modal"
      ) {

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const settings =
          getSettings(
            interaction.guild.id
          );

        if (!settings) {

          return interaction.editReply(
            "ServerSpot has not been configured yet. Ask a server administrator to run `/setup`."
          );

        }

        const serverName =
          interaction.fields.getTextInputValue(
            "server_name"
          ).trim();

        const description =
          interaction.fields.getTextInputValue(
            "description"
          ).trim();

        const invite =
          interaction.fields.getTextInputValue(
            "invite"
          ).trim();

        const group =
          interaction.fields.getTextInputValue(
            "group"
          ).trim();

        const category =
          interaction.fields.getTextInputValue(
            "category"
          ).trim();

        if (!validDiscordInvite(invite)) {

          return interaction.editReply(
            "Please provide a valid Discord invite link."
          );

        }

        if (!validURL(group)) {

          return interaction.editReply(
            "Please provide a valid group or game link."
          );

        }

        const duplicate =
          Object.values(db.ads).find(
            ad =>
              ad.status !== "removed" &&
              (
                ad.name.toLowerCase() ===
                  serverName.toLowerCase() ||
                ad.invite.toLowerCase() ===
                  invite.toLowerCase()
              )
          );

        if (duplicate) {

          return interaction.editReply(
            "This server already has an active or pending advertisement."
          );

        }

        if (
          db.blacklisted.some(
            name =>
              name.toLowerCase() ===
              serverName.toLowerCase()
          )
        ) {

          return interaction.editReply(
            "This server is currently blacklisted from ServerSpot."
          );

        }

        const id =
          `AD-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;

        const ad = {

          id,

          reviewId:
            generateID(),

          guildId:
            interaction.guild.id,

          userId:
            interaction.user.id,

          name:
            serverName,

          description,

          invite,

          group,

          category,

          members:
            "Not provided",

          status:
            "pending",

          submittedAt:
            Date.now()

        };

        db.ads[id] = ad;

        saveDatabase();

        const logs =
          await client.channels.fetch(
            settings.logsChannel
          ).catch(() => null);

        if (!logs || !logs.isTextBased()) {

          delete db.ads[id];

          saveDatabase();

          return interaction.editReply(
            "The advertisement logs channel could not be found."
          );

        }

        try {

          await logs.send({

            embeds: [
              reviewEmbed(ad)
            ],

            components: [
              reviewButtons(id)
            ]

          });

        } catch (error) {

          console.error(
            "Could not send advertisement review:",
            error
          );

          delete db.ads[id];

          saveDatabase();

          return interaction.editReply(
            "I couldn't send your advertisement to the staff review channel."
          );

        }

        return interaction.editReply({

          embeds: [

            embed(
              "Advertisement Submitted",
              `Your advertisement for **${serverName}** has been sent to the ServerSpot staff team for review.\n\n**Review ID:** \`${ad.reviewId}\`\n**Status:** Pending Review`
            )

          ]

        });

      }

      /* =====================
         DECLINE MODAL
      ===================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          "decline_modal:"
        )
      ) {

        if (!isStaff(interaction)) {

          return interaction.reply({
            content:
              "Only ServerSpot staff can decline advertisements.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const adId =
          interaction.customId.split(":")[1];

        const ad =
          db.ads[adId];

        if (!ad) {

          return interaction.editReply(
            "Advertisement not found."
          );

        }

        if (ad.status !== "pending") {

          return interaction.editReply(
            `This advertisement is already **${ad.status}**.`
          );

        }

        const reason =
          interaction.fields
            .getTextInputValue(
              "reason"
            )
            .trim();

        ad.status =
          "declined";

        ad.declinedBy =
          interaction.user.id;

        ad.declineReason =
          reason;

        ad.declinedAt =
          Date.now();

        saveDatabase();

        await interaction.editReply(
          "Advertisement declined successfully."
        );

        try {

          const user =
            await client.users.fetch(
              ad.userId
            );

          await user.send({

            embeds: [

              embed(
                "Advertisement Declined",
                `Your **${ad.name}** advertisement was declined by the ServerSpot staff team.`
              ).addFields({
                name: "Reason",
                value:
                  reason
              })

            ]

          });

        } catch {}

        return;

      }

      /* =====================
         SLASH COMMANDS
      ===================== */

      if (
        !interaction.isChatInputCommand()
      ) return;

      /* =====================
         ADVERTISE
      ===================== */

      if (
        interaction.commandName ===
        "advertise"
      ) {

        const settings =
          getSettings(
            interaction.guild.id
          );

        if (!settings) {

          return interaction.reply({
            content:
              "ServerSpot has not been configured yet. Ask an administrator to run `/setup`.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "advertise_modal"
            )
            .setTitle(
              "ServerSpot Advertisement"
            );

        const serverName =
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
              "Tell people about your community..."
            )
            .setRequired(true)
            .setMaxLength(1000);

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
              "Group / Game Link"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setPlaceholder(
              "https://example.com/group"
            )
            .setRequired(true)
            .setMaxLength(300);

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
            .addComponents(
              serverName
            ),

          new ActionRowBuilder()
            .addComponents(
              description
            ),

          new ActionRowBuilder()
            .addComponents(
              invite
            ),

          new ActionRowBuilder()
            .addComponents(
              group
            ),

          new ActionRowBuilder()
            .addComponents(
              category
            )

        );

        return interaction.showModal(
          modal
        );

      }

      /* =====================
         STAFF CHECK
      ===================== */

      const staffCommands = [

        "setup",
        "review",
        "stats",
        "feature",
        "unfeature",
        "verify",
        "unverify",
        "remove",
        "blacklist",
        "unblacklist",
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
          flags:
            MessageFlags.Ephemeral
        });

      }

      /* =====================
         SETUP
      ===================== */

      if (
        interaction.commandName ===
        "setup"
      ) {

        const logs =
          interaction.options.getChannel(
            "logs"
          );

        const advertisements =
          interaction.options.getChannel(
            "advertisements"
          );

        const audit =
          interaction.options.getChannel(
            "audit"
          );

        db.guilds[
          interaction.guild.id
        ] = {

          logsChannel:
            logs.id,

          advertisementChannel:
            advertisements.id,

          auditChannel:
            audit.id

        };

        saveDatabase();

        return interaction.reply({

          embeds: [

            embed(
              "ServerSpot Setup Complete",
              "ServerSpot has been configured successfully."
            ).addFields(

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
                  `${advertisements}`
              },

              {
                name:
                  "Audit Logs",
                value:
                  `${audit}`
              }

            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         BROWSE
      ===================== */

      if (
        interaction.commandName ===
        "browse"
      ) {

        const ads =
          getApprovedAds()
            .slice(0, 10);

        if (!ads.length) {

          return interaction.reply({
            content:
              "There are currently no approved advertisements.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({

          embeds: [

            embed(
              "ServerSpot Directory",
              ads.map(
                ad =>
                  `**${ad.name}**\n${ad.category || "Other"}\n[Join Discord](${ad.invite})`
              ).join("\n\n")
            )

          ]

        });

      }

      /* =====================
         SEARCH
      ===================== */

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
          getApprovedAds()
            .filter(ad =>
              `${ad.name} ${ad.description} ${ad.category}`
                .toLowerCase()
                .includes(query)
            )
            .slice(0, 10);

        if (!results.length) {

          return interaction.reply({
            content:
              "No matching servers were found.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({

          embeds: [

            embed(
              `Search Results: ${query}`,
              results.map(
                ad =>
                  `**${ad.name}**\n${ad.category || "Other"}\n[Join Discord](${ad.invite})`
              ).join("\n\n")
            )

          ]

        });

      }

      /* =====================
         SERVER
      ===================== */

      if (
        interaction.commandName ===
        "server"
      ) {

        const name =
          interaction.options
            .getString(
              "name"
            );

        const ad =
          findAd(name);

        if (
          !ad ||
          ad.status !==
            "approved"
        ) {

          return interaction.reply({
            content:
              "That approved server could not be found.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({
          embeds: [
            publicAdvertisement(ad)
          ]
        });

      }

      /* =====================
         MY ADS
      ===================== */

      if (
        interaction.commandName ===
        "myads"
      ) {

        const ads =
          Object.values(db.ads)
            .filter(
              ad =>
                ad.userId ===
                interaction.user.id
            );

        if (!ads.length) {

          return interaction.reply({
            content:
              "You don't have any advertisements.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({

          embeds: [

            embed(
              "Your Advertisements",
              ads.map(
                ad =>
                  `**${ad.name}**\nStatus: **${ad.status}**\nReview ID: \`${ad.reviewId}\``
              ).join("\n\n")
            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         FEATURED
      ===================== */

      if (
        interaction.commandName ===
        "featured"
      ) {

        const ads =
          db.featured
            .map(id => db.ads[id])
            .filter(
              ad =>
                ad &&
                ad.status ===
                  "approved"
            );

        if (!ads.length) {

          return interaction.reply({
            content:
              "There are currently no featured servers.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({

          embeds: [

            embed(
              "Featured Servers",
              ads.map(
                ad =>
                  `**${ad.name}**\n${ad.description}\n[Join Discord](${ad.invite})`
              ).join("\n\n")
            )

          ]

        });

      }

      /* =====================
         CATEGORIES
      ===================== */

      if (
        interaction.commandName ===
        "categories"
      ) {

        const categories = {};

        for (
          const ad of getApprovedAds()
        ) {

          const category =
            ad.category ||
            "Other";

          categories[category] =
            (categories[category] || 0) +
            1;

        }

        const output =
          Object.entries(
            categories
          )
            .map(
              ([name, count]) =>
                `**${name}** — ${count}`
            )
            .join("\n") ||
          "No categories yet.";

        return interaction.reply({

          embeds: [
            embed(
              "ServerSpot Categories",
              output
            )
          ]

        });

      }

      /* =====================
         BUMP
      ===================== */

      if (
        interaction.commandName ===
        "bump"
      ) {

        const ad =
          Object.values(db.ads)
            .find(
              ad =>
                ad.userId ===
                  interaction.user.id &&
                ad.status ===
                  "approved"
            );

        if (!ad) {

          return interaction.reply({
            content:
              "You don't have an approved advertisement to bump.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        ad.bumpedAt =
          Date.now();

        saveDatabase();

        return interaction.reply({

          embeds: [

            embed(
              "Advertisement Bumped",
              `**${ad.name}** has been bumped successfully.`
            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         REVIEW
      ===================== */

      if (
        interaction.commandName ===
        "review"
      ) {

        const pending =
          Object.values(db.ads)
            .filter(
              ad =>
                ad.status ===
                "pending"
            );

        if (!pending.length) {

          return interaction.reply({
            content:
              "There are no pending advertisements.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        return interaction.reply({

          embeds: [

            embed(
              "Pending Advertisements",
              pending.map(
                ad =>
                  `**${ad.name}** — \`${ad.reviewId}\` — <@${ad.userId}>`
              ).join("\n")
            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         STATS
      ===================== */

      if (
        interaction.commandName ===
        "stats"
      ) {

        const ads =
          Object.values(db.ads);

        return interaction.reply({

          embeds: [

            embed(
              "ServerSpot Statistics",
              `**Total Listings:** ${ads.length}\n` +
              `**Approved:** ${ads.filter(a => a.status === "approved").length}\n` +
              `**Pending:** ${ads.filter(a => a.status === "pending").length}\n` +
              `**Declined:** ${ads.filter(a => a.status === "declined").length}\n` +
              `**Featured:** ${db.featured.length}\n` +
              `**Verified:** ${db.verified.length}`
            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         FEATURE / VERIFY / REMOVE
      ===================== */

      if (
        [
          "feature",
          "unfeature",
          "verify",
          "unverify",
          "remove"
        ].includes(
          interaction.commandName
        )
      ) {

        const name =
          interaction.options
            .getString(
              "name"
            );

        const ad =
          findAd(name);

        if (!ad) {

          return interaction.reply({
            content:
              "That server could not be found.",
            flags:
              MessageFlags.Ephemeral
          });

        }

        if (
          interaction.commandName ===
          "feature"
        ) {

          if (
            !db.featured.includes(
              ad.id
            )
          ) {

            db.featured.push(
              ad.id
            );

          }

          saveDatabase();

          return interaction.reply(
            `**${ad.name}** has been featured.`
          );

        }

        if (
          interaction.commandName ===
          "unfeature"
        ) {

          db.featured =
            db.featured.filter(
              id =>
                id !== ad.id
            );

          saveDatabase();

          return interaction.reply(
            `**${ad.name}** has been removed from featured.`
          );

        }

        if (
          interaction.commandName ===
          "verify"
        ) {

          if (
            !db.verified.includes(
              ad.id
            )
          ) {

            db.verified.push(
              ad.id
            );

          }

          saveDatabase();

          return interaction.reply(
            `**${ad.name}** has been verified.`
          );

        }

        if (
          interaction.commandName ===
          "unverify"
        ) {

          db.verified =
            db.verified.filter(
              id =>
                id !== ad.id
            );

          saveDatabase();

          return interaction.reply(
            `Verification removed from **${ad.name}**.`
          );

        }

        if (
          interaction.commandName ===
          "remove"
        ) {

          ad.status =
            "removed";

          db.featured =
            db.featured.filter(
              id =>
                id !== ad.id
            );

          db.verified =
            db.verified.filter(
              id =>
                id !== ad.id
            );

          saveDatabase();

          return interaction.reply(
            `**${ad.name}** has been removed from ServerSpot.`
          );

        }

      }

      /* =====================
         BLACKLIST
      ===================== */

      if (
        interaction.commandName ===
        "blacklist"
      ) {

        const name =
          interaction.options
            .getString(
              "name"
            );

        if (
          !db.blacklisted.includes(
            name
          )
        ) {

          db.blacklisted.push(
            name
          );

        }

        saveDatabase();

        return interaction.reply(
          `**${name}** has been blacklisted.`
        );

      }

      /* =====================
         UNBLACKLIST
      ===================== */

      if (
        interaction.commandName ===
        "unblacklist"
      ) {

        const name =
          interaction.options
            .getString(
              "name"
            );

        db.blacklisted =
          db.blacklisted.filter(
            item =>
              item.toLowerCase() !==
              name.toLowerCase()
          );

        saveDatabase();

        return interaction.reply(
          `**${name}** has been removed from the blacklist.`
        );

      }

      /* =====================
         ANNOUNCE
      ===================== */

      if (
        interaction.commandName ===
        "announce"
      ) {

        const message =
          interaction.options
            .getString(
              "message"
            );

        return interaction.reply({

          embeds: [

            embed(
              "ServerSpot Announcement",
              message
            )

          ]

        });

      }

      /* =====================
         HELP
      ===================== */

      if (
        interaction.commandName ===
        "help"
      ) {

        return interaction.reply({

          embeds: [

            embed(
              "ServerSpot Commands",

              "**User Commands**\n" +
              "`/advertise` — Submit a server\n" +
              "`/browse` — Browse servers\n" +
              "`/search` — Search servers\n" +
              "`/server` — View a server\n" +
              "`/myads` — View your advertisements\n" +
              "`/featured` — Featured servers\n" +
              "`/categories` — Browse categories\n" +
              "`/bump` — Bump your server\n" +
              "`/rules` — View guidelines\n" +
              "`/about` — About ServerSpot\n\n" +

              "**Staff Commands**\n" +
              "`/setup` — Configure ServerSpot\n" +
              "`/review` — View pending ads\n" +
              "`/stats` — View statistics\n" +
              "`/feature` — Feature a server\n" +
              "`/unfeature` — Remove featured status\n" +
              "`/verify` — Verify a server\n" +
              "`/unverify` — Remove verification\n" +
              "`/remove` — Remove a listing\n" +
              "`/blacklist` — Blacklist a server\n" +
              "`/unblacklist` — Remove blacklist\n" +
              "`/announce` — Send an announcement"
            )

          ],

          flags:
            MessageFlags.Ephemeral

        });

      }

      /* =====================
         RULES
      ===================== */

      if (
        interaction.commandName ===
        "rules"
      ) {

        return interaction.reply({

          embeds: [

            embed(

              "ServerSpot Guidelines",

              "**1. Respect others**\n" +
              "Treat members, server owners and staff respectfully.\n\n" +

              "**2. Keep it appropriate**\n" +
              "Do not advertise harmful, explicit or disturbing content.\n\n" +

              "**3. No discrimination**\n" +
              "Hate speech and discriminatory behaviour are not allowed.\n\n" +

              "**4. No spam or abuse**\n" +
              "Do not spam advertisements or abuse ServerSpot features.\n\n" +

              "**5. Advertise honestly**\n" +
              "Server information must be accurate and not misleading.\n\n" +

              "**6. Follow Discord rules**\n" +
              "All users and advertised servers must follow Discord's Terms of Service and Community Guidelines."

            )

          ]

        });

      }

      /* =====================
         ABOUT
      ===================== */

      if (
        interaction.commandName ===
        "about"
      ) {

        return interaction.reply({

          embeds: [

            embed(

              "About ServerSpot",

              "ServerSpot is a platform designed to help people discover new Discord communities while giving server owners a professional place to showcase their communities.\n\n" +

              "**Discover. Advertise. Connect.**"

            )

          ]

        });

      }

    } catch (error) {

      console.error(
        "Interaction error:",
        error
      );

      try {

        if (
          interaction.isRepliable()
        ) {

          if (
            interaction.deferred
          ) {

            await interaction.editReply(
              "Something went wrong while processing that request."
            );

          } else if (
            !interaction.replied
          ) {

            await interaction.reply({

              content:
                "Something went wrong while processing that request.",

              flags:
                MessageFlags.Ephemeral

            });

          }

        }

      } catch {}

    }

  }
);

/* =========================
   ERROR PROTECTION
========================= */

client.on(
  "error",
  error => {
    console.error(
      "Discord client error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
