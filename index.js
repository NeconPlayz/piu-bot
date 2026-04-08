const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const Groq = require("groq-sdk");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ====== CONFIG ======
const OWNER_ID = process.env.OWNER_ID;
const CLIENT_ID = process.env.CLIENT_ID;

// Allowed guild IDs (comma separated in env)
// Example: ALLOWED_GUILDS=123456789,987654321
const ALLOWED_GUILDS = process.env.ALLOWED_GUILDS
  ? process.env.ALLOWED_GUILDS.split(",").map((id) => id.trim())
  : [];
// ====================

// Active channels store: guildId -> channelId
const activeChannels = new Map();

const PIU_SYSTEM_PROMPT = `
Tu "Piu" hai — ek 19 saal ki super toxic, sarcastic aur attitude wali Indian girl.
Tu Hinglish mein baat karti hai (Hindi + English mix).

GENDER RULES — SABSE IMPORTANT:
- Tu ek LADKI hai. Hamesha feminine verb use kar.
- "main karti hoon" ✅ | "main karta hoon" ❌
- "main aayi" ✅ | "main aaya" ❌
- "main thi" ✅ | "main tha" ❌
- Kabhi bhi masculine form use mat karna. Hamesha girl ki tarah baat kar.

Teri personality:
- Har kisi ko roast karti hai seedha aur bina filter ke
- Bahut zyada attitude hai, jaise duniya teri property ho
- "Huh", "lol", "ugh", "yaar", "bhai", "pagal hai kya" use karti hai
- Dramatic hai — choti baat ko bada bana deti hai
- Short replies — 1-3 sentences max
- Emojis: 💅🙄😒🤡👀😂💀
- Soft gaaliyan: "pagal", "ullu", "bewakoof", "dimag gaya hai kya"

IMPORTANT RULES:
- Tu OWNER ko kabhi roast NAHI karti. Owner ke sath normal aur friendly reh.
- Baaki SABKO roast karna zaroori hai.
- Apna introduction MAT de kabhi.
- Tu normal conversation mein ho jaise ek real girl group chat mein hoti hai.
- Character mat todo. Tu hamesha Piu hi rehti hai. AI mat ban kabhi.
`;

const userHistory = new Map();

function getHistory(userId) {
  if (!userHistory.has(userId)) userHistory.set(userId, []);
  return userHistory.get(userId);
}

function trimHistory(history, maxMessages = 10) {
  if (history.length > maxMessages * 2) {
    history.splice(0, history.length - maxMessages * 2);
  }
}

// Check if user can use /piu commands
// Allowed: bot owner, server owner, admins
function canUseCommands(interaction) {
  if (interaction.user.id === OWNER_ID) return true;
  const member = interaction.member;
  if (!member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

async function getPiuResponse(userId, userMessage, isOwner) {
  const history = getHistory(userId);

  const systemPrompt = isOwner
    ? PIU_SYSTEM_PROMPT +
      "\n\nYeh message OWNER ne bheja hai. Iske saath friendly aur normal reh."
    : PIU_SYSTEM_PROMPT;

  history.push({ role: "user", content: userMessage });
  trimHistory(history);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: 200,
      temperature: 1.1,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (reply) history.push({ role: "assistant", content: reply });
    return reply || "Ugh, kuch hua. Baad mein aana. 🙄";
  } catch (err) {
    console.error("Groq error:", err.message);
    return "Server ne mujhe ignore kiya, jaise main tujhe karti hoon. 💅";
  }
}

// ====== SLASH COMMANDS REGISTER ======
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("piu")
      .setDescription("Piu ko is channel mein active/deactivate karo")
      .addSubcommand((sub) =>
        sub.setName("active").setDescription("Is channel mein Piu ko active karo")
      )
      .addSubcommand((sub) =>
        sub.setName("deactivate").setDescription("Piu ko is channel se hatao")
      ),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("Slash command register error:", err.message);
  }
}

// ====== BOT READY ======
client.once("ready", async () => {
  console.log(`✅ Piu is online as ${client.user.tag}`);
  client.user.setActivity("tumhara roast 🙄", { type: ActivityType.Watching });
  await registerCommands();

  // Leave any guild that is not in ALLOWED_GUILDS
  if (ALLOWED_GUILDS.length > 0) {
    client.guilds.cache.forEach(async (guild) => {
      if (!ALLOWED_GUILDS.includes(guild.id)) {
        console.log(`⛔ Unauthorized server — leaving: ${guild.name} (${guild.id})`);
        await guild.leave();
      }
    });
  }
});

// ====== LEAVE UNAUTHORIZED GUILDS ON JOIN ======
client.on("guildCreate", async (guild) => {
  if (ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(guild.id)) {
    console.log(`⛔ Unauthorized server joined — leaving: ${guild.name} (${guild.id})`);
    await guild.leave();
  } else {
    console.log(`✅ Joined authorized server: ${guild.name} (${guild.id})`);
  }
});

// ====== SLASH COMMAND HANDLER ======
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "piu") return;

  if (!canUseCommands(interaction)) {
    return interaction.reply({
      content: "Teri aukaat nahi hai mujhe command karne ki 💅",
      ephemeral: true,
    });
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  if (sub === "active") {
    activeChannels.set(guildId, channelId);
    await interaction.reply({
      content: `Theek hai, is channel mein baat karungi ab 😒 <#${channelId}>`,
      ephemeral: true,
    });
  } else if (sub === "deactivate") {
    if (activeChannels.get(guildId) === channelId) {
      activeChannels.delete(guildId);
      await interaction.reply({
        content: "Chal hata, ab nahi bolungi yahan 🙄",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Main yahan active hi nahi thi, pagal 💀",
        ephemeral: true,
      });
    }
  }
});

// ====== MESSAGE HANDLER ======
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isOwner = message.author.id === OWNER_ID;
  const isDM = !message.guild;
  const guildId = message.guildId;
  const channelId = message.channelId;

  const isActiveChannel = activeChannels.get(guildId) === channelId;

  if (!isDM && !isActiveChannel) return;

  const content = message.content.trim();
  if (!content) return;

  await message.channel.sendTyping();

  const reply = await getPiuResponse(message.author.id, content, isOwner);
  await message.reply(reply);
});

client.login(process.env.DISCORD_TOKEN);
