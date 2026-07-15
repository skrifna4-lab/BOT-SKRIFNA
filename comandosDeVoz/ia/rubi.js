// ====================================================================
// comandosDeVoz/ia.js
// El usuario dice, dentro de una NOTA DE VOZ: "IA <lo que sea>".
// Ese "lo que sea" (todo el texto, no solo una palabra) se manda tal
// cual a la API de inteligencia artificial, y la respuesta se envía
// de vuelta como mensaje de voz (nota ptt).
//
// Ejemplo hablado: "IA explícame qué es la fotosíntesis"
//   -> keyword detectado: "ia"
//   -> texto que se manda a la API: "explícame qué es la fotosíntesis"
//   -> respuesta: nota de voz generada por la IA
// ====================================================================

const { ejecutarPeticionInterna } = require('#utils/iaVoz');

module.exports = {
    keyword: "hola",
    run: async (conn, msg, args) => {
        const from = msg.key.remoteJid;
        const key = msg.key;

        // La transcripción completa llega en msg.message.conversation
        // (ver utils/voiceTranscribe.js). Le sacamos la palabra "ia"
        // (como palabra completa, no substring) de donde aparezca, para
        // no mandarle "ia" de más a la IA; el resto del texto viaja intacto.
        const textoCompleto = (msg.message.conversation || '').trim();
        const textoBase = textoCompleto.replace(/\bia\b/i, '').replace(/\s+/g, ' ').trim();

        await ejecutarPeticionInterna(conn, from, textoBase, key, 'normal');
    }
};
