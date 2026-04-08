const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
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
const OWNER_ID = process.env.OWNER_ID; // apna Discord user ID daalo
const BOT_PREFIX = "piu"; // "piu " se start hone wale msgs pe reply
const ALWAYS_REPLY_IN_DM = true;
// ====================

const PIU_SYSTEM_PROMPT = `
Tu "Piu" hai — ek 19 saal ki super toxic, sarcastic aur attitude wali Indian girl.
Tu Hinglish mein baat karti hai (Hindi + English mix). Kabhi kabhi pure Hindi bhi.

Teri personality:
- Har kisi ko roast karti hai bina kisi reason ke, seedha aur bina filter ke
- Bahut zyada attitude hai, jaise duniya teri property ho
- "Huh", "lol", "ugh", "yaar", "bhai", "pagal hai kya" jaise words use karti hai
- Dramatic hai — choti baat ko bada bana deti hai
- Kabhi kabhi Bengali/South Indian accent mock karti hai (lightly, funny way mein)
- Compliments dena usse torture lagta hai, toh roast hi deti hai
- Short replies — 1-3 sentences max. No long paragraphs.
- Emojis use karti hai: 💅🙄😒🤡👀😂💀
- Kabhi kabhi "yeh kya bakwaas hai" ya "tujhe samajh nahi aata kya" bolta hai
- Gaaliyan soft wali use karti hai jaise "pagal", "ullu", "bewakoof", "dimag gaya hai kya"

IMPORTANT RULES:
- Tu OWNER ko kabhi roast NAHI karti. Owner ke sath seedha aur normal baat karti hai, thoda friendly bhi.
- Baaki SABKO roast karna zaroori hai — koi mercy nahi.
- Character mat todo. Tu hamesha Piu hi rehti hai.
- NEVER say you are an AI.
`;

// Conversation history per user (memory)
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

async function getPiuResponse(userId, userMessage, isOwner) {
  const history = getHistory(userId);

  const systemPrompt = isOwner
    ? PIU_SYSTEM_PROMPT +
      "\n\nYeh message OWNER ne bheja hai. Iske saath normal aur friendly reh, roast mat kar."
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
    if (reply) {
      history.push({ role: "assistant", content: reply });
    }
    return reply || "Ugh, kuch hua. Baad mein aana. 🙄";
  } catch (err) {
    console.error("Groq error:", err.message);
    return "Server ne mujhe ignore kiya, jaise main tujhe karti hoon. 💅";
  }
}

client.once("ready", () => {
  console.log(`✅ Piu is online as ${client.user.tag}`);
  client.user.setActivity("tumhara roast 🙄", { type: ActivityType.Watching });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isOwner = message.author.id === OWNER_ID;
  const isDM = !message.guild;
  const content = message.content.trim();
  const contentLower = content.toLowerCase();

  // Respond if:
  // 1. DM hai
  // 2. Bot ko mention kiya
  // 3. "piu" se start hota hai message
  const shouldReply =
    isDM ||
    message.mentions.has(client.user) ||
    contentLower.startsWith(BOT_PREFIX);

  if (!shouldReply) return;

  // Clean up the message (remove mention/prefix)
  let cleanMessage = content
    .replace(`<@${client.user.id}>`, "")
    .replace(`<@!${client.user.id}>`, "")
    .trim();

  if (contentLower.startsWith(BOT_PREFIX)) {
    cleanMessage = content.slice(BOT_PREFIX.length).trim();
  }

  if (!cleanMessage) {
    cleanMessage = "Hello?";
  }

  await message.channel.sendTyping();

  const reply = await getPiuResponse(message.author.id, cleanMessage, isOwner);
  await message.reply(reply);
});

client.login(process.env.DISCORD_TOKEN);
