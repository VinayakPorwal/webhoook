const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
require("dotenv").config();

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN;
const PORT = process.env.PORT;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

const chatHistory = new Map();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const handleMessage = async (userMessage, userId) => {
  // Retrieve or initialize chat history for the user
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const userHistory = chatHistory.get(userId);

  // Check for email command
  if (userMessage.toLowerCase().startsWith('/email')) {
    const parts = userMessage.split(' ');
    const email = parts[1];
    const content = parts.slice(2).join(' ');

    if (!email || !email.includes('@')) {
      return "Please provide a valid email address. Format: /email recipient@email.com your message";
    }

    if (!content) {
      return "Please provide a message to send. Format: /email recipient@email.com your message";
    }
    try {
      // Use AI to generate email subject and enhanced message
      const aiResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`,
        {
          contents: [{
            parts: [{
              text: `You are a professional email assistant. 
              
              Original message: ${content}
              
              If the original message contains "set subject exactly this -" followed by text in quotes,
              use that exact text as the subject. Otherwise, create a suitable subject.

              If the message contains "from:" followed by a name, use that name as the sender name.
              Otherwise use the name extracted from ${process.env.EMAIL_USER}.
              
              Your task is to:
              1. Extract subject if specified, otherwise create one
              2. Extract sender name if specified, otherwise extract from email
              3. Enhance the message to be more professional while keeping the original meaning
              4. Ensure proper email formatting
              
              Respond in valid JSON format like this:
              {
                "subject": "Subject line here",
                "message": "Enhanced message here",
                "senderName": "Name here"
              }
              
              Only return the JSON object, no other text.`
            }]
          }]
        },
        {
          headers: {
            "Content-Type": "application/json",
          }
        }
      );

      console.log('AI Response:', JSON.stringify(aiResponse.data, null, 2));

      // Validate AI response structure
      if (!aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid AI response format");
      }

      const aiText = aiResponse.data.candidates[0].content.parts[0].text;
      console.log('Extracted AI Text:', aiText);

      // Parse the JSON response
      let emailData;
      try {
        emailData = JSON.parse(aiText);
      } catch (error) {
        throw new Error("Failed to parse AI response as JSON");
      }

      // Validate the email data structure
      if (!emailData.subject || !emailData.message) {
        throw new Error("Invalid email data structure");
      }

      const { subject, message } = emailData;

      // Validate that subject and message are not empty
      if (!subject.trim() || !message.trim()) {
        throw new Error("Generated email subject or message is empty");
      }

      // Send the email
      const info = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        text: message
      });

      return `Email sent successfully to ${email}!\nSubject: ${subject}\nMessage: ${message}\nMessage ID: ${info.messageId}`;
    } catch (error) {
      console.error("Error:", error.message);
      return `Failed to send email: ${error.message}`;
    }
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
Checkout README.md to start.${WEBHOOK_VERIFY_TOKEN}</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
