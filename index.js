import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import fs from "fs";

const app = express();
app.use(express.json());

const PORT = 4531;

let sock;
let qrCodeData = null;
let isConnected = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      console.log("✅ Conectado correctamente");
      isConnected = true;
      qrCodeData = null;
    }

    if (connection === "close") {
      isConnected = false;
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        startBot();
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;

    if (msg.message.conversation) {
      console.log("Mensaje recibido:", msg.message.conversation);
    }
  });
}

startBot();


// ===============================
// RUTA PRINCIPAL (QR o estado)
// ===============================
app.get("/", (req, res) => {
  if (isConnected) {
    return res.send(`
      <html>
        <head>
          <title>Bot WhatsApp</title>
        </head>
        <body style="font-family:Arial;text-align:center;margin-top:50px;">
          <h2 style="color:green;">✅ Conectado correctamente</h2>
        </body>
      </html>
    `);
  }

  if (qrCodeData) {
    return res.send(`
      <html>
        <head>
          <title>Escanear QR</title>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="font-family:Arial;text-align:center;margin-top:50px;">
          <h2>Escanea el QR</h2>
          <img src="${qrCodeData}" />
          <p>La página se actualiza automáticamente...</p>
        </body>
      </html>
    `);
  }

  res.send("Inicializando...");
});


// ===============================
// ENDPOINT PARA ENVIAR MENSAJE
// ===============================
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        error: "Falta number o message"
      });
    }

    if (!isConnected) {
      return res.status(500).json({
        error: "Bot no conectado"
      });
    }

    const formattedNumber = number + "@s.whatsapp.net";

    await sock.sendMessage(formattedNumber, {
      text: message
    });

    res.json({
      success: true,
      message: "Mensaje enviado correctamente"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Error enviando mensaje"
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
