const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const twilio = require("twilio");
require("dotenv").config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post("/webhook", async (req, res) => {
  const mediaUrl = req.body.MediaUrl0;
  const from = req.body.From;

  if (!mediaUrl) {
    return res.send("Por favor envía una imagen para clasificar.");
  }

  try {
    const imageResponse = await axios.get(mediaUrl, { responseType: "arraybuffer" });
    const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Sos un asistente de reciclaje. Analizás imágenes de residuos y decís en qué tacho va: reciclable, orgánico, compost, etc. Sé claro y explicá por qué."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "¿Dónde debería tirar esto?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }
      ]
    });

    const reply = response.choices[0].message.content;

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: reply
    });

    res.send("OK");
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send("Hubo un error procesando la imagen.");
  }
});

app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});
