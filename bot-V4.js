const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Utilidad: limpieza de texto HTML -> texto plano
const cleanText = (raw) => {
    if (!raw) return null;
    return raw
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

// Utilidad: parseo robusto del JSON de Articulate
const parseSlide = (jsonStr) => {
    let data;
    try {
        data = JSON.parse(jsonStr);
        return data;
    } catch (e) {
        // Reparación típica de Articulate
        try {
            const repaired = jsonStr
                .replace(/\\'/g, "'")
                .replace(/\\\\"/g, '\\"')
                .replace(/[\x00-\x1F\x7F-\x9F]/g, "");
            data = JSON.parse(repaired);
            return data;
        } catch (err) {
            return null;
        }
    }
};

// Extrae todos los objetos hijos (plano) incluidos shufflegroups / scrollareas
const flattenObjects = (rootObjects = []) => {
    const out = [];
    const stack = [...rootObjects];
    while (stack.length) {
        const obj = stack.pop();
        out.push(obj);
        if (obj.objects && Array.isArray(obj.objects)) {
            stack.push(...obj.objects);
        }
    }
    return out;
};

// Obtiene el texto visible de un objeto de opción
const getObjText = (obj) => {
    if (obj.textLib && obj.textLib[0]) {
        return cleanText(obj.textLib[0].vartext || obj.textLib[0].text || '');
    }
    if (obj.data && obj.data.vectorData && obj.data.vectorData.altText) {
        return cleanText(obj.data.vectorData.altText);
    }
    return null;
};

// Detecta el ID correcto buscando ActGrpSetReviewState
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

// Guarda el JS original para inspección offline (opcional)
const saveSlideFile = (url, body) => {
    const outDir = path.join(process.cwd(), 'slides-dump');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const name = url.split('/').pop();
    const dest = path.join(outDir, name);
    fs.writeFileSync(dest, body, 'utf8');
    console.log(`💾 Guardado slide en ${dest}`);
};

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    let ultimaPregunta = '';

    console.log('🚀 BOT V4 LISTO. Iniciando autologin...');

    // Autologin
    try {
        await page.goto('https://awsacademy.instructure.com/courses/165026/assignments/1974047?module_item_id=16169462', { waitUntil: 'networkidle2' });

        // Espera a que el input de email esté listo y rellena
        await page.waitForSelector('input[type="email"], input[name="pseudonym_session[unique_id]"]');
        await page.type('input[type="email"], input[name="pseudonym_session[unique_id]"]', 'hectorgonzalocid@gmail.com');

        // Espera al pass
        await page.waitForSelector('input[type="password"], input[name="pseudonym_session[password]"]');
        await page.type('input[type="password"], input[name="pseudonym_session[password]"]', '4!ugPFtAvwur7?x&7+');

        // Click en enviar/login
        await page.click('button[type="submit"], input[type="submit"]', { delay: 100 });

        console.log('✅ Autologin ejecutado. Navegando al examen...');
    } catch (e) {
        console.log('⚠️ No se pudo realizar el autologin automáticamente, o ya estás logueado.', e.message);
    }

    page.on('response', async (response) => {
        const url = response.url();
        if (!url.includes('html5/data/js/') || !url.endsWith('.js')) return;

        const body = await response.text();
        const match = body.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
        if (!match) return;

        // Guardar copia para debug (puedes borrar la carpeta slides-dump cuando quieras)
        saveSlideFile(url, body);

        const data = parseSlide(match[1]);
        if (!data) return;

        const titulo = data.title || 'Sin título';
        if (titulo === ultimaPregunta) return;
        ultimaPregunta = titulo;

        // 1) Aplanar todos los objetos posibles
        const root = [];
        if (data.slideLayers) data.slideLayers.forEach((l) => l.objects && root.push(...l.objects));
        if (data.objects) root.push(...data.objects);
        const allObjects = flattenObjects(root);

        // 2) Detectar el ID correcto por lógica interna
        const idWinner = detectCorrectId(data.actionGroups || {});

        // 3) Filtrar solo opciones clicables (radios/checks/vectors en shufflegroup)
        const opciones = allObjects
            .map((o) => ({ id: o.id, accType: o.accType, kind: o.kind, text: getObjText(o) }))
            .filter((o) => o.text && o.text.length > 4)
            .filter((o) => o.accType === 'radio' || o.accType === 'check' || o.kind === 'vectorshape');

        // 4) Mostrar resultado
        console.log('\n' + '='.repeat(70));
        console.log('❓ PREGUNTA:', titulo);
        console.log('------------------------------------------------------------');
        opciones.forEach((opt, idx) => {
            const mark = opt.id === idWinner ? 'CORRECTA' : '        ';
            console.log(`${idx + 1}. [${mark}] -> ${opt.text}`);
        });
        console.log('------------------------------------------------------------');
        const ganador = opciones.find((o) => o.id === idWinner);
        if (ganador) {
            console.log('🎯 RESPUESTA:', ganador.text);
        } else {
            console.log('⚠️ No pude mapear el ID ganador. Revisa la carpeta slides-dump para inspección.');
        }
        console.log('='.repeat(70));
    });
})();