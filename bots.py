
/**
 * AWS Academy Quiz Bot - Console Script
 * ======================================
 * Ejecutar directamente en la consola del navegador (F12 → Console)
 * mientras tienes el quiz visible.
 *
 * INSTRUCCIONES:
 * 1. Abre el quiz en el navegador hasta ver la primera pregunta
 * 2. Abre DevTools (F12) → pestaña "Console"
 * 3. Pega TODO este código y presiona Enter
 * 4. El bot empieza solo automáticamente
 */

(async function QuizBot() {

  // ─────────────────────────────────────────────
  // CONFIGURACIÓN
  // ─────────────────────────────────────────────
  const PASSING_SCORE  = 70;    // % mínimo para aprobar
  const DELAY_CLICK    = 800;   // ms entre acciones (no bajes de 500)
  const DELAY_FEEDBACK = 1500;  // ms esperando feedback tras responder
  const DELAY_NEXT     = 1000;  // ms antes de pasar a siguiente pregunta
  const MAX_ATTEMPTS   = 8;     // intentos máximos antes de rendirse

  // ─────────────────────────────────────────────
  // MEMORIA PERSISTENTE (sobrevive recargas via sessionStorage)
  // ─────────────────────────────────────────────
  const MEMORY_KEY = 'awsQuizBotMemory';

  function loadMemory() {
    try {
      return JSON.parse(sessionStorage.getItem(MEMORY_KEY) || '{"correct":{},"wrong":{}}');
    } catch { return { correct: {}, wrong: {} }; }
  }

  function saveMemory(mem) {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  }

  function normalizeQ(text) {
    return text.replace(/\s+/g, ' ').trim().substring(0, 150);
  }

  // ─────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function log(msg, type = 'info') {
    const icons = { info: '🤖', ok: '✅', fail: '❌', warn: '⚠️', score: '📊', q: '❓', choice: '🎯' };
    console.log(`${icons[type] || '▸'} [QuizBot] ${msg}`);
  }

  // Busca el document activo: si hay iframe con contenido, úsalo
  function getActiveDoc() {
    // Busca iframes visibles con contenido del quiz
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body && doc.body.innerHTML.length > 500) {
          const text = doc.body.innerText || '';
          // Verifica que tiene contenido de quiz (preguntas, opciones)
          if (text.includes('?') || doc.querySelectorAll('input[type=radio], input[type=checkbox]').length > 0) {
            log(`Usando iframe: ${iframe.id || iframe.name || 'sin nombre'}`);
            return doc;
          }
        }
      } catch (e) {
        // Cross-origin bloqueado, ignorar
      }
    }
    // Fallback: documento principal
    log('Usando documento principal');
    return document;
  }

  // ─────────────────────────────────────────────
  // EXTRACCIÓN DE PREGUNTAS
  // ─────────────────────────────────────────────
  function extractQuestions(doc) {
    const questions = [];

    // Estrategia 1: inputs radio/checkbox agrupados por name
    const inputs = doc.querySelectorAll('input[type=radio], input[type=checkbox]');
    if (inputs.length > 0) {
      const groups = {};
      inputs.forEach(inp => {
        const name = inp.name || inp.closest('fieldset')?.id || 'group_' + Math.random();
        if (!groups[name]) groups[name] = [];
        groups[name].push(inp);
      });

      for (const [groupName, groupInputs] of Object.entries(groups)) {
        // Busca el texto de la pregunta cerca del grupo
        const container = groupInputs[0].closest('fieldset, .question, [class*="question"], [class*="Question"], form, div');
        let qText = '';

        if (container) {
          // Busca el texto antes de los inputs (la pregunta)
          const allText = container.innerText || container.textContent || '';
          // Toma el texto antes de la primera opción
          const firstOptionText = groupInputs[0].closest('label')?.innerText || '';
          const qIdx = allText.indexOf(firstOptionText);
          qText = qIdx > 0 ? allText.substring(0, qIdx).trim() : allText.substring(0, 200).trim();
        }

        if (!qText) {
          // Buscar legend o encabezados cercanos
          const fieldset = groupInputs[0].closest('fieldset');
          qText = fieldset?.querySelector('legend')?.innerText?.trim() || '';
        }

        const isMultiple = groupInputs[0].type === 'checkbox';
        const options = groupInputs.map(inp => {
          const label = inp.closest('label') ||
                        doc.querySelector(`label[for="${inp.id}"]`) ||
                        inp.parentElement;
          return {
            input: inp,
            text: (label?.innerText || label?.textContent || '').trim().replace(/^\s*[A-D]\.\s*/, ''),
          };
        }).filter(o => o.text.length > 0);

        if (options.length >= 2) {
          questions.push({
            id: groupName,
            text: normalizeQ(qText || `Pregunta grupo ${groupName}`),
            options,
            isMultiple,
            container,
          });
        }
      }

      if (questions.length > 0) {
        log(`Encontradas ${questions.length} preguntas (estrategia radio/checkbox)`);
        return questions;
      }
    }

    // Estrategia 2: elementos con clases típicas de quiz
    const selectors = [
      '[class*="question-item"]',
      '[class*="QuestionItem"]',
      '[class*="quiz-question"]',
      '[data-question-id]',
      '.question',
      'fieldset',
    ];

    for (const sel of selectors) {
      const elems = doc.querySelectorAll(sel);
      if (elems.length === 0) continue;

      elems.forEach((elem, i) => {
        const clickables = elem.querySelectorAll('input[type=radio], input[type=checkbox], [role=radio], [role=checkbox], button:not([type=submit])');
        if (clickables.length < 2) return;

        const qText = elem.querySelector('legend, [class*="stem"], [class*="question-text"], h2, h3, p')?.innerText?.trim()
                   || elem.innerText?.split('\n')[0]?.trim()
                   || `Pregunta ${i + 1}`;

        const options = Array.from(clickables).map(el => ({
          input: el,
          text: (el.closest('label')?.innerText || el.innerText || el.getAttribute('aria-label') || '').trim(),
        })).filter(o => o.text.length > 0);

        if (options.length >= 2) {
          questions.push({
            id: `elem_${i}`,
            text: normalizeQ(qText),
            options,
            isMultiple: clickables[0]?.type === 'checkbox',
            container: elem,
          });
        }
      });

      if (questions.length > 0) {
        log(`Encontradas ${questions.length} preguntas (selector: ${sel})`);
        return questions;
      }
    }

    log('No se encontraron preguntas con ninguna estrategia', 'warn');
    return [];
  }

  // ─────────────────────────────────────────────
  // ELEGIR RESPUESTA
  // ─────────────────────────────────────────────
  function chooseOptions(question, memory) {
    const { text: qText, options } = question;
    const wrongList = memory.wrong[qText] || [];
    const knownCorrect = memory.correct[qText];

    // 1. Respuesta conocida correcta
    if (knownCorrect) {
      const found = options.find(o => o.text === knownCorrect);
      if (found) {
        log(`Respuesta conocida: "${knownCorrect.substring(0, 50)}"`, 'ok');
        return [found];
      }
    }

    // 2. Primera opción no intentada aún como incorrecta
    const available = options.filter(o => !wrongList.includes(o.text));
    if (available.length > 0) {
      log(`Intentando: "${available[0].text.substring(0, 50)}"`, 'choice');
      return [available[0]];
    }

    // 3. Si probamos todo y ninguno funciona, resetear memoria de esta pregunta
    log('Todas las opciones fallaron, reseteando memoria para esta pregunta', 'warn');
    delete memory.wrong[qText];
    saveMemory(memory);
    return [options[0]];
  }

  // ─────────────────────────────────────────────
  // HACER CLICK EN OPCIÓN
  // ─────────────────────────────────────────────
  async function clickOption(option) {
    const el = option.input;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);

      // Primero prueba click directo
      el.click();

      // Si es label o div, simula eventos completos
      if (el.tagName !== 'INPUT') {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }

      // Marca visualmente el input como checked si es radio/checkbox
      if (el.type === 'radio' || el.type === 'checkbox') {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      await sleep(DELAY_CLICK);
      return true;
    } catch (e) {
      log(`Error al hacer click: ${e.message}`, 'warn');
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // SUBMIT / SIGUIENTE
  // ─────────────────────────────────────────────
  async function clickNext(doc) {
    const texts = ['next', 'siguiente', 'submit', 'enviar', 'check', 'comprobar', 'ok', 'continue'];
    const buttons = doc.querySelectorAll('button, input[type=submit], a[role=button]');

    for (const btn of buttons) {
      const label = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').toLowerCase().trim();
      if (texts.some(t => label.includes(t))) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(300);
        btn.click();
        log(`Botón "${btn.innerText?.trim() || label}" presionado`);
        await sleep(DELAY_FEEDBACK);
        return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // DETECTAR FEEDBACK (correcto/incorrecto)
  // ─────────────────────────────────────────────
  function detectFeedback(doc) {
    const bodyText = (doc.body?.innerText || '').toLowerCase();

    // Señales visuales en el DOM
    const correctSelectors = [
      '[class*="correct"]:not([class*="incorrect"])',
      '[class*="success"]',
      '[aria-label*="correct"]:not([aria-label*="incorrect"])',
      '.correct-answer',
      '[data-correct="true"]',
    ];
    const incorrectSelectors = [
      '[class*="incorrect"]',
      '[class*="wrong"]',
      '[class*="error"]:not([class*="no-error"])',
      '.incorrect-answer',
      '[data-correct="false"]',
    ];

    for (const sel of incorrectSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.offsetParent !== null) return 'INCORRECT'; // visible
    }
    for (const sel of correctSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.offsetParent !== null) return 'CORRECT';
    }

    // Texto en el body
    if (bodyText.includes('incorrect') || bodyText.includes('wrong') || bodyText.includes('incorrecto')) return 'INCORRECT';
    if (bodyText.includes('correct') || bodyText.includes('right') || bodyText.includes('correcto')) return 'CORRECT';

    return 'UNKNOWN';
  }

  // ─────────────────────────────────────────────
  // DETECTAR PUNTUACIÓN FINAL
  // ─────────────────────────────────────────────
  function detectScore(doc) {
    const text = doc.body?.innerText || '';

    // Busca "X out of Y" o "X/Y" o "X%"
    let match = text.match(/(\d+)\s*out\s*of\s*(\d+)/i);
    if (match) return (parseInt(match[1]) / parseInt(match[2])) * 100;

    match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) return (parseInt(match[1]) / parseInt(match[2])) * 100;

    match = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (match) return parseFloat(match[1]);

    // Busca "Number correct: X out of Y" (formato AWS Academy específico)
    match = text.match(/number correct[:\s]+(\d+)\s*out\s*of\s*(\d+)/i);
    if (match) return (parseInt(match[1]) / parseInt(match[2])) * 100;

    return null;
  }

  // ─────────────────────────────────────────────
  // CLICK EN RETRY
  // ─────────────────────────────────────────────
  async function clickRetry(doc) {
    const texts = ['retry', 'try again', 'volver a intentar', 'reintentar', 'retake', 'repetir'];
    const buttons = doc.querySelectorAll('button, a, input[type=button]');

    for (const btn of buttons) {
      const label = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').toLowerCase().trim();
      if (texts.some(t => label.includes(t))) {
        btn.click();
        log(`Botón retry "${btn.innerText?.trim()}" presionado`);
        await sleep(2000);
        return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // BUCLE PRINCIPAL
  // ─────────────────────────────────────────────
  const memory = loadMemory();
  log('=== AWS Academy Quiz Bot iniciado ===');
  log(`Memoria cargada: ${Object.keys(memory.correct).length} respuestas correctas conocidas`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log(`\n========== INTENTO #${attempt} ==========`);
    await sleep(1500);

    const doc = getActiveDoc();
    const questions = extractQuestions(doc);

    if (questions.length === 0) {
      log('No se encontraron preguntas. Verifica que el quiz esté visible.', 'warn');
      log('Reintentando en 3 segundos...', 'warn');
      await sleep(3000);

      // Intenta volver a detectar el doc
      const retryDoc = getActiveDoc();
      const retryQs = extractQuestions(retryDoc);
      if (retryQs.length === 0) {
        log('Sigue sin detectar preguntas. Posiblemente estás en la pantalla de inicio del quiz.', 'warn');
        log('Busca un botón de "Begin" o "Start" para iniciar...', 'warn');

        // Intenta hacer click en Start/Begin
        const startTexts = ['begin', 'start', 'iniciar', 'empezar', 'take quiz', 'take the quiz'];
        const allBtns = retryDoc.querySelectorAll('button, a');
        let started = false;
        for (const btn of allBtns) {
          const label = (btn.innerText || '').toLowerCase().trim();
          if (startTexts.some(t => label.includes(t))) {
            log(`Haciendo click en "${btn.innerText?.trim()}"...`);
            btn.click();
            await sleep(2000);
            started = true;
            break;
          }
        }
        if (!started) {
          log('No encontré botón de inicio. Por favor inicia el quiz manualmente.', 'warn');
          await sleep(5000);
        }
        continue;
      }
    }

    log(`Total preguntas encontradas: ${questions.length}`);

    // Responde cada pregunta
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      log(`\n❓ Pregunta ${qi + 1}: ${q.text.substring(0, 80)}...`, 'q');

      const chosen = chooseOptions(q, memory);

      // Hace click en la(s) opción(es)
      for (const opt of chosen) {
        await clickOption(opt);
      }

      // Presiona siguiente/submit
      const submitted = await clickNext(doc);

      if (submitted) {
        // Lee feedback
        const feedback = detectFeedback(doc);
        if (feedback === 'CORRECT') {
          log('Correcto!', 'ok');
          memory.correct[q.text] = chosen[0].text;
        } else if (feedback === 'INCORRECT') {
          log(`Incorrecto. Opción "${chosen[0].text.substring(0, 40)}" marcada como mala.`, 'fail');
          if (!memory.wrong[q.text]) memory.wrong[q.text] = [];
          for (const c of chosen) {
            if (!memory.wrong[q.text].includes(c.text)) {
              memory.wrong[q.text].push(c.text);
            }
          }
        } else {
          log(`Feedback no detectado (puede ser normal en este quiz)`, 'warn');
        }

        saveMemory(memory);
        await sleep(DELAY_NEXT);
      } else {
        log('No encontré botón next/submit, esperando...', 'warn');
        await sleep(2000);
      }
    }

    // ── Verifica puntuación final ──
    await sleep(2000);
    const doc2 = getActiveDoc();
    const score = detectScore(doc2);

    if (score !== null) {
      log(`\nPUNTUACIÓN FINAL: ${score.toFixed(1)}%`, 'score');
      log(`Respuestas correctas en memoria: ${Object.keys(memory.correct).length}`, 'score');

      if (score >= PASSING_SCORE) {
        log(`¡APROBADO! 🎉 ${score.toFixed(1)}% >= ${PASSING_SCORE}%`, 'ok');
        saveMemory(memory);
        return;
      } else {
        log(`No aprobado (${score.toFixed(1)}% < ${PASSING_SCORE}%). Reintentando...`, 'fail');
        const retried = await clickRetry(doc2);
        if (!retried) {
          log('No encontré botón de retry. Búscalo manualmente y vuelve a ejecutar el script.', 'warn');
          saveMemory(memory);
          return;
        }
        await sleep(2000);
      }
    } else {
      log('No detecté pantalla de puntuación final. Puede que las preguntas se respondan de una en una.', 'warn');
      // Si hay una sola pregunta visible, continuamos el bucle
      await sleep(1500);
    }
  }

  log(`Se alcanzó el máximo de ${MAX_ATTEMPTS} intentos.`, 'warn');
  log(`Respuestas correctas aprendidas: ${Object.keys(memory.correct).length}`, 'score');
  saveMemory(memory);

})();
