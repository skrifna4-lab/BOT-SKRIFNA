// comandos/interactivos/menu.js
// Versión adaptada al nuevo sistema SIN SESIONES.
// Cada opción del menú es un botón cuyo id ya trae todo lo necesario
// ("menu|opcion|info", "menu|opcion|ayuda", ...). No hay dueño, no hay
// un solo uso forzado por memoria, no hay expiración programada: el
// botón simplemente existe mientras el mensaje exista en el chat.

const { ui, responder } = require("../../funciones");

const OPCIONES = {
    info: {
        label: "ℹ️ Información",
        texto: "Este es un bot de WhatsApp construido con Baileys. Tiene comandos de voz, botones, listas y más."
    },
    ayuda: {
        label: "🆘 Ayuda",
        texto: "Escribe *.menu* para ver este menú de nuevo, o *hola* para hablar con la IA por voz."
    },
    sorpresa: {
        label: "🎲 Sorpresa",
        texto: "🎉 ¡Sorpresa! Este botón podría disparar cualquier lógica: una imagen, un audio, otro menú, lo que quieras."
    }
};

module.exports = {
    info: { descripcion: "Muestra un menú con botones rápidos (quick_reply) de ejemplo." },

    run: async (conn, msg, args) => {
        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith("@g.us");

        const botones = Object.entries(OPCIONES).map(([opcion, { label }]) => ({
            texto: label,
            // "menu" = nombre de este archivo -> quien procesa el botón.
            // "opcion" = la key dentro de OPCIONES ya viaja en el id.
            id: ui.crearId("menu", "opcion", opcion)
        }));

        const mensaje = ui.botonesJSON({
            jid,
            titulo: "📋 Menú principal",
            texto: "Elige una opción.",
            footer: "Bot de WhatsApp",
            botones
        });

        await ui.enviarInteractivo(conn, jid, mensaje, isGroup);
    },

    // Se llama solo cuando alguien toca un botón con id "menu|opcion|X".
    // accion = "opcion", datos = ["info"] / ["ayuda"] / ["sorpresa"]
    procesarBoton: async (conn, msg, accion, datos) => {
        if (accion !== "opcion") return;

        const opcion = OPCIONES[datos[0]];
        if (!opcion) return;

        await responder(conn, msg, opcion.texto);
    }
};
