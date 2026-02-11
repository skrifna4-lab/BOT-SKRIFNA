import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4531;

// =========================
// CONFIGURACIÓN CANAL
// =========================
const CANAL_ID = "120363405239179634@newsletter";
const CANAL_NOMBRE = "⚙️ SKRIFNA BOT ⚙️";

const fakeQuoted = {
  key: {
    participant: "0@s.whatsapp.net",
    remoteJid: "status@broadcast",
    fromMe: false,
    id: "Senku"
  },
  message: {
    locationMessage: {
      name: "SKRIFNA.UK",
      jpegThumbnail: Buffer.alloc(0)
    }
  },
  participant: "0@s.whatsapp.net"
};

// =========================
// VARIABLES GLOBALES
// =========================
let sock;
let qrCodeData = null;
let isConnected = false;

// =========================
// EXTENDER SOCKET
// =========================
const extenderConCanal = (sock) => {
  if (sock.__canalExtendido) return;
  sock.__canalExtendido = true;

  sock.sendMessage2 = async (jid, content, quoted = null, options = {}) => {

    if (content.sticker) {
      return sock.sendMessage(jid, { sticker: content.sticker }, {
        quoted,
        ...options
      });
    }

    const message = {
      ...content,
      contextInfo: {
        ...(content.contextInfo || {}),
        forwardedNewsletterMessageInfo: {
          newsletterJid: CANAL_ID,
          serverMessageId: "120363405239179634",
          newsletterName: CANAL_NOMBRE
        },
        forwardingScore: 9999999,
        isForwarded: true
      }
    };

    return sock.sendMessage(jid, message, {
      quoted,
      ephemeralExpiration: 86400000,
      disappearingMessagesInChat: 86400000,
      ...options
    });
  };
};

// =========================
// INICIAR BOT
// =========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  });

  extenderConCanal(sock);

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

    console.log("Mensaje recibido");
  });
}

startBot();

// =========================
// RUTA PRINCIPAL
// =========================
app.get("/", (req, res) => {

  if (isConnected) {
    return res.send(`
      <html>
        <body style="font-family:Arial;text-align:center;margin-top:50px;">
          <h2 style="color:green;">✅ BOT CONECTADO</h2>
        </body>
      </html>
    `);
  }

  if (qrCodeData) {
    return res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="text-align:center;margin-top:50px;">
          <h2>Escanea el QR</h2>
          <img src="${qrCodeData}" />
        </body>
      </html>
    `);
  }

  res.send("Inicializando...");
});

// =========================
// ENDPOINT ENVÍO
// =========================
app.post("/send", async (req, res) => {

  try {
    const { number, type, message, mediaUrl } = req.body;

    if (!number || !type) {
      return res.status(400).json({
        error: "number y type son obligatorios"
      });
    }

    if (!isConnected) {
      return res.status(500).json({
        error: "Bot no conectado"
      });
    }

    const jid = number + "@s.whatsapp.net";
    let content = {};

    switch (type) {

      case "text":
        if (!message)
          return res.status(400).json({ error: "Falta message" });

        content = { text: message };
        break;

      case "image":
        if (!mediaUrl)
          return res.status(400).json({ error: "Falta mediaUrl" });

        content = {
          image: { url: mediaUrl },
          caption: message || ""
        };
        break;

      case "audio":
        if (!mediaUrl)
          return res.status(400).json({ error: "Falta mediaUrl" });

        content = {
          audio: { url: mediaUrl },
          mimetype: "audio/mp4",
          ptt: true
        };
        break;

      case "video":
        if (!mediaUrl)
          return res.status(400).json({ error: "Falta mediaUrl" });

        content = {
          video: { url: mediaUrl },
          caption: message || ""
        };
        break;

      case "document":
        if (!mediaUrl)
          return res.status(400).json({ error: "Falta mediaUrl" });

        content = {
          document: { url: mediaUrl },
          fileName: message || "archivo.pdf",
          mimetype: "application/pdf"
        };
        break;

      default:
        return res.status(400).json({
          error: "Tipo no soportado"
        });
    }

    await sock.sendMessage2(jid, content, fakeQuoted);

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
