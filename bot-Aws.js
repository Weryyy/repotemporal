const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();
    let ultimaPregunta = "";

    console.log("🚀 Monitor de Lógica Real Activo.");

    page.on('response', async (response) => {
        const url = response.url();

        if (url.includes('html5/data/js/') && url.endsWith('.js')) {
            try {
                const text = await response.text();
                // Extracción del JSON usando regex para evitar problemas con comillas escapadas
                const jsonMatch = text.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
                if (!jsonMatch) return;

                let jsonStr = jsonMatch[1];
                // Articulate escapa de forma peculiar: ' y \ se escapan en el JS original
                jsonStr = jsonStr.replace(/\\'/g, "'");

                let data;
                try {
                    data = JSON.parse(jsonStr);
                } catch (parseErr) {
                    try {
                        // Segunda oportunidad: Reparar comillas dobles y caracteres de control
                        let repaired = jsonStr.replace(/\\\\"/g, '\\"');
                        repaired = repaired.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                        data = JSON.parse(repaired);
                    } catch (err) { return; }
                }

                const titulo = data.title || "Sin título";
                if (titulo === ultimaPregunta) return;
                ultimaPregunta = titulo;

                console.log("\n" + "=".repeat(60));
                console.log("❓ PREGUNTA: " + titulo);

                // 1. Mapeo de objetos (Opciones reales del examen)
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
                    return text.replace(/<[^>]*>/g, '').replace(/%[^%]+%/g, '').replace(/\s+/g, ' ').trim();
                };

                // 2. Trazado lógico para hallar el ID de la respuesta CORRECTA
                let idCorrecto = "";
                if (data.actionGroups) {
                    for (const [key, group] of Object.entries(data.actionGroups)) {
                        // Buscamos específicamente el grupo de revisión de éxito
                        if (key.includes("ReviewIntCorrectIncorrect") || key.includes("Success")) {
                            group.actions.forEach(action => {
                                // Buscamos la acción que "SetReviewState" para la opción ganadora
                                if (action.id && action.id.includes(".ActGrpSetReviewState")) {
                                    const parts = action.id.split('.');
                                    // El ID suele estar justo antes de .ActGrpSetReviewState
                                    idCorrecto = parts[parts.length - 2] || parts[0];
                                }
                            });
                        }
                    }
                }

                // 3. Vincular el ID con la OPCIÓN REAL que ves en pantalla
                let opcionGanadora = null;
                let todasLasOpciones = [];

                objects.forEach(obj => {
                    const texto = getCleanText(obj);
                    // Solo nos interesan objetos que parecen opciones (Radio buttons o Checkboxes)
                    if (texto && (obj.accType === "radio" || obj.accType === "check" || obj.kind === "vectorshape")) {
                        if (texto.length > 3 && !["Correct", "Incorrect", "Continue", "Submit"].some(word => texto.includes(word))) {
                            todasLasOpciones.push({ text: texto, id: obj.id });
                            if (obj.id === idCorrecto) {
                                opcionGanadora = { text: texto, id: obj.id };
                            }
                        }
                    }
                });

                // Si no se encontró por ID directo, buscamos por texto en la capa de feedback (Plan B)
                if (!opcionGanadora && data.slideLayers) {
                    data.slideLayers.forEach(layer => {
                        const esCapaCorrecta = layer.objects && layer.objects.some(o => {
                            const t = getCleanText(o);
                            return t && t.toLowerCase() === "correct";
                        });
                        if (esCapaCorrecta) {
                            const textoFeedback = layer.objects
                                .map(o => getCleanText(o))
                                .find(t => t && t.length > 10 && !t.toLowerCase().includes("correct") && !t.toLowerCase().includes("continue"));

                            if (textoFeedback) {
                                // Buscamos cuál de nuestras opciones coincide con este texto de feedback
                                opcionGanadora = todasLasOpciones.find(opt => textoFeedback.includes(opt.text)) || { text: textoFeedback, id: "feedback_match" };
                            }
                        }
                    });
                }

                console.log("------------------------------------------------------------");
                console.log("📝 OPCIONES DISPONIBLES EN ESTA PREGUNTA:");
                todasLasOpciones.forEach(opt => console.log(`   - ${opt.text}`));
                console.log("------------------------------------------------------------");

                if (opcionGanadora) {
                    console.log(`🎯 SOLUCIÓN DETECTADA: ${opcionGanadora.text}`);
                    // Automatización (Clic en el DOM)
                    try {
                        const frames = page.frames();
                        const storyFrame = frames.find(f => f.url().includes("index_lms.html") || f.url().includes("story.html")) || page;
                        await new Promise(r => setTimeout(r, 1500)); // Un poco más de tiempo para renderizar
                        const clicHecho = await storyFrame.evaluate((oId) => {
                            const el = document.querySelector(`[data-model-id="${oId}"], [id*="${oId}"], [aria-label*="${oId}"]`);
                            if (el) { el.click(); return true; }
                            return false;
                        }, opcionGanadora.id);
                        if (clicHecho) console.log(`🖱️  CLIC AUTOMÁTICO REALIZADO SOBRE LA OPCIÓN CORRECTA.`);
                    } catch (e) { }
                } else {
                    console.log("⚠️ Analizando... Por favor, asegúrate de estar en el slide de la pregunta.");
                }
                console.log("============================================================");

                console.log("=".repeat(60));

            } catch (e) {
                // Silencioso para no ensuciar la consola si falla un parseo
            }
        }
    });

    await page.goto('https://awsacademy.instructure.com/courses/165026/assignments/1974047?module_item_id=16169462');
})();