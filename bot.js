const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  REST,
  Routes,
  Collection,
} = require("discord.js");

// Load environment variables
if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (err) {
    console.log("dotenv not found, using environment variables directly");
  }
}

// Bot configuration
const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID, // Add this to your .env
  prefix: process.env.PREFIX || "!",
  maxMentions: parseInt(process.env.MAX_MENTIONS) || 5,
  spamThreshold: parseInt(process.env.SPAM_THRESHOLD) || 5,
  spamTimeframe: parseInt(process.env.SPAM_TIMEFRAME) || 5000,
  raidThreshold: parseInt(process.env.RAID_THRESHOLD) || 5,
  raidTimeframe: parseInt(process.env.RAID_TIMEFRAME) || 30000,
  logChannelName: process.env.LOG_CHANNEL || "mod-logs",
};

// Validate required configs
if (!config.token) {
  console.error("❌ ERROR: DISCORD_TOKEN is not provided!");
  process.exit(1);
}
if (!config.clientId) {
  console.error("❌ ERROR: CLIENT_ID is not provided!");
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

// Slash Commands Collection
client.commands = new Collection();

// Anti-spam tracking
const userMessages = new Map();
const recentJoins = [];

// =================== SLASH COMMANDS DEFINITION ===================

// 1. CHAT INPUT COMMANDS (Slash Commands)
const commands = [
  // Ping Command
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),

  // Kick Command
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

  // Ban Command
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("delete_days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

  // Timeout Command
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to timeout").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration in minutes (1-1440)")
        .setMinValue(1)
        .setMaxValue(1440)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for timeout")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  // Clear Messages Command
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear messages from channel")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

  // Stats Command
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show bot statistics"),

  // Help Command
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show bot commands and features"),

  // Warn Command
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  // Server Info Command
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show server information"),
];

// 2. CONTEXT MENU COMMANDS
const contextCommands = [
  // User Context Menu - Quick Timeout
  new ContextMenuCommandBuilder()
    .setName("Quick Timeout")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  // User Context Menu - User Info
  new ContextMenuCommandBuilder()
    .setName("User Info")
    .setType(ApplicationCommandType.User),

  // Message Context Menu - Delete & Warn
  new ContextMenuCommandBuilder()
    .setName("Delete & Warn User")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
];

// Store commands in client collection
commands.forEach((command) => {
  client.commands.set(command.name, command);
});

// =================== DEPLOY COMMANDS FUNCTION ===================
async function deployCommands() {
  try {
    console.log("🔄 Started refreshing application (/) commands.");

    const rest = new REST({ version: "10" }).setToken(config.token);

    const allCommands = [
      ...commands.map((cmd) => cmd.toJSON()),
      ...contextCommands.map((cmd) => cmd.toJSON()),
    ];

    // Deploy commands globally (takes up to 1 hour to update)
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: allCommands,
    });

    console.log("✅ Successfully reloaded application (/) commands globally.");
  } catch (error) {
    console.error("❌ Error deploying commands:", error);
  }
}

// =================== BOT EVENT HANDLERS ===================

// Bot ready event
client.once("clientReady", async () => {
  console.log("🤖 Bot is ready!");
  console.log(`📝 Logged in as: ${client.user.tag}`);
  console.log(`🏠 Bot is in ${client.guilds.cache.size} servers`);
  console.log(
    `👥 Serving ${client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0
    )} users`
  );

  // Deploy slash commands
  await deployCommands();

  console.log("🛡️ Protection systems active!");
  client.user.setActivity(`/help | Protecting servers!`, { type: 3 });
});

// =================== SLASH COMMAND INTERACTIONS ===================

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isContextMenuCommand()) {
    await handleContextMenu(interaction);
  }
});

