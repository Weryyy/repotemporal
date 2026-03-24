const puppeteer = require('puppeteer');

(async () => {
    // Lanzar el navegador
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();
    let ultimaPregunta = "";

    console.log("🚀 BOT AWS ACADEMY ACTIVO.");
    console.log("Esperando a que navegues al examen...");

    page.on('response', async (response) => {
        const url = response.url();

        // Detectar archivos de datos de Articulate
        if (url.includes('html5/data/js/') && url.endsWith('.js')) {
            try {
                const text = await response.text();
                // Extraer el JSON del envoltorio window.globalProvideData
                const jsonMatch = text.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
                if (!jsonMatch) return;

                let jsonStr = jsonMatch[1];
                // Limpieza de escapes de Articulate
                jsonStr = jsonStr.replace(/\\'/g, "'").replace(/\\\\"/g, '\\"');

                let data;
                try {
                    data = JSON.parse(jsonStr);
                } catch (e) {
                    // Reintentar limpieza más profunda si falla
                    try {
                        let repaired = jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                        data = JSON.parse(repaired);
                    } catch (err) { return; }
                }

                const titulo = data.title || "Sin título";
                if (titulo === ultimaPregunta) return;
                ultimaPregunta = titulo;

                console.log("\n" + "=".repeat(60));
                console.log("❓ PREGUNTA DETECTADA: " + titulo);

                // --- 1. EXTRAER TODAS LAS OPCIONES REALES ---
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
                        text = obj.textLib[0].vartext || obj.textLib[0].text || "";
                    } else if (obj.data && obj.data.vectorData && obj.data.vectorData.altText) {
                        text = obj.data.vectorData.altText;
                    }
                    if (!text) return null;
                    // Limpiar HTML y entidades
                    return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                };

                let todasLasOpciones = [];
                objects.forEach(obj => {
                    const txt = getCleanText(obj);
                    // Articulate usa 'vectorshape' con accType 'radio' o dentro de scrollareas para las opciones
                    if (txt && (obj.accType === "radio" || obj.accType === "check" || obj.kind === "vectorshape")) {
                        // Filtrar textos que no son opciones
                        if (txt.length > 5 && !["Correct", "Incorrect", "Continue", "Submit", "Feedback", titulo].some(w => txt.includes(w))) {
                            todasLasOpciones.push({ id: obj.id, text: txt });
                        }
                    }
                });

                // --- 2. IDENTIFICAR EL ID GANADOR (LÓGICA INTERNA) ---
                let idGanador = "";
                if (data.actionGroups) {
                    for (const [name, group] of Object.entries(data.actionGroups)) {
                        // El secreto está en los grupos de 'Review' o 'Success'
                        if (name.includes("ReviewIntCorrectIncorrect") || name.includes("FeedbackCorrect") || name.includes("Success")) {
                            group.actions.forEach(act => {
                                if (act.id && act.id.includes("ActGrpSetReviewState")) {
                                    const parts = act.id.split('.');
                                    idGanador = parts[parts.length - 2] || parts[0];
                                }
                            });
                        }
                    }
                }

                // --- 3. MOSTRAR RESULTADOS ---
                console.log("------------------------------------------------------------");
                console.log("📝 OPCIONES RECONOCIDAS:");
                todasLasOpciones.forEach((opt, i) => {
                    const esLaBuena = opt.id === idGanador;
                    console.log(`   ${i + 1}. [${esLaBuena ? "CORRECTA" : "        "}] -> ${opt.text}`);
                });
                console.log("------------------------------------------------------------");

                const opcionBuena = todasLasOpciones.find(o => o.id === idGanador);
                if (opcionBuena) {
                    console.log(`🎯 LA RESPUESTA ES: ${opcionBuena.text}`);
                    console.log(`👉 Haz clic manualmente en esa opción.`);
                } else {
                    console.log("⚠️ No se pudo determinar la respuesta exacta.");
                }
                console.log("============================================================");

            } catch (err) { }
        }
    });

})();