const express = require("express");
const axios = require("axios");
// const getPNRDetails= require("./getPNR");
const { sendEmail } = require("./sendEmail");


const app = express();
app.use(express.json());
// app.use(getPNRDetails);
require("dotenv").config();

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PORT = process.env.PORT;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

const chatHistory = new Map();



const handleMessage = async (userMessage, userId) => {
  // Retrieve or initialize chat history for the user
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const userHistory = chatHistory.get(userId);

  // Check for email command
  if (userMessage.toLowerCase().startsWith("/email")) {
    await sendEmail(userMessage); 
  }

  else if (userMessage.toLowerCase().startsWith("/pnr")) {
    const pnr = userMessage.split(" ")[1];
      // const pnrData = await fetch(`/pnr/${pnr}`);
      // const data = await pnrData.json();
      return "data.data.data";
  }

  // Add user message to history
  userHistory.push({ role: "user", content: userMessage });

  // Prepare the request data with chat history
  const requestData = {
    contents: [
      {
        parts: [
          {
            text: "You are a helpful assistant. Respond to the user's message based on the conversation history.",
          },
          ...userHistory
            .slice(-10)
            .map((msg) => ({ text: `${msg.role}: ${msg.content}` })),
          { text: "assistant: " },
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

    // Add assistant response to history
    userHistory.push({ role: "assistant", content: assistantResponse });

    // Trim history to keep only last 10 messages
    while (userHistory.length > 10) {
      userHistory.shift();
    }

    return assistantResponse;
  } catch (error) {
    console.error("Error calling API:", error.message);
    return error.message;
  }
};

app.post("/webhook", async (req, res) => {
  // Log incoming messages
  // console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // Check if the webhook request contains a message
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];

  // Check if the incoming message contains text
  if (message?.type === "text") {
    // Extract the business number to send the reply from it
    const businessPhoneNumberId =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
    const from = message.from;
    const messageText = message.text.body;

    // Determine the response based on the message content
    let responseText;
    const userId = from; // Use the 'from' number as the user ID
    responseText = await handleMessage(messageText, userId);
    console.log(responseText);

    // Send the reply message
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
          message_id: message.id, // Shows the message as a reply to the original user message
        },
      },
    });
  }

  res.sendStatus(200);
});

// Accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// Info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // Respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // Respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/", async (req, res) => {
  const data = await handleMessage("hey opal whatrsap", "01oo0");
  res.send(`<pre>Nothing to see here. ${data}
Checkout README.md to start</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
