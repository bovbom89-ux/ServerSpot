const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const BRAND = "#E00000";
const DATA_FILE = path.join(__dirname, "serverspot-data.json");

if (!TOKEN) {
  console.error("Missing TOKEN environment variable.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("Missing CLIENT_ID environment variable.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* ---------------- DATA ---------------- */

function defaultData() {
  return {
    guilds: {},
    advertisements: {},
    blacklist: [],
    users: {},
    nextAdvertisementId: 1
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = defaultData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return data;
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Failed to load data:", error);
    return defaultData();
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Failed to save data:", error);
  }
}

/* ---------------- HELPERS ---------------- */

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      logsChannel: null,
      featuredChannel: null,
      staffRole: null,
      reportChannel: null,
      suggestionChannel: null
    };

    saveData();
  }

  return db.guilds[guildId];
}

function isStaff(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (config.staffRole && interaction.member.roles.cache.has(config.staffRole)) {
    return true;
  }

  return false;
}

function cleanInvite(invite) {
  return invite
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^discord\.gg\//i, "")
    .replace(/^discord\.com\/invite\//i, "")
    .split(/[/?#]/)[0];
}

function validInvite(invite) {
  const cleaned = cleanInvite(invite);
  return /^[a-zA-Z0-9-]+$/.test(cleaned) && cleaned.length >= 2;
}

function makeId() {
  const id = String(db.nextAdvertisementId++).padStart(5, "0");
  saveData();
  return `SS-${id}`;
}

function ensureUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      submitted: 0,
      accepted: 0,
      declined: 0,
      reports: 0,
      joined: Date.now()
    };

    saveData();
  }

  return db.users[userId];
}

function formatNumber(number) {
  return Number(number || 0).toLocaleString("en-GB");
}

function truncate(text, length = 1000) {
  if (!text) return "Not provided";
  return text.length > length
    ? `${text.slice(0, length - 3)}...`
    : text;
}

function baseEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(title)
    .setDescription(description || "")
    .setTimestamp()
    .setFooter({ text: "ServerSpot • Discover. Advertise. Connect." });
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    if (error.code === 10062) {
      console.warn("Interaction expired before it could be answered.");
      return null;
    }

    console.error("Interaction response error:", error);
    return null;
  }
}

async function safeFollowUp(interaction, payload) {
  try {
    return await interaction.followUp(payload);
  } catch (error) {
    console.error("Follow-up error:", error);
    return null;
  }
}

/* ---------------- SERVER LOOKUP ---------------- */

