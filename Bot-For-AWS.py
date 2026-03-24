"""
AWS Academy Quiz Bot - Playwright Automation
=============================================
Automatiza quizzes de AWS Academy (Canvas LMS + Quiz LTI).

INSTALACIÓN:
    pip install playwright anthropic
    playwright install chromium

USO:
    python aws_quiz_bot.py

El script abrirá un navegador, tú inicias sesión manualmente,
navegas al quiz, y el bot hace el resto automáticamente.
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright, Page, Frame

# ─────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────
# Opcional: URL directa al quiz. Si está vacío, el bot espera a que navegues tú.
QUIZ_URL = ""
PASSING_SCORE = 70  # Porcentaje mínimo para aprobar
# Cambia a True si tienes API key de Anthropic para usar IA en respuestas
USE_AI = False
ANTHROPIC_API_KEY = ""  # Tu key si USE_AI = True


# ─────────────────────────────────────────────
# BASE DE CONOCIMIENTO AWS (respuestas comunes)
# ─────────────────────────────────────────────
AWS_KNOWLEDGE = {
    # Añade aquí pares pregunta→respuesta que vayas aprendiendo
    # "¿Qué servicio de AWS...?": "Amazon S3",
}


# ─────────────────────────────────────────────
# CLIENTE IA (opcional)
# ─────────────────────────────────────────────
async def ask_claude(question: str, options: list[str]) -> str:
    """Pregunta a Claude cuál es la respuesta correcta."""
    if not USE_AI or not ANTHROPIC_API_KEY:
        return ""

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    options_text = "\n".join(
        [f"{i+1}. {opt}" for i, opt in enumerate(options)])
    prompt = f"""Eres un experto en AWS. Responde SOLO con el número de la opción correcta (1, 2, 3 o 4).
    
Pregunta: {question}

Opciones:
{options_text}

