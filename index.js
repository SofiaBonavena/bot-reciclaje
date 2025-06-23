const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const twilio = require("twilio");
require("dotenv").config();

if (
  !process.env.OPENAI_API_KEY ||
  !process.env.TWILIO_ACCOUNT_SID ||
  !process.env.TWILIO_AUTH_TOKEN ||
  !process.env.TWILIO_WHATSAPP_NUMBER
) {
  console.error("❌ Faltan variables de entorno. Verificá que estén todas cargadas en Railway.");
  process.exit(1); // detiene la app si faltan variables
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Inicialización de APIs
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post("/webhook", async (req, res) => {
  // 📥 Datos entrantes de WhatsApp
  const mediaUrl = req.body.MediaUrl0;
  const mediaType = req.body.MediaContentType0;  // ahora sí lo obtenemos
  const from = req.body.From;

  console.log("📥 Mensaje recibido de:", from);
  console.log("Media URL:", mediaUrl);
  console.log("Tipo de archivo:", mediaType);

  if (!mediaUrl) {
    return res.send("Por favor envía una imagen para clasificar.");
  }

  try {
    // 🔄 Descarga la imagen desde Twilio
    const imageResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      // Si tu sandbox o credenciales Twilio requieren cabecera auth:
      // headers: {
      //   Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`
      // }
    });
    console.log("✅ Imagen descargada desde Twilio");

    // 🔀 Preparo la imagen en base64 para OpenAI
    const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");

    // 📡 Llamo a OpenAI con visión
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
                // incluimos el mediaType para que GPT sepa el formato
                url: `data:${mediaType};base64,${imageBase64}`
              }
            }
          ]
        }
      ]
    });
    console.log("Respuesta recibida de OpenAI");

    // 📨 Envía la respuesta al usuario por WhatsApp
    const reply = response.choices[0].message.content;
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: reply
    });
    console.log("📤 Respuesta enviada a WhatsApp");

    res.sendStatus(200);
  } catch (error) {
  console.error("🔥 ERROR GENERAL:");

  if (error.response) {
    // Errores de API (como OpenAI o descarga fallida de imagen)
    console.error("➡️ Status:", error.response.status);
    console.error("➡️ Data:", error.response.data);
  } else if (error.request) {
    // El request se hizo pero no se obtuvo respuesta
    console.error("➡️ Request sin respuesta:", error.request);
  } else {
    // Cualquier otro error (de sintaxis, etc.)
    console.error("➡️ Mensaje:", error.message);
  }

  res.status(500).send("Hubo un error procesando la imagen.");
  } 
});

// 📡 Escucha en el puerto dinámico de Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