// Handle Slash Commands
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case "ping":
        await interaction.reply(`Pong! 🏓 Latency: ${client.ws.ping}ms`);
        break;

      case "kick":
        await slashKickUser(interaction);
        break;

      case "ban":
        await slashBanUser(interaction);
        break;

      case "timeout":
        await slashTimeoutUser(interaction);
        break;

      case "clear":
        await slashClearMessages(interaction);
        break;

      case "warn":
        await slashWarnUser(interaction);
        break;

      case "stats":
        await slashShowStats(interaction);
        break;

      case "help":
        await slashShowHelp(interaction);
        break;

      case "serverinfo":
        await slashServerInfo(interaction);
        break;

      default:
        await interaction.reply("❌ Unknown command!");
    }
  } catch (error) {
    console.error("Slash command error:", error);
    const errorMsg = "❌ There was an error executing this command!";

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
}

// Handle Context Menu Commands
async function handleContextMenu(interaction) {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case "Quick Timeout":
        await contextQuickTimeout(interaction);
        break;

      case "User Info":
        await contextUserInfo(interaction);
        break;

      case "Delete & Warn User":
        await contextDeleteAndWarn(interaction);
        break;

      default:
        await interaction.reply({
          content: "❌ Unknown context command!",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("Context menu error:", error);
    await interaction.reply({
      content: "❌ Error executing context command!",
      ephemeral: true,
    });
  }
}

// =================== SLASH COMMAND FUNCTIONS ===================

async function slashKickUser(interaction) {
  const user = interaction.options.getUser("user");
  const reason =
    interaction.options.getString("reason") || "No reason provided";

  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: "❌ User not found in this server!",
      ephemeral: true,
    });
  }

  if (!member.kickable) {
    return interaction.reply({
      content: "❌ I cannot kick this user!",
      ephemeral: true,
    });
  }

  if (member.id === interaction.user.id) {
    return interaction.reply({
      content: "❌ You cannot kick yourself!",
      ephemeral: true,
    });
  }

  await member.kick(reason);
  await interaction.reply(`✅ Kicked ${user.tag} for: ${reason}`);

  await logEvent(
    interaction.guild,
    "User Kicked",
    `${user.tag} was kicked by ${interaction.user.tag}. Reason: ${reason}`,
    "ORANGE"
  );
}

async function slashBanUser(interaction) {
  const user = interaction.options.getUser("user");
  const reason =
    interaction.options.getString("reason") || "No reason provided";
  const deleteDays = interaction.options.getInteger("delete_days") || 0;

  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (member && !member.bannable) {
    return interaction.reply({
      content: "❌ I cannot ban this user!",
      ephemeral: true,
    });
  }

  if (user.id === interaction.user.id) {
    return interaction.reply({
      content: "❌ You cannot ban yourself!",
      ephemeral: true,
    });
  }

  await interaction.guild.members.ban(user, {
    reason,
    deleteMessageDays: deleteDays,
  });
  await interaction.reply(`✅ Banned ${user.tag} for: ${reason}`);

  await logEvent(
    interaction.guild,
    "User Banned",
    `${user.tag} was banned by ${interaction.user.tag}. Reason: ${reason}`,
    "RED"
  );
}

async function slashTimeoutUser(interaction) {
  const user = interaction.options.getUser("user");
  const duration = interaction.options.getInteger("duration");
  const reason =
    interaction.options.getString("reason") || "No reason provided";

  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: "❌ User not found in this server!",
      ephemeral: true,
    });
  }

  if (!member.moderatable) {
    return interaction.reply({
      content: "❌ I cannot timeout this user!",
      ephemeral: true,
    });
  }

  if (member.id === interaction.user.id) {
    return interaction.reply({
      content: "❌ You cannot timeout yourself!",
      ephemeral: true,
    });
  }

  await member.timeout(duration * 60 * 1000, reason);
  await interaction.reply(
    `✅ Timed out ${user.tag} for ${duration} minutes. Reason: ${reason}`
  );

  await logEvent(
    interaction.guild,
    "User Timed Out",
    `${user.tag} was timed out by ${interaction.user.tag} for ${duration} minutes. Reason: ${reason}`,
    "YELLOW"
  );
}

async function slashClearMessages(interaction) {
  const amount = interaction.options.getInteger("amount");

  await interaction.deferReply({ ephemeral: true });

  const deleted = await interaction.channel.bulkDelete(amount, true);

  await interaction.editReply(`✅ Deleted ${deleted.size} messages.`);

  await logEvent(
    interaction.guild,
    "Messages Cleared",
    `${interaction.user.tag} cleared ${deleted.size} messages in ${interaction.channel.name}`,
    "BLUE"
  );
}