Responde únicamente con el número."""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=10,
        messages=[{"role": "user", "content": prompt}]
    )

    answer = message.content[0].text.strip()
    # Extrae número de la respuesta
    match = re.search(r'\d', answer)
    if match:
        idx = int(match.group()) - 1
        if 0 <= idx < len(options):
            return options[idx]
    return ""


# ─────────────────────────────────────────────
# LÓGICA PRINCIPAL DEL BOT
# ─────────────────────────────────────────────

class QuizMemory:
    """Recuerda qué respuestas fueron correctas e incorrectas."""

    def __init__(self):
        # pregunta → [respuesta correcta]
        self.correct: dict[str, list[str]] = {}
        # pregunta → [respuestas incorrectas]
        self.incorrect: dict[str, list[str]] = {}
        self.attempts = 0

    def mark_correct(self, question: str, answer: str):
        self.correct[question] = answer

    def mark_incorrect(self, question: str, answer: str):
        if question not in self.incorrect:
            self.incorrect[question] = []
        if answer not in self.incorrect[question]:
            self.incorrect[question].append(answer)

    def get_known_correct(self, question: str) -> str | None:
        return self.correct.get(question)

    def get_wrong_answers(self, question: str) -> list[str]:
        return self.incorrect.get(question, [])

    def save(self, filename="quiz_memory.json"):
        with open(filename, "w") as f:
            json.dump({"correct": self.correct, "incorrect": self.incorrect},
                      f, indent=2, ensure_ascii=False)
        print(f"💾 Memoria guardada en {filename}")

    def load(self, filename="quiz_memory.json"):
        try:
            with open(filename) as f:
                data = json.load(f)
                self.correct = data.get("correct", {})
                self.incorrect = data.get("incorrect", {})
            print(
                f"📂 Memoria cargada: {len(self.correct)} respuestas conocidas")
        except FileNotFoundError:
            print("📂 Sin memoria previa, empezando desde cero")


async def find_quiz_frame(page: Page) -> Frame | None:
    """Busca el frame del quiz LTI dentro de la página."""
    await asyncio.sleep(2)

    for frame in page.frames:
        url = frame.url
        if "quiz" in url.lower() or "quiz-lti" in url.lower() or "skillbuilder" in url.lower():
            print(f"✅ Frame del quiz encontrado: {url[:80]}...")
            return frame

    # Si no encuentra frame específico, prueba con el frame principal
    print("⚠️  No se encontró frame LTI específico, usando página principal")
    return None


async def get_questions(frame_or_page) -> list[dict]:
    """Extrae todas las preguntas y opciones del quiz."""
    questions = []

    try:
        # Selectores comunes en Canvas Quiz LTI
        question_selectors = [
            ".question",
            "[data-testid='question']",
            ".quiz-question",
            "[class*='Question']",
            "fieldset",
        ]

        for selector in question_selectors:
            elements = await frame_or_page.query_selector_all(selector)
            if elements:
                print(
                    f"📋 Encontradas {len(elements)} preguntas con selector '{selector}'")
                break

        for i, elem in enumerate(elements):
            # Texto de la pregunta
            q_text = await elem.inner_text()

            # Opciones de respuesta
            option_selectors = ["input[type='radio']",
                                "input[type='checkbox']", "label", "[role='radio']"]
            options = []

            for opt_sel in option_selectors:
                opts = await elem.query_selector_all(opt_sel)
                if opts:
                    for opt in opts:
                        label = await opt.inner_text()
                        if label.strip():
                            options.append(
                                {"element": opt, "text": label.strip()})
                    break

            if options:
                questions.append({
                    "index": i,
                    "text": q_text.strip()[:200],
                    "options": options,
                    "element": elem,
                    "is_multiple": len([o for o in options if "checkbox" in str(o)]) > 0
                })

    except Exception as e:
        print(f"⚠️  Error extrayendo preguntas: {e}")

    return questions


async def select_answer(option_elem, page_or_frame):
    """Hace click en una opción de respuesta."""
    try:
        await option_elem.scroll_into_view_if_needed()
        await option_elem.click()
        await asyncio.sleep(0.5)
        return True
    except Exception as e:
        print(f"  ⚠️  Error al hacer click: {e}")
        return False


async def submit_question(page_or_frame) -> bool:
    """Busca y hace click en el botón de siguiente/submit."""
    submit_selectors = [
        "button:has-text('Next')",
        "button:has-text('Submit')",
        "button:has-text('Check')",
        "button:has-text('Siguiente')",
        "button:has-text('Enviar')",
        "[data-testid='next-button']",
        "[data-testid='submit-button']",
        ".submit-button",
        "button[type='submit']",
    ]

    for sel in submit_selectors:
        try:
            btn = await page_or_frame.query_selector(sel)
            if btn and await btn.is_visible():
                await btn.click()
                await asyncio.sleep(1.5)
                return True
        except:
            continue

    return False


async def check_feedback(page_or_frame) -> str:
    """Lee el feedback después de responder (correcto/incorrecto)."""
    await asyncio.sleep(1)

    feedback_selectors = [
        ".correct",
        ".incorrect",
        "[class*='correct']",
        "[class*='feedback']",
        "[data-testid='feedback']",
        ".answer-feedback",
        "[aria-live='polite']",
        ".result",
    ]

    for sel in feedback_selectors:
        try:
            elem = await page_or_frame.query_selector(sel)
            if elem and await elem.is_visible():
                text = await elem.inner_text()
                text_lower = text.lower()
                if any(w in text_lower for w in ["correct", "incorrect", "right", "wrong", "✓", "✗", "✔", "✘"]):
                    return text
        except:
            continue

    # Busca por color o clase CSS
    try:
        page_content = await page_or_frame.content()
        if "correct" in page_content.lower():
            if "incorrect" in page_content.lower():
                return "INCORRECT"
            return "CORRECT"
    except:
        pass

    return "UNKNOWN"


async def check_final_score(page_or_frame) -> float | None:
    """Detecta la pantalla final y extrae el porcentaje."""
    score_selectors = [
        "[data-testid='score']",
        ".score",
        "[class*='Score']",
        "[class*='result']",
        ".quiz-score",
    ]

    for sel in score_selectors:
        try:
            elem = await page_or_frame.query_selector(sel)
            if elem and await elem.is_visible():
                text = await elem.inner_text()
                # Busca porcentaje
                match = re.search(r'(\d+(?:\.\d+)?)\s*%', text)
                if match:
                    return float(match.group(1))
                # Busca fracción X/10
                match = re.search(r'(\d+)\s*/\s*(\d+)', text)
                if match:
                    return (int(match.group(1)) / int(match.group(2))) * 100
        except:
            continue

    return None


async def click_retry(page_or_frame) -> bool:
    """Hace click en 'Volver a intentar' o similar."""
    retry_selectors = [
        "button:has-text('Try Again')",
        "button:has-text('Retry')",
        "button:has-text('Volver a intentar')",
        "button:has-text('Reintentar')",
        "a:has-text('Try Again')",
        "[data-testid='retry-button']",
    ]

    for sel in retry_selectors:
        try:
            btn = await page_or_frame.query_selector(sel)
            if btn and await btn.is_visible():
                await btn.click()
                await asyncio.sleep(2)
                return True
        except:
            continue

    return False


# ─────────────────────────────────────────────
# ESTRATEGIA DE RESPUESTA
# ─────────────────────────────────────────────

async def choose_answer(question_text: str, options: list[dict], memory: QuizMemory) -> list[dict]:
    """
    Elige la(s) respuesta(s) basándose en:
    1. Memoria de respuestas correctas previas
    2. IA (si está habilitada)
    3. Primera opción no intentada
    """
    option_texts = [o["text"] for o in options]
    wrong = memory.get_wrong_answers(question_text)

    # 1. ¿Ya sabemos la respuesta correcta?
    known = memory.get_known_correct(question_text)
    if known:
        for opt in options:
            if opt["text"] == known:
                print(f"  🧠 Respuesta conocida: {known[:50]}")
                return [opt]

    # 2. ¿Podemos usar IA?
    if USE_AI:
        ai_answer = await ask_claude(question_text, option_texts)
        if ai_answer:
            for opt in options:
                if opt["text"] == ai_answer:
                    print(f"  🤖 IA sugiere: {ai_answer[:50]}")
                    return [opt]

    # 3. Base de conocimiento local
    for q_key, ans in AWS_KNOWLEDGE.items():
        if q_key.lower() in question_text.lower():
            for opt in options:
                if ans.lower() in opt["text"].lower():
                    print(f"  📚 Base de conocimiento: {opt['text'][:50]}")
                    return [opt]

    # 4. Primera opción no intentada
    available = [opt for opt in options if opt["text"] not in wrong]
    if available:
        chosen = available[0]
        print(f"  🎲 Intentando: {chosen['text'][:50]}")
        return [chosen]

    # 5. Si ya intentamos todo, resetear y empezar de nuevo
    print("  🔄 Todas las opciones intentadas, reintentando primera")
    return [options[0]]


# ─────────────────────────────────────────────
# BUCLE PRINCIPAL
# ─────────────────────────────────────────────

async def run_quiz_bot():
    memory = QuizMemory()
    memory.load()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=500)
        context = await browser.new_context()
        page = await context.new_page()

        if QUIZ_URL:
            await page.goto(QUIZ_URL)
        else:
            await page.goto("https://awsacademy.instructure.com")

        print("\n" + "="*60)
        print("🤖 AWS ACADEMY QUIZ BOT")
        print("="*60)
        print("📌 Navega al quiz en el navegador que se abrió.")
        print("   Cuando estés en la página del quiz, presiona ENTER aquí.")
        print("="*60)
        input("\n▶  Presiona ENTER cuando estés listo...")

        max_attempts = 5

        for attempt in range(1, max_attempts + 1):
            memory.attempts = attempt
            print(f"\n🔁 INTENTO #{attempt}")
            print("-" * 40)

            await asyncio.sleep(2)

            # Busca el frame del quiz
            target = await find_quiz_frame(page)
            if not target:
                target = page

            # Extrae preguntas
            questions = await get_questions(target)

            if not questions:
                print("⚠️  No se encontraron preguntas. ¿Estás en la página del quiz?")
                print(
                    "   Verifica que el quiz esté visible y presiona ENTER para reintentar...")
                input()
                continue

            print(f"📋 Total de preguntas detectadas: {len(questions)}")

            # Responde cada pregunta
            for q in questions:
                q_text = q["text"]
                print(f"\n❓ Pregunta {q['index']+1}: {q_text[:80]}...")

                chosen = await choose_answer(q_text, q["options"], memory)

                for answer in chosen:
                    await select_answer(answer["element"], target)

                submitted = await submit_question(target)

                if submitted:
                    feedback = await check_feedback(target)
                    feedback_lower = feedback.lower()

                    if "incorrect" in feedback_lower or "wrong" in feedback_lower or "✗" in feedback:
                        print(f"  ❌ Incorrecto")
                        for ans in chosen:
                            memory.mark_incorrect(q_text, ans["text"])
                    elif "correct" in feedback_lower or "right" in feedback_lower or "✓" in feedback:
                        print(f"  ✅ Correcto!")
                        for ans in chosen:
                            memory.mark_correct(q_text, ans["text"])
                    else:
                        print(f"  ❓ Feedback no claro: {feedback[:60]}")

                    await asyncio.sleep(1)

            # Verifica puntuación final
            await asyncio.sleep(2)
            score = await check_final_score(target)

            if score is not None:
                print(f"\n📊 PUNTUACIÓN FINAL: {score:.1f}%")
                memory.save()

                if score >= PASSING_SCORE:
                    print(
                        f"🎉 ¡APROBADO! Score: {score:.1f}% (mínimo: {PASSING_SCORE}%)")
                    break
                else:
                    print(
                        f"😔 No aprobado ({score:.1f}% < {PASSING_SCORE}%). Reintentando...")
                    retried = await click_retry(target)
                    if not retried:
                        print(
                            "⚠️  No encontré botón de reintento. Hazlo manualmente y presiona ENTER...")
                        input()
            else:
                print("⚠️  No detecté pantalla de puntuación final.")
                print(
                    "   Si el quiz terminó, revisa el score y presiona ENTER para continuar...")
                memory.save()
                user_input = input("   ¿Aprobaste? (s/n): ").strip().lower()
                if user_input == 's':
                    print("🎉 ¡Marcado como aprobado!")
                    break
                elif attempt < max_attempts:
                    print("   Buscando botón de reintento...")
                    await click_retry(target)

        print("\n" + "="*60)
        print("🏁 Bot finalizado. Memoria guardada en quiz_memory.json")
        print("="*60)

        input("\nPresiona ENTER para cerrar el navegador...")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(run_quiz_bot())