function discordApi(pathname) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "discord.com",
        path: `/api/v10${pathname}`,
        method: "GET",
        headers: {
          Authorization: `Bot ${TOKEN}`,
          "User-Agent": "ServerSpot/2.0"
        }
      },
      response => {
        let body = "";

        response.on("data", chunk => {
          body += chunk;
        });

        response.on("end", () => {
          try {
            const parsed = JSON.parse(body);

            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(parsed);
            } else {
              reject({
                status: response.statusCode,
                data: parsed
              });
            }
          } catch {
            reject({
              status: response.statusCode,
              data: body
            });
          }
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

async function lookupInvite(inviteCode) {
  return discordApi(
    `/invites/${encodeURIComponent(inviteCode)}?with_counts=true&with_expiration=true`
  );
}

function serverStatus(inviteData) {
  if (!inviteData || !inviteData.guild) {
    return "Unavailable";
  }

  return "Online";
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName("advertise")
    .setDescription("Submit a server advertisement to ServerSpot."),

  new SlashCommandBuilder()
    .setName("featured")
    .setDescription("View a featured ServerSpot server."),

  new SlashCommandBuilder()
    .setName("servers")
    .setDescription("Browse approved ServerSpot servers."),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search approved ServerSpot servers.")
    .addStringOption(option =>
      option
        .setName("query")
        .setDescription("Server name or category")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Discover a random approved server."),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View information about a ServerSpot server.")
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Advertisement ID, e.g. SS-00001")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("categories")
    .setDescription("View ServerSpot categories."),

  new SlashCommandBuilder()
    .setName("myadvertisements")
    .setDescription("View your ServerSpot advertisements."),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your ServerSpot profile."),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report an advertised server.")
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Advertisement ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Send a suggestion to ServerSpot staff.")
    .addStringOption(option =>
      option
        .setName("suggestion")
        .setDescription("Your suggestion")
        .setRequired(true)
        .setMaxLength(1000)
    ),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check ServerSpot's latency."),

  new SlashCommandBuilder()
    .setName("about")
    .setDescription("Learn about ServerSpot."),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View ServerSpot commands."),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View ServerSpot statistics."),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure ServerSpot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addChannelOption(option =>
      option
        .setName("logs")
        .setDescription("Advertisement review/log channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("featured")
        .setDescription("Featured servers channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("staff")
        .setDescription("ServerSpot staff role")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("reports")
        .setDescription("Report channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName("suggestions")
        .setDescription("Suggestion channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("View ServerSpot configuration.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString()),

  new SlashCommandBuilder()
    .setName("feature")
    .setDescription("Feature an approved advertisement.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Advertisement ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unfeature")
    .setDescription("Remove an advertisement from featured status.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Advertisement ID")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist a Discord server invite.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addStringOption(option =>
      option
        .setName("invite")
        .setDescription("Server invite")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Remove a server from the blacklist.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addStringOption(option =>
      option
        .setName("invite")
        .setDescription("Server invite")
        .setRequired(true)
    )
].map(command => command.toJSON());

/* ---------------- REGISTER ---------------- */

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
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

/* ---------------- ADVERTISEMENT EMBED ---------------- */

function advertisementEmbed(ad, status = "Pending") {
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${ad.serverName}`)
    .setDescription(truncate(ad.description, 4000))
    .addFields(
      {
        name: "Status",
        value: `[${status}]`,
        inline: true
      },
      {
        name: "Members",
        value: `[${formatNumber(ad.members)}]`,
        inline: true
      },
      {
        name: "Category",
        value: `[${ad.category}]`,
        inline: true
      },
      {
        name: "Advertisement ID",
        value: `\`${ad.id}\``,
        inline: true
      },
      {
        name: "Submitted By",
        value: `<@${ad.userId}>`,
        inline: true
      },
      {
        name: "Server Link",
        value: `[Join Server](${ad.inviteUrl})`,
        inline: true
      }
    )
    .setTimestamp()
    .setFooter({
      text: "ServerSpot • Discover. Advertise. Connect."
    });

  if (ad.icon) {
    embed.setThumbnail(ad.icon);
  }

  if (ad.communityLink) {
    embed.addFields({
      name: "Community Link",
      value: `[Open Community](${ad.communityLink})`,
      inline: false
    });
  }

  return embed;
}

function advertisementButtons(id, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ad_accept:${id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`ad_decline:${id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

/* ---------------- READY ---------------- */

client.once("ready", async () => {
  console.log(`ServerSpot is online as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s).`);

  await registerCommands();

  client.user.setActivity("/help • Server discovery", {
    type: 3
  });
});

/* ---------------- INTERACTIONS ---------------- */

client.on("interactionCreate", async interaction => {
  try {
    /* ---------- BUTTONS ---------- */

    if (interaction.isButton()) {
      const [action, id] = interaction.customId.split(":");

      if (!action.startsWith("ad_")) return;

      if (!isStaff(interaction)) {
        return safeReply(interaction, {
          content: "You do not have permission to review advertisements.",
          ephemeral: true
        });
      }

      const ad = db.advertisements[id];

      if (!ad) {
        return safeReply(interaction, {
          content: "This advertisement could not be found.",
          ephemeral: true
        });
      }

      if (ad.status !== "pending") {
        return safeReply(interaction, {
          content: `This advertisement has already been **${ad.status}**.`,
          ephemeral: true
        });
      }

      if (action === "ad_accept") {
        ad.status = "accepted";
        ad.reviewedBy = interaction.user.id;
        ad.reviewedAt = Date.now();

        ensureUser(ad.userId).accepted++;

        saveData();

        const config = getGuildConfig(interaction.guild.id);

        const featuredChannel =
          config.featuredChannel
            ? interaction.guild.channels.cache.get(config.featuredChannel)
            : null;

        const updatedEmbed = advertisementEmbed(ad, "Online");

        if (featuredChannel) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Join Server")
              .setStyle(ButtonStyle.Link)
              .setURL(ad.inviteUrl)
          );

          if (ad.communityLink) {
            row.addComponents(
              new ButtonBuilder()
                .setLabel("Community")
                .setStyle(ButtonStyle.Link)
                .setURL(ad.communityLink)
            );
          }

          await featuredChannel.send({
            embeds: [updatedEmbed],
            components: [row]
          });
        }

        await safeReply(interaction, {
          content: `Advertisement **${id}** has been accepted.`,
          ephemeral: true
        });

        try {
          await interaction.message.edit({
            embeds: [
              advertisementEmbed(
                ad,
                "Accepted"
              )
            ],
            components: [
              advertisementButtons(id, true)
            ]
          });
        } catch (error) {
          console.error("Failed to update review message:", error);
        }

        return;
      }

      if (action === "ad_decline") {
        const modal = new ModalBuilder()
          .setCustomId(`decline_modal:${id}`)
          .setTitle("Decline Advertisement");

        const reason = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason for declining")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setPlaceholder("Explain why this advertisement was declined.");

        modal.addComponents(
          new ActionRowBuilder().addComponents(reason)
        );

        return interaction.showModal(modal);
      }
    }

    /* ---------- MODAL ---------- */

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("decline_modal:")) {
        const id = interaction.customId.split(":")[1];
        const ad = db.advertisements[id];

        if (!ad) {
          return safeReply(interaction, {
            content: "Advertisement not found.",
            ephemeral: true
          });
        }

        if (!isStaff(interaction)) {
          return safeReply(interaction, {
            content: "You do not have permission to do this.",
            ephemeral: true
          });
        }

        if (ad.status !== "pending") {
          return safeReply(interaction, {
            content: "This advertisement has already been reviewed.",
            ephemeral: true
          });
        }

        const reason = interaction.fields.getTextInputValue("reason");

        ad.status = "declined";
        ad.reason = reason;
        ad.reviewedBy = interaction.user.id;
        ad.reviewedAt = Date.now();

        ensureUser(ad.userId).declined++;

        saveData();

        await safeReply(interaction, {
          content: `Advertisement **${id}** has been declined.`,
          ephemeral: true
        });

        const config = getGuildConfig(interaction.guild.id);
        const logs = config.logsChannel
          ? interaction.guild.channels.cache.get(config.logsChannel)
          : null;

        if (logs) {
          await logs.send({
            embeds: [
              baseEmbed(
                "Advertisement Declined",
                `Advertisement **${id}** has been declined.`
              ).addFields(
                {
                  name: "Server",
                  value: ad.serverName,
                  inline: true
                },
                {
                  name: "Submitted By",
                  value: `<@${ad.userId}>`,
                  inline: true
                },
                {
                  name: "Reviewed By",
                  value: `<@${interaction.user.id}>`,
                  inline: true
                },
                {
                  name: "Reason",
                  value: truncate(reason, 1000)
                }
              )
            ]
          });
        }

        try {
          const message = await logs?.messages.fetch(ad.reviewMessageId);

          if (message) {
            await message.edit({
              embeds: [
                advertisementEmbed(ad, "Declined").addFields({
                  name: "Decline Reason",
                  value: truncate(reason, 1000)
                })
              ],
              components: [
                advertisementButtons(id, true)
              ]
            });
          }
        } catch {}

        return;
      }
    }

    /* ---------- CHAT COMMANDS ---------- */

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    /* ADVERTISE */

    if (command === "advertise") {
      const modal = new ModalBuilder()
        .setCustomId("advertise_modal")
        .setTitle("ServerSpot Advertisement");

      const invite = new TextInputBuilder()
        .setCustomId("invite")
        .setLabel("Discord Invite")
        .setPlaceholder("https://discord.gg/example")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

      const community = new TextInputBuilder()
        .setCustomId("community")
        .setLabel("Community / Website Link")
        .setPlaceholder("https://example.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      const description = new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Server Description")
        .setPlaceholder("Tell people what makes your server special.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const category = new TextInputBuilder()
        .setCustomId("category")
        .setLabel("Server Category")
        .setPlaceholder("Gaming, Community, Education, Social...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder().addComponents(invite),
        new ActionRowBuilder().addComponents(community),
        new ActionRowBuilder().addComponents(description),
        new ActionRowBuilder().addComponents(category)
      );

      return interaction.showModal(modal);
    }

    /* FEATURED */

    if (command === "featured") {
      const featured = Object.values(db.advertisements)
        .filter(ad => ad.status === "accepted")
        .slice(-1)[0];

      if (!featured) {
        return safeReply(interaction, {
          embeds: [
            baseEmbed(
              "Featured Servers",
              "There are currently no featured servers."
            )
          ]
        });
      }

      return safeReply(interaction, {
        embeds: [advertisementEmbed(featured, "Online")],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Join Server")
              .setStyle(ButtonStyle.Link)
              .setURL(featured.inviteUrl)
          )
        ]
      });
    }

    /* SERVERS */

    if (command === "servers") {
      const approved = Object.values(db.advertisements)
        .filter(ad => ad.status === "accepted")
        .slice(-10)
        .reverse();

      if (!approved.length) {
        return safeReply(interaction, {
          content: "There are currently no approved servers.",
          ephemeral: true
        });
      }

      const description = approved
        .map(ad =>
          `**${ad.serverName}** — ${formatNumber(ad.members)} members\n` +
          `ID: \`${ad.id}\` • Category: ${ad.category}`
        )
        .join("\n\n");

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Servers",
            truncate(description, 4000)
          )
        ]
      });
    }

    /* SEARCH */

    if (command === "search") {
      const query = interaction.options
        .getString("query")
        .toLowerCase();

      const results = Object.values(db.advertisements)
        .filter(ad =>
          ad.status === "accepted" &&
          (
            ad.serverName.toLowerCase().includes(query) ||
            ad.category.toLowerCase().includes(query) ||
            ad.description.toLowerCase().includes(query)
          )
        )
        .slice(0, 10);

      if (!results.length) {
        return safeReply(interaction, {
          content: "No matching servers were found.",
          ephemeral: true
        });
      }

      const description = results
        .map(ad =>
          `**${ad.serverName}**\n` +
          `${truncate(ad.description, 150)}\n` +
          `Members: **${formatNumber(ad.members)}** • Category: **${ad.category}** • \`${ad.id}\``
        )
        .join("\n\n");

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            `Search Results: ${query}`,
            description
          )
        ]
      });
    }

    /* RANDOM */

    if (command === "random") {
      const servers = Object.values(db.advertisements)
        .filter(ad => ad.status === "accepted");

      if (!servers.length) {
        return safeReply(interaction, {
          content: "There are no approved servers yet.",
          ephemeral: true
        });
      }

      const ad = servers[Math.floor(Math.random() * servers.length)];

      return safeReply(interaction, {
        embeds: [advertisementEmbed(ad, "Online")],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Join Server")
              .setStyle(ButtonStyle.Link)
              .setURL(ad.inviteUrl)
          )
        ]
      });
    }

    /* SERVER INFO */

    if (command === "serverinfo") {
      const id = interaction.options.getString("id").toUpperCase();
      const ad = db.advertisements[id];

      if (!ad) {
        return safeReply(interaction, {
          content: "No ServerSpot advertisement was found with that ID.",
          ephemeral: true
        });
      }

      return safeReply(interaction, {
        embeds: [
          advertisementEmbed(
            ad,
            ad.status === "accepted" ? "Online" : ad.status
          )
        ]
      });
    }

    /* CATEGORIES */

    if (command === "categories") {
      const categories = {};

      Object.values(db.advertisements)
        .filter(ad => ad.status === "accepted")
        .forEach(ad => {
          categories[ad.category] =
            (categories[ad.category] || 0) + 1;
        });

      const text = Object.entries(categories)
        .map(([name, count]) => `**${name}** — ${count} server(s)`)
        .join("\n");

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Categories",
            text || "No categories are available yet."
          )
        ]
      });
    }

    /* MY ADS */

    if (command === "myadvertisements") {
      const ads = Object.values(db.advertisements)
        .filter(ad => ad.userId === interaction.user.id)
        .slice(-10)
        .reverse();

      if (!ads.length) {
        return safeReply(interaction, {
          content: "You haven't submitted any advertisements yet.",
          ephemeral: true
        });
      }

      const text = ads
        .map(ad =>
          `**${ad.serverName}** — \`${ad.id}\`\nStatus: **${ad.status}**`
        )
        .join("\n\n");

      return safeReply(interaction, {
        embeds: [
          baseEmbed("Your Advertisements", text)
        ],
        ephemeral: true
      });
    }

    /* PROFILE */

    if (command === "profile") {
      const user = ensureUser(interaction.user.id);

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            `${interaction.user.username}'s ServerSpot Profile`,
            `**Advertisements Submitted:** ${user.submitted}\n` +
            `**Accepted:** ${user.accepted}\n` +
            `**Declined:** ${user.declined}\n` +
            `**Reports:** ${user.reports}`
          )
        ]
      });
    }

    /* REPORT */

    if (command === "report") {
      const id = interaction.options.getString("id").toUpperCase();
      const ad = db.advertisements[id];

      if (!ad) {
        return safeReply(interaction, {
          content: "That advertisement could not be found.",
          ephemeral: true
        });
      }

      ensureUser(interaction.user.id).reports++;

      const config = getGuildConfig(interaction.guild.id);
      const channelId = config.reportChannel || config.logsChannel;
      const channel = channelId
        ? interaction.guild.channels.cache.get(channelId)
        : null;

      if (channel) {
        await channel.send({
          embeds: [
            baseEmbed(
              "New Server Report",
              `A user has reported advertisement **${id}**.`
            ).addFields(
              {
                name: "Server",
                value: ad.serverName,
                inline: true
              },
              {
                name: "Reported By",
                value: `<@${interaction.user.id}>`,
                inline: true
              },
              {
                name: "Advertisement ID",
                value: id,
                inline: true
              }
            )
          ]
        });
      }

      saveData();

      return safeReply(interaction, {
        content: "Your report has been sent to ServerSpot staff.",
        ephemeral: true
      });
    }

    /* SUGGEST */

    if (command === "suggest") {
      const suggestion =
        interaction.options.getString("suggestion");

      const config = getGuildConfig(interaction.guild.id);

      const channelId =
        config.suggestionChannel || config.logsChannel;

      const channel = channelId
        ? interaction.guild.channels.cache.get(channelId)
        : null;

      if (channel) {
        await channel.send({
          embeds: [
            baseEmbed(
              "New ServerSpot Suggestion",
              suggestion
            ).addFields({
              name: "Submitted By",
              value: `<@${interaction.user.id}>`
            })
          ]
        });
      }

      return safeReply(interaction, {
        content: "Your suggestion has been submitted.",
        ephemeral: true
      });
    }

    /* PING */

    if (command === "ping") {
      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Ping",
            `Bot latency: **${client.ws.ping}ms**`
          )
        ]
      });
    }

    /* ABOUT */

    if (command === "about") {
      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "About ServerSpot",
            "ServerSpot helps people **discover, advertise and connect** with Discord communities.\n\n" +
            "Server owners can submit their communities for review while users can discover approved and featured servers."
          )
        ]
      });
    }

    /* HELP */

    if (command === "help") {
      const embed = baseEmbed(
        "ServerSpot Help",
        "Discover and advertise Discord communities."
      )
        .addFields(
          {
            name: "User Commands",
            value:
              "`/advertise`\n" +
              "`/featured`\n" +
              "`/servers`\n" +
              "`/search`\n" +
              "`/random`\n" +
              "`/serverinfo`\n" +
              "`/categories`\n" +
              "`/myadvertisements`\n" +
              "`/profile`\n" +
              "`/report`\n" +
              "`/suggest`\n" +
              "`/stats`\n" +
              "`/ping`\n" +
              "`/about`"
          },
          {
            name: "Staff Commands",
            value:
              "`/setup`\n" +
              "`/config`\n" +
              "`/feature`\n" +
              "`/unfeature`\n" +
              "`/blacklist`\n" +
              "`/unblacklist`"
          }
        );

      return safeReply(interaction, { embeds: [embed] });
    }

    /* STATS */

    if (command === "stats") {
      const all = Object.values(db.advertisements);

      const accepted =
        all.filter(ad => ad.status === "accepted").length;

      const pending =
        all.filter(ad => ad.status === "pending").length;

      const declined =
        all.filter(ad => ad.status === "declined").length;

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Statistics",
            `**Servers Listed:** ${accepted}\n` +
            `**Pending Advertisements:** ${pending}\n` +
            `**Declined Advertisements:** ${declined}\n` +
            `**Blacklisted Servers:** ${db.blacklist.length}\n` +
            `**Discord Servers:** ${client.guilds.cache.size}`
          )
        ]
      });
    }

    /* SETUP */

    if (command === "setup") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return safeReply(interaction, {
          content: "You need Administrator permission to use this command.",
          ephemeral: true
        });
      }

      const config = getGuildConfig(interaction.guild.id);

      config.logsChannel =
        interaction.options.getChannel("logs").id;

      config.featuredChannel =
        interaction.options.getChannel("featured").id;

      config.staffRole =
        interaction.options.getRole("staff").id;

      const reports =
        interaction.options.getChannel("reports");

      const suggestions =
        interaction.options.getChannel("suggestions");

      config.reportChannel =
        reports ? reports.id : config.logsChannel;

      config.suggestionChannel =
        suggestions ? suggestions.id : config.logsChannel;

      saveData();

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Configured",
            "ServerSpot has been configured successfully."
          ).addFields(
            {
              name: "Advertisement Logs",
              value: `<#${config.logsChannel}>`
            },
            {
              name: "Featured Servers",
              value: `<#${config.featuredChannel}>`
            },
            {
              name: "Staff Role",
              value: `<@&${config.staffRole}>`
            }
          )
        ]
      });
    }

    /* CONFIG */

    if (command === "config") {
      if (!isStaff(interaction)) {
        return safeReply(interaction, {
          content: "You do not have permission to view the configuration.",
          ephemeral: true
        });
      }

      const config = getGuildConfig(interaction.guild.id);

      return safeReply(interaction, {
        embeds: [
          baseEmbed(
            "ServerSpot Configuration",
            "Current ServerSpot settings."
          ).addFields(
            {
              name: "Advertisement Logs",
              value: config.logsChannel
                ? `<#${config.logsChannel}>`
                : "Not configured",
              inline: true
            },
            {
              name: "Featured Channel",
              value: config.featuredChannel
                ? `<#${config.featuredChannel}>`
                : "Not configured",
              inline: true
            },
            {
              name: "Staff Role",
              value: config.staffRole
                ? `<@&${config.staffRole}>`
                : "Not configured",
              inline: true
            },
            {
              name: "Reports",
              value: config.reportChannel
                ? `<#${config.reportChannel}>`
                : "Not configured",
              inline: true
            },
            {
              name: "Suggestions",
              value: config.suggestionChannel
                ? `<#${config.suggestionChannel}>`
                : "Not configured",
              inline: true
            }
          )
        ],
        ephemeral: true
      });
    }

    /* FEATURE */

    if (command === "feature") {
      const id = interaction.options.getString("id").toUpperCase();
      const ad = db.advertisements[id];

      if (!ad || ad.status !== "accepted") {
        return safeReply(interaction, {
          content: "That advertisement is not approved.",
          ephemeral: true
        });
      }

      const config = getGuildConfig(interaction.guild.id);

      const channel = config.featuredChannel
        ? interaction.guild.channels.cache.get(config.featuredChannel)
        : null;

      if (!channel) {
        return safeReply(interaction, {
          content: "The Featured Servers channel has not been configured.",
          ephemeral: true
        });
      }

      await channel.send({
        embeds: [advertisementEmbed(ad, "Online")],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Join Server")
              .setStyle(ButtonStyle.Link)
              .setURL(ad.inviteUrl)
          )
        ]
      });

      return safeReply(interaction, {
        content: `**${id}** has been featured.`,
        ephemeral: true
      });
    }

    /* UNFEATURE */

    if (command === "unfeature") {
      const id = interaction.options.getString("id").toUpperCase();

      return safeReply(interaction, {
        content:
          `Advertisement **${id}** has been marked for removal. ` +
          `Remove its existing post from the Featured Servers channel if necessary.`,
        ephemeral: true
      });
    }

    /* BLACKLIST */

    if (command === "blacklist") {
      const invite = cleanInvite(
        interaction.options.getString("invite")
      );

      if (!db.blacklist.includes(invite)) {
        db.blacklist.push(invite);
        saveData();
      }

      return safeReply(interaction, {
        content: `The invite **${invite}** has been blacklisted.`,
        ephemeral: true
      });
    }

    /* UNBLACKLIST */

    if (command === "unblacklist") {
      const invite = cleanInvite(
        interaction.options.getString("invite")
      );

      db.blacklist =
        db.blacklist.filter(item => item !== invite);

      saveData();

      return safeReply(interaction, {
        content: `The invite **${invite}** has been removed from the blacklist.`,
        ephemeral: true
      });
    }

  } catch (error) {
    console.error("Interaction error:", error);

    try {
      await safeReply(interaction, {
        content:
          "Something went wrong while processing that request. Please try again.",
        ephemeral: true
      });
    } catch {}
  }
});

