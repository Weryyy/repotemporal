const fs = require('fs');

function testFile(filePath) {
    console.log(`\n` + "=".repeat(60));
    console.log(`🔍 ANALIZANDO ARCHIVO: ${filePath.split('\\').pop()}`);
    console.log("=".repeat(60));

    const content = fs.readFileSync(filePath, 'utf8');
    const jsonMatch = content.match(/window\.globalProvideData\('slide', '(.+)'\);/s);
    if (!jsonMatch) return;

    let jsonStr = jsonMatch[1].replace(/\\'/g, "'").replace(/\\\\"/g, '\\"');
    let data = JSON.parse(jsonStr);

    console.log(`❓ PREGUNTA: ${data.title}`);
    console.log("-".repeat(60));

    let allObjects = [];
    if (data.slideLayers) data.slideLayers.forEach(l => { if (l.objects) allObjects.push(...l.objects); });
    if (data.objects) allObjects.push(...data.objects);

    const getCleanText = (obj) => {
        let text = "";
        if (obj.textLib && obj.textLib[0]) text = obj.textLib[0].text || obj.textLib[0].vartext || "";
        else if (obj.data && obj.data.vectorData && obj.data.vectorData.altText) text = obj.data.vectorData.altText;
        return text ? text.replace(/<[^>]*>/g, '').trim() : null;
    };

    // 1. Listar TODAS las opciones posibles (objetos que parecen botones o texto de respuesta)
    console.log("📝 OPCIONES ENCONTRADAS EN LA DIAPOSITIVA:");
    const opciones = [];
    allObjects.forEach(o => {
        const t = getCleanText(o);
        if (t && t.length > 3 && !["Correct", "Incorrect", "Continue", "Submit", "Feedback"].some(word => t.includes(word))) {
            opciones.push({ text: t, id: o.id });
            console.log(`   [ID: ${o.id}] -> "${t}"`);
        }
    });

    // 2. Buscar la SOLUCIÓN mediante lógica de capas de Feedback
    let solucionTexto = "No detectada";
    let solucionID = "No detectado";

    if (data.slideLayers) {
        data.slideLayers.forEach(layer => {
            const layerHasCorrectLabel = layer.objects && layer.objects.some(o => {
                const t = getCleanText(o);
                return t && (t.toLowerCase() === "correct" || t.toLowerCase() === "correcto");
            });

            if (layerHasCorrectLabel) {
                // En la capa de "Correcto", buscamos el texto explicativo o la confirmación
                const textoCapa = layer.objects
                    .map(o => getCleanText(o))
                    .find(t => t && t.length > 5 && !t.toLowerCase().includes("correct") && !t.toLowerCase().includes("continue"));

                if (textoCapa) solucionTexto = textoCapa;
            }
        });
    }

    // 3. Intento de vincular por ActionGroups si el feedback falla
    if (solucionTexto === "No detectada" && data.actionGroups) {
        for (const [key, group] of Object.entries(data.actionGroups)) {
            if (key.includes("Success") || key.includes("Correct")) {
                group.actions.forEach(action => {
                    if (action.id && action.id.includes("ActGrpSetReviewState")) {
                        const parts = action.id.split('.');
                        solucionID = parts[parts.length - 2] || parts[0];
                    }
                });
            }
        }
        if (solucionID !== "No detectado") {
            const objEncontrado = opciones.find(o => o.id === solucionID);
            if (objEncontrado) solucionTexto = objEncontrado.text;
        }
    }

    console.log("-".repeat(60));
    console.log(`🎯 SOLUCIÓN FINAL DETECTADA: ${solucionTexto}`);

    // Verificación final
    const matchDirecto = opciones.find(o => o.text.toLowerCase() === solucionTexto.toLowerCase());
    if (matchDirecto) {
        console.log(`✅ VERIFICADO: Debes marcar la opción con ID: ${matchDirecto.id}`);
    } else {
        console.log(`⚠️  NOTA: La solución parece ser un texto de retroalimentación, no una opción directa.`);
    }
}

testFile('c:\\Users\\Techie3\\Desktop\\EjercicioAWS\\6Y4qMoSWUxV.js');
testFile('c:\\Users\\Techie3\\Desktop\\EjercicioAWS\\5XyRWz5JEJp.js');