require("dotenv").config(); // Load environment variables from .env file

const { Telegraf } = require("telegraf");
const bwipjs = require("bwip-js"); // For generating barcodes
const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose(); // Add SQLite

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Register a custom font
registerFont("./Arial.ttf", { family: "Arial" });

const adminUserIds = process.env.ADMIN_USER_IDS.split(",").map((id) =>
  parseInt(id.trim(), 10)
);

// Initialize and configure the SQLite database
let db = new sqlite3.Database("./subscribers.db", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to the SQLite database.");
});

// Create the subscribers table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT
)`);

// Generate barcode
async function generateBarcode(data) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "code128", // Barcode type
        text: data, // Text to encode
        scale: 3, // 3x scaling factor
        height: 20, // Bar height, in millimeters
        includetext: false, // Show human-readable text
        textxalign: "center", // Always good to set this
        width: 99,
      },
      function (err, png) {
        if (err) {
          reject(err);
        } else {
          const barcodeFileName = `${data}.png`;
          fs.writeFileSync(barcodeFileName, png);
          resolve(barcodeFileName);
        }
      }
    );
  });
}

// Create membership card
async function createCard(barcode_file, card_number) {
  const canvas = createCanvas(1024, 640);
  const ctx = canvas.getContext("2d");

  // Load template image
  const template = await loadImage("./template.png");
  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

  // Add text
  ctx.font = "38px Arial";
  ctx.fillStyle = "black";

  // Add card number above the barcode
  ctx.font = "38px Arial";
  const cardNumberX = (canvas.width - ctx.measureText(card_number).width) / 2;
  ctx.fillText(card_number, cardNumberX, 280);

  // Load barcode image
  const barcode = await loadImage(barcode_file);
  const barcodeX = (canvas.width - barcode.width) / 2; // Center barcode horizontally
  ctx.drawImage(barcode, barcodeX, 300);

  // Save output image
  const outputCardFileName = "output_card.png";
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputCardFileName, buffer);

  // Clean up
  fs.unlinkSync(barcode_file); // Remove the barcode image

  return outputCardFileName;
}

// Store subscriber information
function storeSubscriber(user) {
  db.run(
    `INSERT OR IGNORE INTO subscribers (user_id, username, first_name, last_name) VALUES (?, ?, ?, ?)`,
    [user.id, user.username, user.first_name, user.last_name],
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log(`Stored subscriber ${user.username || user.first_name}`);
    }
  );
}

// Bot command handlers
bot.start((ctx) => {
  storeSubscriber(ctx.message.from); // Store subscriber information
  ctx.reply("Welcome! Use /get_card to get your membership card.");
});

bot.command("get_card", async (ctx) => {
  storeSubscriber(ctx.message.from); // Store subscriber information
  const user = ctx.message.from;
  const barcode_data = String(user.id).slice(-9);
  const card_number = barcode_data;

  try {
    const barcode_file = await generateBarcode(barcode_data);
    const card_file = await createCard(barcode_file, card_number);

    // Send the generated card
    await ctx.replyWithPhoto({ source: card_file });

    // Clean up
    fs.unlinkSync(card_file); // Remove the output card image
  } catch (error) {
    console.error("Error generating card:", error);
    ctx.reply("Sorry, there was an error generating your card.");
  }
});

// Command to list subscribers (only for admins)
bot.command("list_subscribers", (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminUserIds.includes(userId)) {
    return ctx.reply("You are not authorized to use this command.");
  }

  db.all(`SELECT * FROM subscribers`, [], (err, rows) => {
    if (err) {
      return console.error(err.message);
    }
    let response = "Subscribers:\n";
    rows.forEach((row) => {
      response += `${row.first_name} (${row.username || row.user_id})\n`;
    });
    ctx.reply(response);
  });
});

// Start bot
bot.launch();

// Start Express server
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Telegram bot is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
