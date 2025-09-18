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
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || "!",
  maxMentions: parseInt(process.env.MAX_MENTIONS) || 5,
  spamThreshold: parseInt(process.env.SPAM_THRESHOLD) || 5,
  spamTimeframe: parseInt(process.env.SPAM_TIMEFRAME) || 5000,
  raidThreshold: parseInt(process.env.RAID_THRESHOLD) || 5,
  raidTimeframe: parseInt(process.env.RAID_TIMEFRAME) || 30000,
  logChannelName: process.env.LOG_CHANNEL || "mod-logs",
};

// Color constants
const EmbedColors = {
  SUCCESS: 0x00ff00,
  INFO: 0x0099ff,
  WARNING: 0xffff00,
  ERROR: 0xff0000,
  MODERATE: 0xff6600,
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

// Context Menu Commands
const contextCommands = [
  new ContextMenuCommandBuilder()
    .setName("Quick Timeout")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  new ContextMenuCommandBuilder()
    .setName("User Info")
    .setType(ApplicationCommandType.User),

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

    // Deploy commands globally
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: allCommands,
    });

    console.log("✅ Successfully reloaded application (/) commands globally.");
  } catch (error) {
    console.error("❌ Error deploying commands:", error);
  }
}

// =================== BOT EVENT HANDLERS ===================

client.once("ready", async () => {
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

// =================== INTERACTION HANDLERS ===================

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isContextMenuCommand()) {
      await handleContextMenu(interaction);
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const errorMsg = "❌ There was an error executing this command!";

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMsg });
      } else {
        await interaction.reply({ content: errorMsg, ephemeral: true });
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
});

// Handle Slash Commands
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

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
      await interaction.reply({
        content: "❌ Unknown command!",
        ephemeral: true,
      });
  }
}

// Handle Context Menu Commands
async function handleContextMenu(interaction) {
  const { commandName } = interaction;

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

  try {
    await member.kick(reason);
    await interaction.reply(`✅ Kicked ${user.tag} for: ${reason}`);

    await logEvent(
      interaction.guild,
      "User Kicked",
      `${user.tag} was kicked by ${interaction.user.tag}. Reason: ${reason}`,
      "MODERATE"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to kick user.",
      ephemeral: true,
    });
    console.error("Kick error:", error);
  }
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

  try {
    await interaction.guild.members.ban(user, {
      reason,
      deleteMessageDays: deleteDays,
    });
    await interaction.reply(`✅ Banned ${user.tag} for: ${reason}`);

    await logEvent(
      interaction.guild,
      "User Banned",
      `${user.tag} was banned by ${interaction.user.tag}. Reason: ${reason}`,
      "ERROR"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to ban user.",
      ephemeral: true,
    });
    console.error("Ban error:", error);
  }
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

  try {
    await member.timeout(duration * 60 * 1000, reason);
    await interaction.reply(
      `✅ Timed out ${user.tag} for ${duration} minutes. Reason: ${reason}`
    );

    await logEvent(
      interaction.guild,
      "User Timed Out",
      `${user.tag} was timed out by ${interaction.user.tag} for ${duration} minutes. Reason: ${reason}`,
      "WARNING"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to timeout user.",
      ephemeral: true,
    });
    console.error("Timeout error:", error);
  }
}

async function slashClearMessages(interaction) {
  const amount = interaction.options.getInteger("amount");

  await interaction.deferReply({ ephemeral: true });

  try {
    const deleted = await interaction.channel.bulkDelete(amount, true);

    await interaction.editReply(`✅ Deleted ${deleted.size} messages.`);

    await logEvent(
      interaction.guild,
      "Messages Cleared",
      `${interaction.user.tag} cleared ${deleted.size} messages in ${interaction.channel.name}`,
      "INFO"
    );
  } catch (error) {
    await interaction.editReply(
      "❌ Failed to delete messages. Messages might be older than 14 days."
    );
    console.error("Clear messages error:", error);
  }
}

async function slashWarnUser(interaction) {
  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason");

  const embed = new EmbedBuilder()
    .setColor(EmbedColors.WARNING)
    .setTitle("⚠️ Warning")
    .setDescription(`You have been warned in ${interaction.guild.name}`)
    .addFields({ name: "Reason", value: reason || "No reason provided" })
    .setFooter({ text: `Warned by ${interaction.user.tag}` })
    .setTimestamp();

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
    "WARNING"
  );
}

