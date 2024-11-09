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
const emailAuthTokens = new Map(); // Store email authentication tokens

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const generateAuthToken = () => {
  return Math.random().toString(36).substring(2, 15);
};

const sendAuthenticationEmail = async (email, authToken) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Authentication Token for WhatsApp Bot',
    text: `Your authentication token is: ${authToken}\nPlease send this token to the WhatsApp bot to complete authentication.`
  };

  await transporter.sendMail(mailOptions);
};

const handleMessage = async (userMessage, userId) => {
  // Retrieve or initialize chat history for the user
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const userHistory = chatHistory.get(userId);

  // Check for email authentication command
  if (userMessage.toLowerCase().startsWith('authenticate')) {
    const email = userMessage.split(' ')[1];
    if (email && email.includes('@')) {
      const authToken = generateAuthToken();
      emailAuthTokens.set(email, authToken);
      await sendAuthenticationEmail(email, authToken);
      return `Authentication email sent to ${email}. Please check your email and send the token to complete authentication.`;
    }
    return "Please provide a valid email address. Format: authenticate your@email.com";
  }

  // Check if message is an authentication token
  if (emailAuthTokens.size > 0 && /^[a-z0-9]+$/.test(userMessage)) {
    for (const [email, token] of emailAuthTokens.entries()) {
      if (token === userMessage) {
        // Here you can integrate with Composio API
        try {
          const composioResponse = await axios.post('https://api.compos.io/authenticate', {
            api_key: COMPOSIO_API_KEY,
            email: email
          });
          emailAuthTokens.delete(email);
          return `Successfully authenticated with Composio for ${email}!`;
        } catch (error) {
          return "Failed to authenticate with Composio. Please try again.";
        }
      }
    }
    return "Invalid authentication token. Please try again.";
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
    const messageText = message.text.body.toLowerCase();

    // Determine the response based on the message content
    let responseText;
    const userId = from; // Use the 'from' number as the user ID
    responseText = await handleMessage(messageText, userId);
    // "*Appointment Reminder* \n Hello Name,\n Your appointment has been scheduled on 24-11-2024,On Day shift. \n Thank you for using our service. \n Best regards, Petmatrix";
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

app.get("/", async (req, res) => {
  const data = await handleMessage("hey opal whatrsap", "01oo0");
  res.send(`<pre>Nothing to see here. ${data}
Checkout README.md to start.${WEBHOOK_VERIFY_TOKEN}</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
