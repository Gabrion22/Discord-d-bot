import "dotenv/config";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.DEALS_CHANNEL_ID;
const INTERVAL_MIN = Number(process.env.SCAN_INTERVAL_MINUTES || 10);
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const WATCHLIST = (process.env.WATCHLIST || "")
  .split("|")
  .map(s => s.trim())
  .filter(Boolean);
const WATCHLIST = (process.env.WATCHLIST || "")
  .split("|")
  .map(s => s.trim())
  .filter(Boolean);
function expandQuery(q) {
  const map = {
    pokemon: [
      "pokemon cards",
      "pokemon booster box",
      "pokemon elite trainer box",
      "pokemon tcg"
    ],
    "one piece": [
      "one piece tcg",
      "one piece booster box",
      "one piece cards"
    ],
    lego: [
      "lego star wars",
      "lego set",
      "lego technic"
    ],
    milwaukee: [
      "milwaukee m18",
      "milwaukee fuel",
      "milwaukee power tools"
    ],
    dewalt: [
      "dewalt 20v",
      "dewalt power tools"
    ],
    makita: [
      "makita 18v",
      "makita power tools"
    ],
    nintendo: [
      "nintendo switch",
      "switch console"
    ],
    playstation: [
      "ps5 console",
      "ps5 controller"
    ],
    xbox: [
      "xbox series x",
      "xbox controller"
    ],
    gpu: [
      "graphics card",
      "rtx graphics card"
    ],
    rtx: [
      "rtx 3060",
      "rtx 3070",
      "rtx graphics card"
    ],
    iphone: [
      "iphone unlocked",
      "iphone refurbished"
    ],
    ipad: [
      "ipad tablet",
      "ipad wifi"
    ],
    "apple watch": [
      "apple watch series",
      "apple watch se"
    ],
    dyson: [
      "dyson vacuum",
      "dyson cordless vacuum"
    ],
    roomba: [
      "irobot roomba",
      "robot vacuum"
    ],
    kitchenaid: [
      "kitchenaid mixer",
      "stand mixer"
    ]
  };

  return map[q.toLowerCase()] || [q];
}
function keepAlive() {
  setInterval(() => {
    console.log("Heartbeat: process alive");
  }, 30_000);
}

async function searchWalmart(query) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "walmart");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", SERPAPI_KEY);

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  const items = (json.organic_results || json.shopping_results || [])
    .slice(0, 2)
    .map(it => ({
      title: it.title,
      price: it.extracted_price || it.price,
      link: it.link
    }))
    .filter(x => x.title && x.link);

  return items;
}

async function scanOnce() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error("Invalid channel ID");
    return;
  }

  await channel.send(`🟢 Walmart scan running (${new Date().toLocaleTimeString()})`);

  for (const q of WATCHLIST.slice(0, 3)) {
  let allResults = [];

  for (const term of expandQuery(q)) {
    const res = await searchWalmart(term);
    allResults.push(...res);
  }

  if (!allResults.length) {
    await channel.send(`🔍 ${q}: no results (expanded search)`);
    continue;
  }

  for (const r of allResults.slice(0, 10)) {
    await channel.send(
      `🛒 **WALMART ITEM**\n` +
      `**${r.title}**\n` +
      (r.price ? `Price: $${r.price}\n` : "") +
      `${r.link}`
    );
  }
  }

client.once("ready", async () => {
  console.log("Bot online");

  keepAlive();              // 🔒 keeps Railway alive
  await scanOnce();         // run immediately

  setInterval(scanOnce, INTERVAL_MIN * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
