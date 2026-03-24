const fs = require('fs');

// Simulación de la lógica de bot-Aws.js para probar sin abrir el navegador real
function testLogic(filePath) {
    console.log(`\n--- Probando archivo: ${filePath} ---`);
    const text = fs.readFileSync(filePath, 'utf-8');

    // El regex exacto de bot-Aws.js
    const jsonMatch = text.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
    if (!jsonMatch) {
        console.log("❌ No se encontró la data del slide.");
        return;
    }

    let jsonStr = jsonMatch[1];

    // CORRECCIÓN CRITICAL: Articulate usa escapado de comillas dobles internas con \" dentro del string
    // pero el JSON.parse de JS falla si hay backslashes literales mal puestos.
    // Solo debemos limpiar lo que Articulate mete de más.
    jsonStr = jsonStr.replace(/\\'/g, "'");
    // No reemplazamos \\\\" por \\" indiscriminadamente porque puede romper el JSON.
    // Articulate escapa las comillas dobles como \" (estándar JSON) pero a veces mete \\" extra.

    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e) {
        // Intento 2: Reparación manual de comillas dobles escapadas dentro de strings
        try {
            // Buscamos patrones de \" que no deberían estar ahí o están mal escapados
            let repaired = jsonStr.replace(/\\\\"/g, '\\"');
            data = JSON.parse(repaired);
        } catch (e2) {
            console.log("❌ Error fatal de JSON parse. Intentando modo regex de emergencia...");
            // Si el JSON falla, usamos regex para sacar el título al menos
            const titleMatch = jsonStr.match(/"title":"([^"]+)"/);
            console.log("❓ PREGUNTA (Regex):", titleMatch ? titleMatch[1] : "No hallada");
            return;
        }
    }

    console.log("❓ PREGUNTA:", data.title);

    let objects = [];
    if (data.slideLayers) {
        data.slideLayers.forEach(layer => {
            if (layer.objects) objects.push(...layer.objects);
        });
    }
    if (data.objects) objects.push(...data.objects);

    const getCleanText = (obj) => {
        let text = "";
        if (obj.textLib && obj.textLib[0]) {
            text = obj.textLib[0].text || obj.textLib[0].vartext || "";
        } else if (obj.data && obj.data.vectorData && obj.data.vectorData.altText) {
            text = obj.data.vectorData.altText;
        }
        if (!text) return null;
        return text.replace(/<[^>]*>/g, '').replace(/%[^%]+%/g, '').replace(/\s+/g, ' ').trim();
    };

    let idCorrecto = "";
    if (data.actionGroups) {
        for (const [key, group] of Object.entries(data.actionGroups)) {
            const esGrupoExito = key.includes("ReviewIntCorrectIncorrect") ||
                key.includes("FeedbackCorrect") ||
                key.includes("Success");
            if (esGrupoExito) {
                group.actions.forEach(action => {
                    if (action.kind === "exe_actiongroup" && action.id.includes(".ActGrpSetReviewState")) {
                        const parts = action.id.split('.');
                        idCorrecto = parts[parts.length - 2] || parts[0];
                    }
                });
            }
        }
    }

    let opcionFinal = null;

    // Estrategia 1: Buscar por ID en capas de Feedback (visto en 6Y4qMoSWUxV.js)
    if (data.slideLayers) {
        data.slideLayers.forEach(layer => {
            if (layer.objects && layer.presentAs === "layer") {
                const esCapaCorrecta = layer.objects.some(o => {
                    const t = getCleanText(o);
                    return t && t.toLowerCase() === "correct";
                });
                if (esCapaCorrecta) {
                    layer.objects.forEach(o => {
                        const t = getCleanText(o);
                        if (t && t.length > 5 && t.toLowerCase() !== "correct" && t.toLowerCase() !== "continue") {
                            opcionFinal = { texto: t, id: "found_by_feedback" };
                        }
                    });
                }
            }
        });
    }

    // Estrategia 2: Si no hay feedback, buscar por el ID lógico
    if (!opcionFinal) {
        objects.forEach(obj => {
            const texto = getCleanText(obj);
            if (texto && (obj.id === idCorrecto || (obj.linkId && obj.linkId.includes(idCorrecto)))) {
                opcionFinal = { texto, id: obj.id };
            }
        });
    }

    // Estrategia 3: Heurística de vinculación
    if (!opcionFinal && idCorrecto) {
        objects.forEach(obj => {
            const raw = JSON.stringify(obj);
            if (raw.includes(idCorrecto)) {
                const txt = getCleanText(obj);
                if (txt && txt.length > 5 && !txt.includes("Correct") && !txt.includes("Continue")) {
                    opcionFinal = { texto: txt, id: obj.id };
                }
            }
        });
    }

    if (opcionFinal) {
        console.log(`✅ RESPUESTA DETECTADA: ${opcionFinal.texto}`);
    } else {
        console.log("⚠️ No se detectó la respuesta. ID Ganador buscado:", idCorrecto);
        // Debug de IDs si falla
        console.log("IDs de objetos con texto:");
        objects.forEach(o => {
            const t = getCleanText(o);
            if (t) console.log(`- ${o.id}: ${t.substring(0, 30)}...`);
        });
    }
}

// Ejecutar con los archivos que el usuario tiene
testLogic('6Y4qMoSWUxV.js');
testLogic('5XyRWz5JEJp.js');
