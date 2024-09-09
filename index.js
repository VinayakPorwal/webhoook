const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
require("dotenv").config();

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PORT = process.env.PORT;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Create a map to store chat history for each user
const chatHistory = new Map();

const handleMessage = async (userMessage, userId) => {
  // Get or initialize chat history for the user
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const userChatHistory = chatHistory.get(userId);

  // Add the new message to the chat history
  userChatHistory.push({ role: "user", content: userMessage });

  // Keep only the last 10 messages
  while (userChatHistory.length > 10) {
    userChatHistory.shift();
  }

  // Prepare the request data with chat history
  const requestData = {
    contents: [
      {
        parts: userChatHistory.map((msg) => ({
          text: `${msg.role}: ${msg.content}`,
        })),
      },
      {
        parts: [
          { text: `assistant: Based on our conversation, here's my response:` },
        ],
      },
    ],
  };

  try {
    // Make POST request to Google Cloud Natural Language API endpoint
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Handle API response
    const assistantResponse = response.data.candidates[0].content.parts[0].text;

    // Add the assistant's response to the chat history
    userChatHistory.push({ role: "assistant", content: assistantResponse });

    // Keep only the last 10 messages again
    while (userChatHistory.length > 10) {
      userChatHistory.shift();
    }

    return assistantResponse;
  } catch (error) {
    console.error("Error calling API:", error.message);
    return error.message;
  }
};

app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];

  if (message?.type === "text") {
    const businessPhoneNumberId =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
    const from = message.from;
    const messageText = message.text.body.toLowerCase();

    let responseText;
    if (messageText.startsWith("hey") || chatHistory.has(from)) {
      responseText = await handleMessage(messageText, from);
    } else {
      return;
    }
    console.log(responseText);

    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v18.0/${businessPhoneNumberId}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to: from,
        text: { body: responseText },
        context: {
          message_id: message.id,
        },
      },
    });
  }

  res.sendStatus(200);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.${WEBHOOK_VERIFY_TOKEN}</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