async function slashWarnUser(interaction) {
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");

  const embed = new EmbedBuilder()
    .setColor("YELLOW")
    .setTitle("⚠️ Warning")
    .setDescription(`You have been warned in ${interaction.guild.name}`)
    .addFields({ name: "Reason", value: reason })
    .setFooter({ text: `Warned by ${interaction.user.tag}` })
    .setTimestamp();

  // Try to DM the user
  try {
    await user.send({ embeds: [embed] });
    await interaction.reply(`✅ Warned ${user.tag} for: ${reason} (DM sent)`);
  } catch {
    await interaction.reply(`✅ Warned ${user.tag} for: ${reason} (DM failed)`);
  }

  await logEvent(
    interaction.guild,
    "User Warned",
    `${user.tag} was warned by ${interaction.user.tag}. Reason: ${reason}`,
    "YELLOW"
  );
}

async function slashShowStats(interaction) {
  const embed = new EmbedBuilder()
    .setColor("BLUE")
    .setTitle("📊 Bot Statistics")
    .addFields(
      {
        name: "🏠 Servers",
        value: client.guilds.cache.size.toString(),
        inline: true,
      },
      {
        name: "👥 Users",
        value: client.guilds.cache
          .reduce((acc, guild) => acc + guild.memberCount, 0)
          .toString(),
        inline: true,
      },
      { name: "📡 Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "⏱️ Uptime", value: formatUptime(client.uptime), inline: true },
      {
        name: "💾 Memory",
        value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        inline: true,
      },
      { name: "🔧 Node.js", value: process.version, inline: true }
    )
    .setFooter({
      text: `Requested by ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function slashShowHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor("BLUE")
    .setTitle("🛡️ Protection Bot Commands")
    .setDescription("Use **slash commands** for better experience!")
    .addFields(
      {
        name: "📋 General Commands",
        value:
          "`/ping` - Check bot latency\n`/help` - Show this help\n`/stats` - Bot statistics\n`/serverinfo` - Server information",
      },
      {
        name: "🔨 Moderation Commands",
        value:
          "`/kick @user [reason]` - Kick a user\n`/ban @user [reason]` - Ban a user\n`/timeout @user <minutes> [reason]` - Timeout a user\n`/warn @user <reason>` - Warn a user\n`/clear <amount>` - Delete messages",
      },
      {
        name: "🖱️ Context Menu Commands",
        value:
          "**Right-click on user:**\n• Quick Timeout\n• User Info\n\n**Right-click on message:**\n• Delete & Warn User",
      },
      {
        name: "🛡️ Auto Protection",
        value: `• Anti-spam detection\n• Mention spam protection\n• Raid protection\n• Auto-logging\n• Welcome messages`,
      }
    )
    .setFooter({ text: "Use / to see all available commands!" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function slashServerInfo(interaction) {
  const guild = interaction.guild;

  const embed = new EmbedBuilder()
    .setColor("GREEN")
    .setTitle(`📊 ${guild.name} Server Info`)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: "👤 Owner", value: `<@${guild.ownerId}>`, inline: true },
      { name: "👥 Members", value: guild.memberCount.toString(), inline: true },
      {
        name: "📅 Created",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
        inline: true,
      },
      {
        name: "🔧 Channels",
        value: guild.channels.cache.size.toString(),
        inline: true,
      },
      {
        name: "🎭 Roles",
        value: guild.roles.cache.size.toString(),
        inline: true,
      },
      {
        name: "😀 Emojis",
        value: guild.emojis.cache.size.toString(),
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// =================== CONTEXT MENU FUNCTIONS ===================

async function contextQuickTimeout(interaction) {
  const user = interaction.targetUser;
  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) {
    return interaction.reply({
      content: "❌ User not found!",
      ephemeral: true,
    });
  }

  if (!member.moderatable) {
    return interaction.reply({
      content: "❌ Cannot timeout this user!",
      ephemeral: true,
    });
  }

  await member.timeout(10 * 60 * 1000, "Quick timeout via context menu");
  await interaction.reply({
    content: `✅ ${user.tag} has been timed out for 10 minutes!`,
    ephemeral: true,
  });

  await logEvent(
    interaction.guild,
    "Quick Timeout",
    `${user.tag} was quickly timed out by ${interaction.user.tag}`,
    "YELLOW"
  );
}

async function contextUserInfo(interaction) {
  const user = interaction.targetUser;
  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  const embed = new EmbedBuilder()
    .setColor("BLUE")
    .setTitle(`👤 ${user.tag}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: "🆔 User ID", value: user.id, inline: true },
      {
        name: "📅 Account Created",
        value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
        inline: false,
      }
    );

  if (member) {
    embed.addFields(
      {
        name: "📅 Joined Server",
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`,
        inline: false,
      },
      {
        name: "🎭 Roles",
        value:
          member.roles.cache
            .filter((r) => r.id !== interaction.guild.id)
            .map((r) => r.toString())
            .join(", ") || "None",
        inline: false,
      }
    );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function contextDeleteAndWarn(interaction) {
  const message = interaction.targetMessage;
  const user = message.author;

  if (user.bot) {
    return interaction.reply({
      content: "❌ Cannot warn bots!",
      ephemeral: true,
    });
  }

  try {
    await message.delete();

    const embed = new EmbedBuilder()
      .setColor("YELLOW")
      .setTitle("⚠️ Warning")
      .setDescription(`Your message was deleted in ${interaction.guild.name}`)
      .addFields({ name: "Reason", value: "Message deleted by moderator" })
      .setFooter({ text: `Warned by ${interaction.user.tag}` })
      .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => {});

    await interaction.reply({
      content: `✅ Deleted message and warned ${user.tag}!`,
      ephemeral: true,
    });

    await logEvent(
      interaction.guild,
      "Message Deleted & User Warned",
      `${user.tag}'s message was deleted and user warned by ${interaction.user.tag}`,
      "ORANGE"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to delete message!",
      ephemeral: true,
    });
  }
}

// =================== EXISTING FUNCTIONS (keep all your existing functions) ===================

// Keep all your existing functions:
// - handleAntiSpam
// - handleMentionSpam
// - handleRaidProtection
// - sendWelcomeMessage
// - handleCommands (for prefix commands)
// - logEvent
// - formatUptime
// etc.

// Message event for moderation (keep existing)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await handleAntiSpam(message);
  await handleMentionSpam(message);

  // Keep prefix commands for backward compatibility
  if (message.content.startsWith(config.prefix)) {
    await handleCommands(message);
  }
});

