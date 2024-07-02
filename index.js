const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const token = process.env.WHATSAPP_TOKEN;
const verifyToken = process.env.VERIFY_TOKEN;

app.listen(process.env.PORT, () => {
  console.log(`Webhook is listening on port ${process.env.PORT}`);
});

// Verify the callback URL from the WhatsApp Cloud API dashboard
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages from the WhatsApp Cloud API
app.post("/webhook", (req, res) => {
  const body = req.body;

  console.log(JSON.stringify(body, null, 2));

  if (body.object) {
    const entry = body.entry && body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value = changes && changes.value;
    const messages = value && value.messages && value.messages[0];

    if (messages) {
      const phoneNumberId = value.metadata.phone_number_id;
      const from = messages.from;
      const msgBody = messages.text.body;

      console.log(`Phone number ID: ${phoneNumberId}`);
      console.log(`From: ${from}`);
      console.log(`Message body: ${msgBody}`);

      axios({
        method: "POST",
        url: `https://graph.facebook.com/v13.0/${phoneNumberId}/messages?access_token=${token}`,
        data: {
          messaging_product: "whatsapp",
          to: from,
          text: { body: `Hi, I'm Prasath. You said: ${msgBody}` },
        },
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => {
          console.log("Message sent successfully");
        })
        .catch((error) => {
          console.error("Error sending message:", error);
        });

      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
});

// Root endpoint for testing
app.get("/", (req, res) => {
  res.status(200).send("Hello, this is the webhook setup");
});
