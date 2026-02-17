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

/* =========================
   RUTA PERSISTENTE
   =========================
   ESTA CARPETA DEBE SER LA DEL VOLUME MOUNT
*/
const AUTH_FOLDER = "/data/auth";

/* =========================
   CONFIGURACIÓN CANAL
   ========================= */
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

let sock;
let qrCodeData = null;
let isConnected = false;

/* =========================
   EXTENDER SOCKET
   ========================= */
const extenderConCanal = (sock) => {
  if (sock.__canalExtendido) return;
  sock.__canalExtendido = true;

  sock.sendMessage2 = async (jid, content, quoted = null, options = {}) => {

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

/* =========================
   INICIAR BOT
   ========================= */
async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

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

      if (shouldReconnect) startBot();
    }
  });
}

startBot();

/* =========================
   PANEL QR
   ========================= */
app.get("/", (req, res) => {

  if (isConnected) {
    return res.send("<h2>✅ BOT CONECTADO</h2>");
  }

  if (qrCodeData) {
    return res.send(`
      <meta http-equiv="refresh" content="5">
      <h2>Escanea el QR</h2>
      <img src="${qrCodeData}" />
    `);
  }

  res.send("Inicializando...");
});

/* =========================
   ENVÍO MENSAJES
   ========================= */
app.post("/send", async (req, res) => {

  try {

    const { number, type, message, mediaUrl } = req.body;

    if (!isConnected)
      return res.status(500).json({ error: "Bot no conectado" });

    const jid = number + "@s.whatsapp.net";

    let content = {};

    if (type === "text")
      content = { text: message };

    if (type === "image")
      content = { image: { url: mediaUrl }, caption: message || "" };

    await sock.sendMessage2(jid, content, fakeQuoted);

    res.json({ success: true });

  } catch (e) {
    res.status(500).json({ error: "Error enviando" });
  }
});
/* =========================
   RUTA RÁPIDA: /terry
   Uso: http://localhost:4531/terry?msg=TuMensajeAqui
   ========================= */
app.get("/terry", async (req, res) => {
  try {
    // 1. Extraer el mensaje del parámetro 'msg' de la URL
    const message = req.query.msg;

    if (!message) {
      return res.status(400).send("Falta el parámetro 'msg'. Ejemplo: /terry?msg=hola");
    }

    if (!isConnected) {
      return res.status(500).send("Bot no conectado. Escanea el QR primero.");
    }

    // 2. Definir el número fijo (con el prefijo de país, ej: 51 para Perú)
    const numeroFijo = "51936657729"; 
    const jid = numeroFijo + "@s.whatsapp.net";

    // 3. Preparar el contenido
    const content = { text: message };

    // 4. Enviar usando tu función extendida sendMessage2
    await sock.sendMessage2(jid, content, fakeQuoted);

    res.send(`✅ Mensaje enviado a ${numeroFijo}: "${message}"`);

  } catch (e) {
    console.error(e);
    res.status(500).send("Error interno al enviar el mensaje.");
  }
});
app.listen(PORT, () => {
  console.log("Servidor iniciado en " + PORT);
});
