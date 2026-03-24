const fs = require('fs');
const puppeteer = require('puppeteer');

// Utilidades
const cleanText = (raw) => {
    if (!raw) return null;
    return raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const parseSlide = (jsonStr) => {
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e) {
        try {
            const repaired = jsonStr.replace(/\\'/g, "'").replace(/\\\\"/g, '\\"').replace(/[\x00-\x1F\x7F-\x9F]/g, "");
            data = JSON.parse(repaired);
        } catch (err) { return null; }
    }
    return data;
};

const flattenObjects = (rootObjects = []) => {
    const out = [];
    const stack = [...rootObjects];
    while (stack.length) {
        const obj = stack.pop();
        out.push(obj);
        if (obj.objects && Array.isArray(obj.objects)) stack.push(...obj.objects);
    }
    return out;
};

const getObjText = (obj) => {
    if (obj.textLib && obj.textLib[0]) return cleanText(obj.textLib[0].vartext || obj.textLib[0].text || '');
    if (obj.data && obj.data.vectorData && obj.data.vectorData.altText) return cleanText(obj.data.vectorData.altText);
    return null;
};

const detectCorrectId = (actionGroups = {}) => {
    let winner = '';
    for (const [name, group] of Object.entries(actionGroups)) {
        if (!name.includes('Review') && !name.includes('Success') && !name.includes('Correct')) continue;
        if (!group.actions) continue;
        group.actions.forEach((act) => {
            if (act.id && act.id.includes('.ActGrpSetReviewState')) {
                const parts = act.id.split('.');
                winner = parts[parts.length - 2] || parts[0];
            }
        });
    }
    return winner;
};