/* ---------------- ADVERTISEMENT MODAL ---------------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "advertise_modal") return;

  try {
    await interaction.deferReply({ ephemeral: true });

    const inviteInput =
      interaction.fields.getTextInputValue("invite");

    const communityLink =
      interaction.fields.getTextInputValue("community") || null;

    const description =
      interaction.fields.getTextInputValue("description");

    const category =
      interaction.fields.getTextInputValue("category");

    if (!validInvite(inviteInput)) {
      return interaction.editReply({
        content:
          "That does not look like a valid Discord invite."
      });
    }

    const inviteCode = cleanInvite(inviteInput);

    if (db.blacklist.includes(inviteCode)) {
      return interaction.editReply({
        content:
          "This server is currently blacklisted from ServerSpot."
      });
    }

    const existing = Object.values(db.advertisements)
      .find(ad =>
        ad.inviteCode === inviteCode &&
        ["pending", "accepted"].includes(ad.status)
      );

    if (existing) {
      return interaction.editReply({
        content:
          `This server already has an active advertisement: **${existing.id}**`
      });
    }

    let inviteData;

    try {
      inviteData = await lookupInvite(inviteCode);
    } catch {
      return interaction.editReply({
        content:
          "I couldn't verify that Discord invite. Please make sure it is valid and active."
      });
    }

    if (!inviteData.guild) {
      return interaction.editReply({
        content:
          "That invite does not provide enough server information for ServerSpot."
      });
    }

    const serverName =
      inviteData.guild.name || "Unknown Server";

    const members =
      inviteData.approximate_member_count || 0;

    const iconHash =
      inviteData.guild.icon;

    const icon = iconHash
      ? `https://cdn.discordapp.com/icons/${inviteData.guild.id}/${iconHash}.png?size=256`
      : null;

    const id = makeId();

    const ad = {
      id,
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      serverId: inviteData.guild.id,
      serverName,
      inviteCode,
      inviteUrl: `https://discord.gg/${inviteCode}`,
      communityLink,
      description,
      category,
      members,
      icon,
      status: "pending",
      createdAt: Date.now(),
      reviewedBy: null,
      reviewedAt: null,
      reason: null,
      reviewMessageId: null
    };

    db.advertisements[id] = ad;

    const user = ensureUser(interaction.user.id);
    user.submitted++;

    saveData();

    const config = getGuildConfig(interaction.guild.id);

    if (!config.logsChannel) {
      delete db.advertisements[id];
      user.submitted--;
      saveData();

      return interaction.editReply({
        content:
          "ServerSpot has not been configured yet. An administrator needs to run `/setup` first."
      });
    }

    const logs = interaction.guild.channels.cache.get(
      config.logsChannel
    );

    if (!logs) {
      return interaction.editReply({
        content:
          "The configured advertisement logs channel could not be found."
      });
    }

    const message = await logs.send({
      embeds: [
        advertisementEmbed(ad, "Pending")
      ],
      components: [
        advertisementButtons(id)
      ]
    });

    ad.reviewMessageId = message.id;

    saveData();

    return interaction.editReply({
      content:
        `Your advertisement has been submitted successfully.\n\n` +
        `Advertisement ID: **${id}**\n` +
        `Server: **${serverName}**\n` +
        `Status: **Pending Review**`
    });

  } catch (error) {
    console.error("Advertisement submission error:", error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content:
            "Something went wrong while submitting your advertisement."
        });
      }
    } catch {}
  }
});

/* ---------------- SAFETY ---------------- */

client.on("error", error => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

/* ---------------- START ---------------- */

client.login(TOKEN);
