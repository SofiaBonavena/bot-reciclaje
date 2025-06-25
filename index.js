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
  process.exit(1);
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post("/webhook", async (req, res) => {
  const mediaUrl = req.body.MediaUrl0;
  const mediaType = req.body.MediaContentType0;
  const from = req.body.From;
  const userText = req.body.Body?.trim().toLowerCase();

  console.log("📥 Mensaje recibido de:", from);
  console.log("Media URL:", mediaUrl);
  console.log("Texto:", userText);

  // 💬 Mensaje de bienvenida cuando no hay imagen ni texto
  if (!mediaUrl && !userText) {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: "Hola, soy EY-EcoBot. ¿Qué te gustaría reciclar hoy? Podés enviarme una foto o escribir un nombre, por ejemplo: 'servilleta sucia', 'lata', 'botella de agua'..."
    });
    return res.sendStatus(200);
  }

  try {
    let gptResponse;

    // 👁️‍🗨️ Si viene una imagen
    if (mediaUrl) {
      console.log("🧪 Paso 1: Recibiendo imagen");
      const imageResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString("base64")}`
        }
      });
      console.log("🧪 Paso 2: Imagen descargada");

      const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Sos un asistente de reciclaje llamado EY-EcoBot. Ayudás a las personas a clasificar sus residuos. La respuesta debe tener este formato:

1) Hola, soy EY-EcoBot. ¿Qué te gustaría reciclar hoy?
2) Detecté: [objeto]
3) Tacho sugerido: (elegir una opción)

a) Tacho rojo (cans)  
b) Tacho verde (paper)  
c) Plastic (dry and clean)  
d) Trash (food scraps, used napkins, used papers, tea bags, dirty card board)  
e) Composta

4) ¿Sabías que [dato educativo breve sobre el reciclaje del objeto detectado]?`
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

      gptResponse = response.choices[0].message.content;
    }

    // 📝 Si viene un mensaje de texto (como "servilleta sucia")
    else if (userText) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Sos un asistente de reciclaje llamado EY-EcoBot. Ayudás a las personas a clasificar sus residuos. La respuesta debe tener este formato:

1) Hola, soy EY-EcoBot. ¿Qué te gustaría reciclar hoy?
2) Detecté: [objeto]
3) Tacho sugerido: (elegir una opción)

a) Tacho rojo (cans)  
b) Tacho verde (paper)  
c) Plastic (dry and clean)  
d) Trash (food scraps, used napkins, used papers, tea bags, dirty card board)  
e) Composta

4) ¿Sabías que [dato educativo breve sobre el reciclaje del objeto detectado]?`
          },
          {
            role: "user",
            content: `Quiero reciclar esto: ${userText}`
          }
        ]
      });

      gptResponse = response.choices[0].message.content;
    }

    // 📤 Enviamos la respuesta por WhatsApp
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: gptResponse
    });

    console.log("✅ Mensaje enviado correctamente");
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

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: "Lo siento, no pude procesar tu imagen o mensaje. ¿Podés intentar de nuevo?"
    });

    res.status(500).send("Hubo un error procesando el mensaje.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

