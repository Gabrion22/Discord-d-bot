import "dotenv/config";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.DEALS_CHANNEL_ID;
const INTERVAL_MIN = Number(process.env.SCAN_INTERVAL_MINUTES || 15);
const TEST_MODE = String(process.env.TEST_MODE || "false").toLowerCase() === "true";
const DISABLE_EBAY = String(process.env.DISABLE_EBAY || "false").toLowerCase() === "true";

const WATCHLIST = (process.env.WATCHLIST || "")
  .split("|")
  .map(s => s.trim())
  .filter(Boolean);

// dedupe per run so it doesn't spam
const posted = new Set();

async function send(channel, msg) {
  try {
    await channel.send(msg);
  } catch (e) {
    console.error("Send failed:", e?.message || e);
  }
}

async function getEbayToken() {
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

  if (!tokenRes.ok) {
    throw new Error(`eBay token error: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const data = await tokenRes.json();
  return data.access_token;
}

async function ebayMedianAsk(keyword) {
  const token = await getEbayToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(keyword)}&limit=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    }
  );

  if (!res.ok) {
    throw new Error(`eBay search error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const prices = (json.itemSummaries || [])
    .map(i => Number(i.price?.value))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return null;
  return prices[Math.floor(prices.length / 2)];
}

function nowStamp() {
  return new Date().toLocaleString();
}

async function scanOnce() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error("Could not fetch channel. Check DEALS_CHANNEL_ID.");
    return;
  }

  // ✅ Always post a heartbeat in TEST_MODE
  if (TEST_MODE) {
    await send(
      channel,
      `🧪 **TEST MODE**\nScanner is running ✅\nTime: **${nowStamp()}**\nWatchlist: **${WATCHLIST.join(" | ") || "(empty)"}**`
    );
  }

  if (DISABLE_EBAY) {
    if (TEST_MODE) {
      await send(channel, `🟡 eBay is disabled (DISABLE_EBAY=true). Waiting for approval/keys.`);
    }
    return;
  }

  // Normal mode: try eBay pricing for each keyword
  for (const q of WATCHLIST) {
    const k = q.toLowerCase();
    if (posted.has(k)) continue;

    try {
      const median = await ebayMedianAsk(q);
      if (!median) continue;

      posted.add(k);
      await send(channel, `🔥 **Scan Hit**\nItem: **${q}**\neBay median ask: **$${median.toFixed(2)}**\nTime: ${nowStamp()}`);
    } catch (e) {
      console.error(`Scan failed for "${q}":`, e?.message || e);
      if (TEST_MODE) {
        await send(channel, `⚠️ TEST: scan error for **${q}**: \`${e?.message || e}\``);
      }
    }
  }
}

client.once("ready", async () => {
  console.log("Bot online");

  // run immediately on startup
  await scanOnce();

  // then on interval
  setInterval(scanOnce, INTERVAL_MIN * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