// Guarda el JS original para inspección (ahora sí lo guardará físicamente)
const saveSlideFile = (url, body) => {
    const path = require('path');
    const outDir = path.join(process.cwd(), 'slides-dump');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    // Extraemos el JSON para parsear el título y las opciones (como caché física)
    const match = body.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
    if (match) {
        const data = parseSlide(match[1]);
        if (data) {
            const titulo = cleanText(data.title) || 'Desconocido';
            const name = url.split('/').pop().replace('.js', '');
            
            // Guardar el JSON directamente para que sea legible
            const destJson = path.join(outDir, `${name}_${titulo.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
            fs.writeFileSync(destJson, JSON.stringify(data, null, 2), 'utf8');
        }
    }

    const name = url.split('/').pop();
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, body, 'utf8');
};

let bancoDePreguntas = [];
let preguntaActiva = '';

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    await page.setCacheEnabled(false); // Omitir el caché, forzando peticiones cada vez que carga

    console.log('🚀 BOT V5 (Sincronización Inteligente) LISTO.');
    console.log('Iniciando autologin automático...');

    try {
        await page.goto('https://awsacademy.instructure.com/courses/165026/modules#module_2157733', { waitUntil: 'networkidle2' });
        
        await page.waitForSelector('input[type="email"], input[name="pseudonym_session[unique_id]"]');
        await page.type('input[type="email"], input[name="pseudonym_session[unique_id]"]', 'hectorgonzalocid@gmail.com');
        
        await page.waitForSelector('input[type="password"], input[name="pseudonym_session[password]"]');
        await page.type('input[type="password"], input[name="pseudonym_session[password]"]', '4!ugPFtAvwur7?x&7+');
        
        await page.click('button[type="submit"], input[type="submit"]', { delay: 100 });
        
        console.log('✅ Autologin completado. Esperando que inicies el examen...');
    } catch (e) {
        console.log('⚠️ Error en autologin, es posible que ya estés dentro. Error:', e.message);
    }

    page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('html5/data/js/') || !url.endsWith('.js')) return;

        const body = await response.text();
        const match = body.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
        if (!match) return;

        // Ahora sí se guarda el archivo físicamente para que lo puedas inspeccionar
        saveSlideFile(url, body);

        const data = parseSlide(match[1]);
        if (!data) return;

        const titulo = data.title || 'Sin título';
        const root = [];
        if (data.slideLayers) data.slideLayers.forEach((l) => l.objects && root.push(...l.objects));
        if (data.objects) root.push(...data.objects);
        const allObjects = flattenObjects(root);

        const idWinner = detectCorrectId(data.actionGroups || {});

        const opciones = allObjects
            .map((o) => ({ id: o.id, accType: o.accType, kind: o.kind, text: getObjText(o) }))
            .filter((o) => o.text && o.text.length > 4)
            .filter((o) => o.accType === 'radio' || o.accType === 'check' || o.kind === 'vectorshape');

        if (opciones.length > 0) {
            // Guardar en memoria. Quitamos el aviso en terminal para mantenerlo limpio
            bancoDePreguntas.push({ titulo, idWinner, opciones });
        }
    });

    // Comprobador visual cada 1 segundo para sincronizarse contigo
    setInterval(async () => {
        if (bancoDePreguntas.length === 0) return;

        try {
            const frames = page.frames();
            // Buscar el iframe de la presentación
            let storyFrame = frames.find(f => f.url().includes("index_lms.html") || f.url().includes("story.html"));
            
            // A veces el iframe está anidado, buscamos más profundo
            if (!storyFrame) {
                for (const f of frames) {
                    const childFrames = f.childFrames();
                    const target = childFrames.find(cf => cf.url().includes("index_lms.html") || cf.url().includes("story.html"));
                    if (target) { storyFrame = target; break; }
                }
            }
            // Si no lo encontramos en iframes, usamos la página principal
            if (!storyFrame) storyFrame = page;

            const activeIndex = await storyFrame.evaluate((banco) => {
                function isReallyVisible(el) {
                    if (!el) return false;
                    
                    // Comprobar estilos computados y padres pidiendo aria-hidden
                    let current = el;
                    while (current && current.nodeType === 1) {
                        const style = window.getComputedStyle(current);
                        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                            return false;
                        }
                        if (current.getAttribute('aria-hidden') === 'true') {
                            return false;
                        }
                        current = current.parentElement;
                    }
                    
                    // Comprobar si Articulate ha sacado el elemento de la pantalla (truco suyo)
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return false;
                    if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
                    
                    return true;
                }

                for (let i = 0; i < banco.length; i++) {
                    const slide = banco[i];
                    for (let opt of slide.opciones) {
                        const qs = `[data-model-id="${opt.id}"], [id*="${opt.id}"]`;
                        // Buscar todos los elementos que coincidan por si hay capas fantasma
                        const elements = document.querySelectorAll(qs);
                        for (let el of elements) {
                            if (isReallyVisible(el)) {
                                return i;
                            }
                        }
                    }
                }
                return -1;
            }, bancoDePreguntas);

            if (activeIndex !== -1) {
                const slide = bancoDePreguntas[activeIndex];
                // Comparamos el ID único de la respuesta ganadora para no bloquearse por títulos repetidos ("Knowledge Check")
                const uid_actual = slide.idWinner;
                
                if (uid_actual !== preguntaActiva) {
                    preguntaActiva = uid_actual;
                    
                    const ganador = slide.opciones.find((o) => o.id === slide.idWinner);
                    const respuestaText = ganador ? ganador.text : 'Desconocida';
                    
                    console.log('\n============================================================');
                    console.log(`📝 PREGUNTA EN PANTALLA: ${slide.titulo}`);
                    console.log(`✅ RESPUESTA CORRECTA:   ${respuestaText}`);
                    console.log('============================================================\n');

                    // Guardar un log plano "formulario" para historial
                    const logTxt = `PREGUNTA: ${slide.titulo}\nRESPUESTA CORRECTA: ${respuestaText}\n------------------------\n`;
                    require('fs').appendFileSync(require('path').join(process.cwd(), 'formulario_respuestas.txt'), logTxt);
                }
            }
        } catch (e) {
            // console.log("Error buscando frame/elemento:", e.message);
        }
    }, 1000);

})();