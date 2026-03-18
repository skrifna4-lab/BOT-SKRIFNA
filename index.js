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
const AUTH_FOLDER = "./auth_data"; // Usa una ruta local para probar primero

let sock;
let qrCodeData = null;
let isConnected = false;

async function startBot() {
  console.log("-------------------------------------------");
  console.log("🚀 INTENTANDO INICIAR CONEXIÓN LIMPIA...");
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    printQRInTerminal: true, // ESTO ES CLAVE: Verás el QR en la consola del VPS
    logger: P({ level: "fatal" }), // Solo errores críticos para no ensuciar la consola
    auth: state,
    // ESTO EVITA EL CIERRE INSTANTÁNEO EN VPS:
    browser: ["Ubuntu", "Chrome", "20.0.0"],
    connectTimeoutMs: 60000, // 1 minuto de espera para conexiones lentas
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log("✨ QR GENERADO: Escanéalo en el navegador o terminal.");
    }

    if (connection === "open") {
      console.log("✅ ¡CONECTADO EXITOSAMENTE AL VPS!");
      isConnected = true;
      qrCodeData = null;
    }

    if (connection === "close") {
      isConnected = false;
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      
      console.log(`❌ Conexión cerrada. Código: ${statusCode || 'Desconocido'}`);
      console.log(`Motivo: ${error}`);

      // Si el VPS está siendo bloqueado o la sesión expiró
      if (statusCode === DisconnectReason.loggedOut) {
          console.log("Sesión cerrada por WhatsApp. Re-escanea el QR.");
      } else {
          console.log("Reintentando en 5 segundos...");
          setTimeout(() => startBot(), 5000);
      }
    }
  });
}

startBot();

app.get("/", (req, res) => {
  if (isConnected) return res.send("<h2>✅ BOT ONLINE</h2>");
  if (qrCodeData) return res.send(`<h2>Escanea el QR</h2><img src="${qrCodeData}" />`);
  res.send("Generando QR... espera 10 segundos y recarga.");
});

app.listen(PORT, () => console.log("🌐 Servidor Web en puerto " + PORT));
