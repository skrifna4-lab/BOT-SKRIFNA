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

app.listen(PORT, () => console.log("Servidor iniciado en " + PORT));
