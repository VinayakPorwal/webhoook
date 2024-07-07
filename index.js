/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, GOOGLE_API_KEY } =
  process.env;

const handleMessage = async (userMessage) => {
  // Check if user message starts with "hey"

  // Prepare the request data
  const requestData = {
    contents: [
      {
        parts: [{ text: userMessage }],
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
    return response.data.candidates[0].content.parts[0].text; // Return generated content or handle it as needed
  } catch (error) {
    console.error("Error calling API:", error.message);
    return error.message; // Throw error for further handling or logging
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
    const messageText = message.text.body.toLowerCase();

    // Determine the response based on the message content
    let responseText;
    if (messageText.startsWith("hey")) {
      responseText = await handleMessage(messageText);
      // "*Appointment Reminder* \n Hello Name,\n Your appointment has been scheduled on 24-11-2024,On Day shift. \n Thank you for using our service. \n Best regards, Petmatrix";
    } else {
      return;
    }
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

    // Mark the incoming message as read
    // await axios({
    //   method: "POST",
    //   url: `https://graph.facebook.com/v18.0/${businessPhoneNumberId}/messages`,
    //   headers: {
    //     Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    //   },
    //   data: {
    //     messaging_product: "whatsapp",
    //     status: "read",
    //     message_id: message.id,
    //   },
    // });
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

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
