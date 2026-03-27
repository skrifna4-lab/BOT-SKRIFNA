import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";  
import fs from "fs"; // Para guardar el ID del grupo persistentemente

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4531;
const AUTH_FOLDER = "/data/autah";
const ID_FILE = "./last_group_id.json"; // Archivo para guardar el ID del grupo

let sock;
let qrCodeData = null;
let isConnected = false;
let ultimoGroupId = fs.existsSync(ID_FILE) ? JSON.parse(fs.readFileSync(ID_FILE)) : null;

/* =========================
   INICIAR BOT
   ========================= */

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


async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  // Lógica para capturar el ID del grupo con el comando !grupo
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const jid = msg.key.remoteJid;

    if (texto === "!grupo") {
      ultimoGroupId = jid;
      fs.writeFileSync(ID_FILE, JSON.stringify(ultimoGroupId));
      await sock.sendMessage(jid, { text: "✅ ID de grupo capturado: " + jid });
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;
    if (qr) qrCodeData = await QRCode.toDataURL(qr);
    if (connection === "open") {
      console.log("✅ Conectado correctamente");
      isConnected = true;
      qrCodeData = null;
    }
    if (connection === "close") {
      isConnected = false;
      startBot();
    }
  });
}

startBot();

/* =========================
   ENDPOINT: AGREGAR A GRUPO
   ========================= */
/* =========================
   ENDPOINT: AGREGAR A GRUPO
   (Con prefijo 51 automático)
   ========================= */
// Función para generar una espera aleatoria entre 5 y 10 segundos
const randomDelay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * 5000) + 5000));

app.post("/add-to-group", async (req, res) => {
  try {
    const { numbers } = req.body; 

    if (!isConnected) return res.status(500).json({ error: "Bot no conectado" });
    if (!ultimoGroupId) return res.status(400).json({ error: "Primero escribe !grupo" });
    if (!Array.isArray(numbers)) return res.status(400).json({ error: "numbers debe ser un array" });

    const resultados = [];

    // Procesamos uno por uno con espera
    for (const n of numbers) {
      const cleanNumber = n.startsWith("51") ? n : `51${n}`;
      const jid = cleanNumber.includes("@s.whatsapp.net") ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

      try {
        console.log(`Intentando agregar a: ${jid}...`);
        await sock.groupParticipantsUpdate(ultimoGroupId, [jid], "add");
        resultados.push({ number: n, status: "ok" });
      } catch (err) {
        console.error(`Error agregando a ${jid}:`, err.message);
        resultados.push({ number: n, status: "error", error: "Quizás privacidad o no existe" });
      }

      // ESPERA HUMANA: Cada vez que agrega a uno, espera entre 5 a 10 segundos
      await randomDelay();
    }

    res.json({ success: true, detalles: resultados });
  } catch (e) {
    res.status(500).json({ error: "Error en el servidor: " + e.message });
  }
});
// Panel de control básico
app.get("/", (req, res) => {
  if (isConnected) return res.send("<h2>✅ BOT CONECTADO</h2><p>Grupo actual: " + (ultimoGroupId || "Ninguno") + "</p>");
  if (qrCodeData) return res.send(`<meta http-equiv="refresh" content="5"><h2>Escanea el QR</h2><img src="${qrCodeData}" />`);
  res.send("Inicializando...");
});


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

app.listen(PORT, () => console.log("Servidor iniciado en " + PORT));
