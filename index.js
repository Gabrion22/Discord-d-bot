import "dotenv/config";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.DEALS_CHANNEL_ID;
const INTERVAL_MIN = Number(process.env.SCAN_INTERVAL_MINUTES || 15);
const WATCHLIST = (process.env.WATCHLIST || "").split("|").map(s => s.trim()).filter(Boolean);

const posted = new Set();

async function ebayPrice(q) {
  const auth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
  });

  const token = (await tokenRes.json()).access_token;

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    }
  );

  const json = await res.json();
  const prices = (json.itemSummaries || [])
    .map(i => Number(i.price?.value))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!prices.length) return null;
  return prices[Math.floor(prices.length / 2)];
}

function dealKey(title) {
  return title.toLowerCase().slice(0, 120);
}

async function scan() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  for (const q of WATCHLIST) {
    const ebay = await ebayPrice(q);
    if (!ebay) continue;

    if (posted.has(dealKey(q))) continue;
    posted.add(dealKey(q));

    await channel.send(
      `🔥 **Deal Found**\n` +
      `Item: **${q}**\n` +
      `eBay median: **$${ebay.toFixed(2)}**`
    );
  }
}

client.once("ready", () => {
  console.log("Bot online");
  scan();
  setInterval(scan, INTERVAL_MIN * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
