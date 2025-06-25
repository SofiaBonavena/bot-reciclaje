const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const twilio = require("twilio");
require("dotenv").config();

// 🚨 Verificamos que las variables estén definidas
if (
  !process.env.TWILIO_ACCOUNT_SID ||
  !process.env.TWILIO_AUTH_TOKEN ||
  !process.env.TWILIO_WHATSAPP_NUMBER ||
  !process.env.HUGGINGFACE_API_TOKEN
) {
  console.error("❌ Faltan variables de entorno. Verificá que estén todas cargadas en Railway.");
  process.exit(1);
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Diccionario de clasificación y frases educativas
const clasificarResiduo = (label) => {
  const l = label.toLowerCase();

  if (l.includes("banana") || l.includes("apple") || l.includes("egg") || l.includes("fruit")) {
    return {
      tacho: "e) Composta",
      dato: "Las cáscaras de frutas se descomponen naturalmente y enriquecen la tierra."
    };
  }
  if (l.includes("can") || l.includes("aluminum")) {
    return {
      tacho: "a) Tacho rojo (cans)",
      dato: "¿Sabías que reciclar una lata ahorra el 95% de la energía que se usaría en hacer una nueva?"
    };
  }
  if (l.includes("bottle") || l.includes("plastic") || l.includes("container")) {
    return {
      tacho: "c) Plastic (dry and clean)",
      dato: "El plástico limpio puede reciclarse y reutilizarse para crear nuevos productos."
    };
  }
  if (l.includes("paper") || l.includes("newspaper") || l.includes("book")) {
    return {
      tacho: "b) Tacho verde (paper)",
      dato: "Reciclar papel reduce la tala de árboles y ahorra agua y energía."
    };
  }
  if (l.includes("napkin") || l.includes("dirty") || l.includes("food") || l.includes("scraps")) {
    return {
      tacho: "d) Trash (food scraps, used napkins, etc.)",
      dato: "Los residuos sucios o contaminados no pueden reciclarse y deben desecharse."
    };
  }

  // Valor por defecto
  return {
    tacho: "d) Trash (food scraps, used napkins, etc.)",
    dato: "Recordá que si un residuo está sucio o contaminado, debe ir a la basura común."
  };
};

const classifyImage = async (base64Image) => {
  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/microsoft/resnet-50",
      { inputs: base64Image },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (err) {
    console.error("❌ Error al usar Hugging Face:", err.response?.data || err.message);
    return null;
  }
};

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

  try {
    const imageResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString("base64")}`
      }
    });

    const imageBase64 = Buffer.from(imageResponse.data, "binary").toString("base64");
    const dataUri = `data:${mediaType};base64,${imageBase64}`;

    const result = await classifyImage(dataUri);

    if (!result || result.error || !result[0]) {
      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from,
        body: "Lo siento, no pude clasificar la imagen. Intentá con otra o escribí el nombre del residuo (ej: 'servilleta sucia')."
      });
      return res.sendStatus(200);
    }

    const topPrediction = result[0].label;
    const confidence = (result[0].score * 100).toFixed(2);

    const clasificacion = clasificarResiduo(topPrediction);

    const mensaje = `1️⃣ Hola, soy EY-EcoBot. ¿Qué te gustaría reciclar hoy?\n\n2️⃣ Detecté: *${topPrediction}* (${confidence}% de confianza)\n\n3️⃣ Tacho sugerido: *${clasificacion.tacho}*\n\n4️⃣ 📚 ${clasificacion.dato}`;

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: mensaje
    });

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
      body: "Hubo un error procesando tu imagen 😢. Intentá nuevamente."
    });

    res.status(500).send("Error interno.");
  }
});

app.get("/", (req, res) => {
  res.send("🌱 Bot de reciclaje funcionando correctamente");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