async function slashShowStats(interaction) {
  const embed = new EmbedBuilder()
    .setColor(EmbedColors.INFO)
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
    .setColor(EmbedColors.INFO)
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
    .setColor(EmbedColors.SUCCESS)
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

  try {
    await member.timeout(10 * 60 * 1000, "Quick timeout via context menu");
    await interaction.reply({
      content: `✅ ${user.tag} has been timed out for 10 minutes!`,
      ephemeral: true,
    });

    await logEvent(
      interaction.guild,
      "Quick Timeout",
      `${user.tag} was quickly timed out by ${interaction.user.tag}`,
      "WARNING"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to timeout user!",
      ephemeral: true,
    });
    console.error("Quick timeout error:", error);
  }
}

async function contextUserInfo(interaction) {
  const user = interaction.targetUser;
  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(EmbedColors.INFO)
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
      .setColor(EmbedColors.WARNING)
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
      "MODERATE"
    );
  } catch (error) {
    await interaction.reply({
      content: "❌ Failed to delete message!",
      ephemeral: true,
    });
    console.error("Delete & warn error:", error);
  }
}

// =================== UTILITY FUNCTIONS ===================

function formatUptime(uptime) {
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Logging function with fixed colors
async function logEvent(guild, title, description, colorKey) {
  const logChannel = guild.channels.cache.find(
    (ch) => ch.name === config.logChannelName
  );

  if (logChannel) {
    const colorMap = {
      SUCCESS: EmbedColors.SUCCESS,
      INFO: EmbedColors.INFO,
      WARNING: EmbedColors.WARNING,
      ERROR: EmbedColors.ERROR,
      MODERATE: EmbedColors.MODERATE,
      // Legacy support
      GREEN: EmbedColors.SUCCESS,
      BLUE: EmbedColors.INFO,
      YELLOW: EmbedColors.WARNING,
      RED: EmbedColors.ERROR,
      ORANGE: EmbedColors.MODERATE,
    };

    const embed = new EmbedBuilder()
      .setColor(colorMap[colorKey] || EmbedColors.INFO)
      .setTitle(`📋 ${title}`)
      .setDescription(description)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch((error) => {
      console.error("Failed to send log message:", error.message);
    });
  }
}

// =================== EXISTING MESSAGE HANDLERS ===================

// Anti-spam function
async function handleAntiSpam(message) {
  const userId = message.author.id;
  const now = Date.now();

  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }

  const userMsgArray = userMessages.get(userId);
  userMsgArray.push(now);

  const filtered = userMsgArray.filter(
    (timestamp) => now - timestamp < config.spamTimeframe
  );
  userMessages.set(userId, filtered);

  if (filtered.length >= config.spamThreshold) {
    try {
      const messages = await message.channel.messages.fetch({ limit: 10 });
      const userMessages = messages.filter((msg) => msg.author.id === userId);

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
      }

      if (
        message.member &&
        message.guild.members.me.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        await message.member.timeout(
          10 * 60 * 1000,
          "Anti-spam: Excessive messaging"
        );
      }

      await logEvent(
        message.guild,
        "Anti-Spam Triggered",
        `${message.author.tag} was timed out for spam (${
          filtered.length
        } messages in ${config.spamTimeframe / 1000}s)`,
        "MODERATE"
      );

      userMessages.set(userId, []);
    } catch (error) {
      console.error("Error in anti-spam:", error);
    }
  }
}

// Handle mention spam
async function handleMentionSpam(message) {
  if (message.mentions.users.size > config.maxMentions) {
    try {
      await message.delete();

      if (
        message.member &&
        message.guild.members.me.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        await message.member.timeout(5 * 60 * 1000, "Excessive mentions");
      }

      await logEvent(
        message.guild,
        "Mention Spam",
        `${message.author.tag} sent a message with ${message.mentions.users.size} mentions`,
        "MODERATE"
      );
    } catch (error) {
      console.error("Error handling mention spam:", error);
    }
  }
}

