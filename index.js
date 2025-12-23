import "dotenv/config";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.DEALS_CHANNEL_ID;
const INTERVAL_MIN = Number(process.env.SCAN_INTERVAL_MINUTES || 10);
const DISABLE_EBAY = String(process.env.DISABLE_EBAY || "false") === "true";
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const WATCHLIST = (process.env.WATCHLIST || "")
  .split("|")
  .map(s => s.trim())
  .filter(Boolean);

async function searchWalmart(query) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "walmart");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", SERPAPI_KEY);

  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  const items = json.organic_results || json.shopping_results || [];

  return items.slice(0, 3).map(it => ({
    title: it.title,
    price: it.price || it.extracted_price,
    link: it.link
  })).filter(x => x.title && x.price && x.link);
}

async function scanOnce() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  for (const q of WATCHLIST) {
    const results = await searchWalmart(q);
    for (const r of results) {
      await channel.send(
        `🛒 **WALMART ITEM FOUND**\n` +
        `**${r.title}**\n` +
        `Price: **$${r.price}**\n` +
        `${r.link}`
      );
    }
  }
}

client.once("ready", async () => {
  console.log("Bot online");
  await scanOnce();
  setInterval(scanOnce, INTERVAL_MIN * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
