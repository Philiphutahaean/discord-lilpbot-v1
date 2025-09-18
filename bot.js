const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");

// Load environment variables (for local development)
// Note: Railway automatically provides environment variables
if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (err) {
    console.log("dotenv not found, using environment variables directly");
  }
}

// Bot configuration - using environment variables with fallbacks
const config = {
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.PREFIX || "!",
  maxMentions: parseInt(process.env.MAX_MENTIONS) || 5,
  spamThreshold: parseInt(process.env.SPAM_THRESHOLD) || 5,
  spamTimeframe: parseInt(process.env.SPAM_TIMEFRAME) || 5000,
  raidThreshold: parseInt(process.env.RAID_THRESHOLD) || 5,
  raidTimeframe: parseInt(process.env.RAID_TIMEFRAME) || 30000,
  logChannelName: process.env.LOG_CHANNEL || "mod-logs",
};

// Validate bot token
if (!config.token) {
  console.error("❌ ERROR: DISCORD_TOKEN is not provided!");
  console.error(
    "Please set DISCORD_TOKEN in your environment variables or .env file"
  );
  process.exit(1);
}

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

// Anti-spam tracking
const userMessages = new Map();
const recentJoins = [];

// Bot ready event
client.once("ready", () => {
  console.log("🤖 Bot is ready!");
  console.log(`📝 Logged in as: ${client.user.tag}`);
  console.log(`🏠 Bot is in ${client.guilds.cache.size} servers`);
  console.log(
    `👥 Serving ${client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0
    )} users`
  );
  console.log("🛡️ Protection systems active!");

  // Set bot status
  client.user.setActivity(`${config.prefix}help | Protecting servers!`, {
    type: 3,
  }); // 3 = WATCHING
});

// Message event for moderation
client.on("messageCreate", async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Anti-spam system
  await handleAntiSpam(message);

  // Check for excessive mentions
  await handleMentionSpam(message);

  // Handle commands
  if (message.content.startsWith(config.prefix)) {
    await handleCommands(message);
  }
});

// Member join event for raid protection
client.on("guildMemberAdd", async (member) => {
  // Log the join
  await logEvent(
    member.guild,
    "Member Joined",
    `${member.user.tag} (${member.user.id}) joined the server`,
    "GREEN"
  );

  // Raid protection
  await handleRaidProtection(member);

  // Welcome message (optional)
  await sendWelcomeMessage(member);
});

// Member leave event
client.on("guildMemberRemove", async (member) => {
  await logEvent(
    member.guild,
    "Member Left",
    `${member.user.tag} (${member.user.id}) left the server`,
    "RED"
  );
});

// Anti-spam function
async function handleAntiSpam(message) {
  const userId = message.author.id;
  const now = Date.now();

  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }

  const userMsgArray = userMessages.get(userId);
  userMsgArray.push(now);

  // Remove messages older than timeframe
  const filtered = userMsgArray.filter(
    (timestamp) => now - timestamp < config.spamTimeframe
  );
  userMessages.set(userId, filtered);

  // Check if user exceeded spam threshold
  if (filtered.length >= config.spamThreshold) {
    try {
      // Delete recent messages
      const messages = await message.channel.messages.fetch({ limit: 10 });
      const userMessages = messages.filter((msg) => msg.author.id === userId);

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
      }

      // Timeout the user (10 minutes)
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

      // Log the action
      await logEvent(
        message.guild,
        "Anti-Spam Triggered",
        `${message.author.tag} was timed out for spam (${
          filtered.length
        } messages in ${config.spamTimeframe / 1000}s)`,
        "ORANGE"
      );

      // Clear user's message history
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

      // Timeout for mention spam
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
        "ORANGE"
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

  // Remove old joins
  const filtered = recentJoins.filter(
    (join) => now - join.timestamp < config.raidTimeframe
  );
  recentJoins.length = 0;
  recentJoins.push(...filtered);

  // Check if raid threshold exceeded
  if (filtered.length >= config.raidThreshold) {
    try {
      // Kick the recent joiners (you might want to ban instead)
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
        "RED"
      );

      recentJoins.length = 0; // Clear the array
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
      .setColor("GREEN")
      .setTitle("Welcome!")
      .setDescription(
        `Welcome to the server, ${member.user}! Please read the rules and enjoy your stay.`
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

// Handle commands
async function handleCommands(message) {
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Check if user has permission for mod commands
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
      // Don't respond to unknown commands to avoid spam
      break;
  }
}

// Kick user command
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
      "ORANGE"
    );
  } catch (error) {
    await message.reply("❌ Failed to kick user.");
    console.error("Kick error:", error);
  }
}

// Ban user command
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
      "RED"
    );
  } catch (error) {
    await message.reply("❌ Failed to ban user.");
    console.error("Ban error:", error);
  }
}

// Timeout user command
async function timeoutUser(message, args) {
  const member =
    message.mentions.members.first() ||
    (await message.guild.members.fetch(args[0]).catch(() => null));
  const duration = parseInt(args[1]) || 10; // Default 10 minutes
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
      "YELLOW"
    );
  } catch (error) {
    await message.reply("❌ Failed to timeout user.");
    console.error("Timeout error:", error);
  }
}

// Clear messages command
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
      "BLUE"
    );
  } catch (error) {
    await message.reply(
      "❌ Failed to delete messages. Messages might be older than 14 days."
    );
    console.error("Clear messages error:", error);
  }
}

// Show bot stats
async function showStats(message) {
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
      text: `Requested by ${message.author.tag}`,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// Format uptime helper
function formatUptime(uptime) {
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Show help command
async function showHelp(message) {
  const embed = new EmbedBuilder()
    .setColor("BLUE")
    .setTitle("🛡️ Protection Bot Commands")
    .setDescription(`Prefix: \`${config.prefix}\``)
    .addFields(
      {
        name: "📋 General Commands",
        value: `\`${config.prefix}ping\` - Check bot latency
\`${config.prefix}help\` - Show this help message
\`${config.prefix}stats\` - Show bot statistics`,
      },
      {
        name: "🔨 Moderation Commands (Requires Moderate Members permission)",
        value: `\`${config.prefix}kick @user [reason]\` - Kick a user
\`${config.prefix}ban @user [reason]\` - Ban a user
\`${config.prefix}timeout @user [minutes] [reason]\` - Timeout a user
\`${config.prefix}clear [amount]\` - Delete messages (1-100)`,
      },
      {
        name: "🛡️ Auto Protection Features",
        value: `• **Anti-spam**: Detects ${config.spamThreshold} messages in ${
          config.spamTimeframe / 1000
        }s
• **Mention spam**: Max ${config.maxMentions} mentions per message
• **Raid protection**: Kicks ${config.raidThreshold} users joining in ${
          config.raidTimeframe / 1000
        }s
• **Auto-logging**: All events logged to #${config.logChannelName}
• **Welcome messages**: Greets new members`,
      }
    )
    .setFooter({ text: "Bot made with ❤️ for server protection" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

// Logging function
async function logEvent(guild, title, description, color) {
  const logChannel = guild.channels.cache.find(
    (ch) => ch.name === config.logChannelName
  );

  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📋 ${title}`)
      .setDescription(description)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch((error) => {
      console.error("Failed to send log message:", error.message);
    });
  }
}

// Error handling
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

// Graceful shutdown
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

// Login with your bot token from environment variable
console.log("🚀 Starting Discord Protection Bot...");
client.login(config.token);
