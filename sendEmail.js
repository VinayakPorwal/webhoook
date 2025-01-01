const axios = require('axios');
const nodemailer = require("nodemailer");
require("dotenv").config();
// Email configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
 
async function sendEmail(userMessage) {        
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
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

module.exports = { sendEmail };