// Raid protection
async function handleRaidProtection(member) {
  const now = Date.now();
  recentJoins.push({ userId: member.user.id, timestamp: now });

  const filtered = recentJoins.filter(
    (join) => now - join.timestamp < config.raidTimeframe
  );
  recentJoins.length = 0;
  recentJoins.push(...filtered);

  if (filtered.length >= config.raidThreshold) {
    try {
      for (const join of filtered) {
        const memberToKick = await member.guild.members
          .fetch(join.userId)
          .catch(() => null);
        if (memberToKick) {
          await memberToKick.kick("Raid protection triggered").catch(() => {});
        }
      }

      await logEvent(
        member.guild,
        "Raid Protection Triggered",
        `Kicked ${filtered.length} users who joined within ${
          config.raidTimeframe / 1000
        } seconds`,
        "ERROR"
      );

      recentJoins.length = 0;
    } catch (error) {
      console.error("Error in raid protection:", error);
    }
  }
}

// Welcome message
async function sendWelcomeMessage(member) {
  const welcomeChannel = member.guild.channels.cache.find(
    (ch) => ch.name === "welcome" || ch.name === "general"
  );

  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor(EmbedColors.SUCCESS)
      .setTitle("Welcome!")
      .setDescription(
        `Welcome to the server, ${member.user}! Please read the rules and enjoy your stay.`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

// Legacy prefix commands (for backward compatibility)
async function handleCommands(message) {
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const hasModPermission = message.member.permissions.has(
    PermissionsBitField.Flags.ModerateMembers
  );

  switch (command) {
    case "ping":
      await message.reply(`Pong! 🏓 Latency: ${client.ws.ping}ms`);
      break;

    case "kick":
      if (!hasModPermission)
        return message.reply("❌ You need Moderate Members permission!");
      await kickUser(message, args);
      break;

    case "ban":
      if (!hasModPermission)
        return message.reply("❌ You need Moderate Members permission!");
      await banUser(message, args);
      break;

    case "timeout":
      if (!hasModPermission)
        return message.reply("❌ You need Moderate Members permission!");
      await timeoutUser(message, args);
      break;

    case "clear":
      if (!hasModPermission)
        return message.reply("❌ You need Moderate Members permission!");
      await clearMessages(message, args);
      break;

    case "help":
      await showHelp(message);
      break;

    case "stats":
      await showStats(message);
      break;

    default:
      break;
  }
}

// Legacy prefix command functions
async function kickUser(message, args) {
  const member =
    message.mentions.members.first() ||
    (await message.guild.members.fetch(args[0]).catch(() => null));
  const reason = args.slice(1).join(" ") || "No reason provided";

  if (!member)
    return message.reply(
      "❌ Please mention a user or provide a valid user ID."
    );
  if (!member.kickable) return message.reply("❌ I cannot kick this user.");
  if (member.id === message.author.id)
    return message.reply("❌ You cannot kick yourself!");

  try {
    await member.kick(reason);
    await message.reply(`✅ Kicked ${member.user.tag} for: ${reason}`);
    await logEvent(
      message.guild,
      "User Kicked",
      `${member.user.tag} was kicked by ${message.author.tag}. Reason: ${reason}`,
      "MODERATE"
    );
  } catch (error) {
    await message.reply("❌ Failed to kick user.");
    console.error("Kick error:", error);
  }
}

async function banUser(message, args) {
  const member =
    message.mentions.members.first() ||
    (await message.guild.members.fetch(args[0]).catch(() => null));
  const reason = args.slice(1).join(" ") || "No reason provided";

  if (!member)
    return message.reply(
      "❌ Please mention a user or provide a valid user ID."
    );
  if (!member.bannable) return message.reply("❌ I cannot ban this user.");
  if (member.id === message.author.id)
    return message.reply("❌ You cannot ban yourself!");

  try {
    await member.ban({ reason });
    await message.reply(`✅ Banned ${member.user.tag} for: ${reason}`);
    await logEvent(
      message.guild,
      "User Banned",
      `${member.user.tag} was banned by ${message.author.tag}. Reason: ${reason}`,
      "ERROR"
    );
  } catch (error) {
    await message.reply("❌ Failed to ban user.");
    console.error("Ban error:", error);
  }
}

async function timeoutUser(message, args) {
  const member =
    message.mentions.members.first() ||
    (await message.guild.members.fetch(args[0]).catch(() => null));
  const duration = parseInt(args[1]) || 10;
  const reason = args.slice(2).join(" ") || "No reason provided";

  if (!member)
    return message.reply(
      "❌ Please mention a user or provide a valid user ID."
    );
  if (!member.moderatable)
    return message.reply("❌ I cannot timeout this user.");
  if (member.id === message.author.id)
    return message.reply("❌ You cannot timeout yourself!");
  if (duration > 1440)
    return message.reply(
      "❌ Maximum timeout duration is 1440 minutes (24 hours)."
    );

  try {
    await member.timeout(duration * 60 * 1000, reason);
    await message.reply(
      `✅ Timed out ${member.user.tag} for ${duration} minutes. Reason: ${reason}`
    );
    await logEvent(
      message.guild,
      "User Timed Out",
      `${member.user.tag} was timed out by ${message.author.tag} for ${duration} minutes. Reason: ${reason}`,
      "WARNING"
    );
  } catch (error) {
    await message.reply("❌ Failed to timeout user.");
    console.error("Timeout error:", error);
  }
}

async function clearMessages(message, args) {
  const amount = parseInt(args[0]);

  if (!amount || amount < 1 || amount > 100) {
    return message.reply("❌ Please provide a number between 1 and 100.");
  }

  try {
    const deleted = await message.channel.bulkDelete(amount + 1, true);
    const reply = await message.channel.send(
      `✅ Deleted ${deleted.size - 1} messages.`
    );
    setTimeout(() => reply.delete().catch(() => {}), 3000);

    await logEvent(
      message.guild,
      "Messages Cleared",
      `${message.author.tag} cleared ${deleted.size - 1} messages in ${
        message.channel.name
      }`,
      "INFO"
    );
  } catch (error) {
    await message.reply(
      "❌ Failed to delete messages. Messages might be older than 14 days."
    );
    console.error("Clear messages error:", error);
  }
}

async function showStats(message) {
  const embed = new EmbedBuilder()
    .setColor(EmbedColors.INFO)
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
      text: `Requested by ${message.author.tag}`,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

async function showHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(EmbedColors.INFO)
    .setTitle("🛡️ Protection Bot Commands")
    .setDescription(
      `Prefix: \`${config.prefix}\` | Use slash commands (\`/\`) for better experience!`
    )
    .addFields(
      {
        name: "📋 General Commands",
        value: `\`${config.prefix}ping\` - Check bot latency\n\`${config.prefix}help\` - Show this help message\n\`${config.prefix}stats\` - Show bot statistics`,
      },
      {
        name: "🔨 Moderation Commands (Requires Moderate Members permission)",
        value: `\`${config.prefix}kick @user [reason]\` - Kick a user\n\`${config.prefix}ban @user [reason]\` - Ban a user\n\`${config.prefix}timeout @user [minutes] [reason]\` - Timeout a user\n\`${config.prefix}clear [amount]\` - Delete messages (1-100)`,
      },
      {
        name: "🛡️ Auto Protection Features",
        value: `• **Anti-spam**: Detects ${config.spamThreshold} messages in ${
          config.spamTimeframe / 1000
        }s\n• **Mention spam**: Max ${
          config.maxMentions
        } mentions per message\n• **Raid protection**: Kicks ${
          config.raidThreshold
        } users joining in ${
          config.raidTimeframe / 1000
        }s\n• **Auto-logging**: All events logged to #${
          config.logChannelName
        }\n• **Welcome messages**: Greets new members`,
      }
    )
    .setFooter({
      text: "Bot made with ❤️ for server protection | Try /help for slash commands!",
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// =================== EVENT LISTENERS ===================

// Message event for moderation and legacy commands
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await handleAntiSpam(message);
  await handleMentionSpam(message);

  if (message.content.startsWith(config.prefix)) {
    await handleCommands(message);
  }
});

// Member join event for raid protection
client.on("guildMemberAdd", async (member) => {
  await logEvent(
    member.guild,
    "Member Joined",
    `${member.user.tag} (${member.user.id}) joined the server`,
    "SUCCESS"
  );

  await handleRaidProtection(member);
  await sendWelcomeMessage(member);
});

// Member leave event
client.on("guildMemberRemove", async (member) => {
  await logEvent(
    member.guild,
    "Member Left",
    `${member.user.tag} (${member.user.id}) left the server`,
    "ERROR"
  );
});

// =================== ERROR HANDLING ===================

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

// =================== BOT LOGIN ===================

console.log("🚀 Starting Discord Protection Bot with Slash Commands...");
client.login(config.token);