// Keep all other existing event handlers and functions...
// (I'm keeping the existing code structure intact)

// [Include all your existing functions here - handleAntiSpam, handleMentionSpam, etc.]

// Your existing functions go here...
async function handleAntiSpam(message) {
  // Your existing anti-spam code
}

async function handleMentionSpam(message) {
  // Your existing mention spam code
}

async function handleRaidProtection(member) {
  // Your existing raid protection code
}

async function sendWelcomeMessage(member) {
  // Your existing welcome message code
}

async function handleCommands(message) {
  // Your existing prefix command handler
}

async function logEvent(guild, title, description, color) {
  // Your existing logging function
}

function formatUptime(uptime) {
  // Your existing uptime formatter
}

// Keep all other existing event handlers...
client.on("guildMemberAdd", async (member) => {
  await logEvent(
    member.guild,
    "Member Joined",
    `${member.user.tag} (${member.user.id}) joined the server`,
    "GREEN"
  );
  await handleRaidProtection(member);
  await sendWelcomeMessage(member);
});

client.on("guildMemberRemove", async (member) => {
  await logEvent(
    member.guild,
    "Member Left",
    `${member.user.tag} (${member.user.id}) left the server`,
    "RED"
  );
});

// Error handling (keep existing)
client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception thrown:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT. Graceful shutdown...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM. Graceful shutdown...");
  client.destroy();
  process.exit(0);
});

console.log("🚀 Starting Discord Protection Bot with Slash Commands...");
client.login(config.token);
