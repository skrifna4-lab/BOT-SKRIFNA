import express from "express";
import pkg, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";

const { default: makeWASocket } = pkg;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4540;
const AUTH_FOLDER = "./auth_data"; // Cambia a /data/auth si usas Docker con volumen

/* =========================
   CONFIGURACIÓN CANAL
   ========================= */
const CANAL_ID = "120363405239179634@newsletter";
const CANAL_NOMBRE = "⚙️ SKRIFNA BOT ⚙️";

const fakeQuoted = {
  key: { participant: "0@s.whatsapp.net", remoteJid: "status@broadcast", fromMe: false, id: "Senku" },
  message: { locationMessage: { name: "SKRIFNA.UK", jpegThumbnail: Buffer.alloc(0) } },
  participant: "0@s.whatsapp.net"
};

let sock;
let qrCodeData = null;
let isConnected = false;

/* =========================
   EXTENDER SOCKET
   ========================= */
const extenderConCanal = (socket) => {
  if (socket.__canalExtendido) return;
  socket.__canalExtendido = true;

  socket.sendMessage2 = async (jid, content, quoted = null, options = {}) => {
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
    return socket.sendMessage(jid, message, { quoted, ...options });
  };
};

/* =========================
   INICIAR BOT
   ========================= */
async function startBot() {
  console.log("Iniciando conexión con WhatsApp...");
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: true
  });

  extenderConCanal(sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log("Nuevo QR generado, escanea en el navegador.");
    }

    if (connection === "open") {
      console.log("✅ BOT CONECTADO");
      isConnected = true;
      qrCodeData = null;
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Conexión cerrada. Razón: ${statusCode}. Reintentando: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Esperamos 5 segundos antes de reintentar para evitar bucles infinitos
        setTimeout(() => startBot(), 5000);
      } else {
        console.log("❌ Sesión cerrada permanentemente. Borra la carpeta de auth y escanea de nuevo.");
      }
    }
  });
}

startBot();

/* =========================
   RUTAS EXPRESS
   ========================= */
app.get("/", (req, res) => {
  if (isConnected) return res.send("<h2>✅ BOT CONECTADO</h2>");
  if (qrCodeData) return res.send(`<h2>Escanea el QR</h2><img src="${qrCodeData}" /><script>setTimeout(()=>location.reload(), 5000)</script>`);
  res.send("Cargando QR... Refresca en 5 segundos.");
});

app.get("/terry", async (req, res) => {
  try {
    const message = req.query.msg;
    if (!message || !isConnected) return res.status(400).send("Error: Mensaje vacío o Bot desconectado.");
    
    const jid = "51936657729@s.whatsapp.net";
    await sock.sendMessage2(jid, { text: message }, fakeQuoted);
    res.send(`✅ Enviado: ${message}`);
  } catch (e) {
    res.status(500).send("Error al enviar.");
  }
});

app.listen(PORT, () => console.log("Servidor en puerto " + PORT));
