const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const twilio = require("twilio");
require("dotenv").config();

// ✅ Verificamos que las variables estén definidas
if (
  !process.env.OPENAI_API_KEY ||
  !process.env.TWILIO_ACCOUNT_SID ||
  !process.env.TWILIO_AUTH_TOKEN ||
  !process.env.TWILIO_WHATSAPP_NUMBER
) {
  console.error("❌ Faltan variables de entorno. Verificá que estén todas cargadas en Railway.");
  process.exit(1);
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// 🔐 Inicialización de APIs
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post("/webhook", async (req, res) => {
  const mediaUrl = req.body.MediaUrl0;
  const mediaType = req.body.MediaContentType0;
  const from = req.body.From;

  console.log("📥 Mensaje recibido de:", from);
  console.log("Media URL:", mediaUrl);
  console.log("Tipo de archivo:", mediaType);

  if (!mediaUrl) {
    return res.send("Por favor envía una imagen para clasificar.");
  }

  // 🌟 LOGS paso a paso para identificar errores internos
  try {
    console.log("🧪 Paso 1: Media URL recibida");

    const imageResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString("base64")}`
      }
    });
    console.log("🧪 Paso 2: Imagen descargada desde Twilio");

    const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");
    console.log("🧪 Paso 3: Imagen convertida a base64");

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
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${imageBase64}`
              }
            }
          ]
        }
      ]
    });
    console.log("🧪 Paso 4: Respuesta recibida de OpenAI");

    const reply = response.choices[0].message.content;
    console.log("🧪 Paso 5: Mensaje de respuesta generado");

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: reply
    });
    console.log("🧪 Paso 6: Mensaje enviado por WhatsApp");

    res.sendStatus(200);
  } catch (error) {
    console.error("🔥 ERROR GENERAL:");
    if (error.response) {
      console.error("➡️ Status:", error.response.status);
      console.error("➡️ Data:", error.response.data);
    } else if (error.request) {
      console.error("➡️ Request sin respuesta:", error.request);
    } else {
      console.error("➡️ Mensaje:", error.message);
    }

    res.status(500).send("Hubo un error procesando la imagen.");
  }
});

// 🌍 Escucha en Railway (puerto 8080)
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.send("🌱 Bot de reciclaje funcionando correctamente");
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});