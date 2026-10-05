import { normalizeSkinet, skinetMetrics, isSkinetIdentityQuestion } from "./skinetUnderstanding";

export type SkinetStatus = "off" | "wake" | "question" | "thinking" | "speaking";
export type RecognitionResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
export interface SkinetRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  abort(): void;
}

export function skinetWake(text: string) {
  const match = /\b(?:hola\s+)?(?:skai\s?net|skinet|sky\s?net|ski\s?net)\b/i.exec(text);
  return match ? { question: text.slice(match.index + match[0].length).replace(/^[\s,.:;!?¿¡]+/, "").trim() } : null;
}

export function isSkinetQuestion(text: string) {
  if (isSkinetIdentityQuestion(text)) return true;
  const normalized = normalizeSkinet(text);
  return (skinetMetrics(normalized).length > 0 && /\b(cuant[oa]s?|como|cual|dime|muestrame|que|hl|logisticos|corona|surti)\b/.test(normalized))
    || /^(?:y\s+)?(?:hl|logisticos|corona|surti|galapa|arenosa|ayer|anteayer|hoy)[\s.!?]*$/.test(normalized.trim())
    || (normalized.length < 90 && /^\s*y\b/.test(normalized) && /\b(hl|logisticos|corona|surti|galapa|arenosa|ayer|anteayer|hoy|reubicadas|moduladas)\b/.test(normalized));
}

export class SkinetVoice {
  private active = false;
  private state: SkinetStatus = "off";
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private questionTimer?: ReturnType<typeof setTimeout>;
  private questionDebounce?: ReturnType<typeof setTimeout>;
  private pendingQuestion = "";
  constructor(private recognition: SkinetRecognition, private callbacks: {
    speak: (text: string, done: () => void) => void;
    cancelSpeech: () => void;
    answer: (question: string) => Promise<string>;
    status: (status: SkinetStatus) => void;
    question: (question: string) => void;
    reply: (reply: string) => void;
    error: (error: string) => void;
  }, private options: { questionDelayMs?: number } = {}) {
    recognition.lang = "es-CO";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (!this.active) continue;
        if (!event.results[index].isFinal) {
          if (this.pendingQuestion) this.scheduleQuestion();
          continue;
        }
        const text = event.results[index][0].transcript.trim();
        if (!text) continue;
        if (this.state === "wake") {
          const wake = skinetWake(text);
          if (!wake) {
            if (this.pendingQuestion || isSkinetQuestion(text) || /^(?:(?:oe|mijo)\s+)?(?:como|cuant[oa]s?|cual|que|dime|muestrame)\b/i.test(normalizeSkinet(text).replace(/^[¿¡\s]+/, ""))) this.queueQuestion(text);
            continue;
          }
          if (wake.question) {
            this.setStatus("question");
            this.queueQuestion(wake.question);
            continue;
          }
          this.greet("");
          break;
        }
        if (this.state === "question") {
          const question = skinetWake(text)?.question || text;
          if (skinetWake(text) && !skinetWake(text)?.question) this.greet("");
          else this.queueQuestion(question);
        }
      }
    };
    recognition.onend = () => {
      if (!this.active || !["wake", "question"].includes(this.state)) return;
      this.scheduleListen();
    };
    recognition.onerror = event => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      this.stop();
      callbacks.error(["not-allowed", "service-not-allowed"].includes(event.error)
        ? "Permite el micrófono en el navegador para hablar con Skainet."
        : event.error === "audio-capture" ? "No se encontró un micrófono disponible. Puedes escribir tu pregunta."
          : "No se pudo reconocer la voz. Puedes escribir tu pregunta o activar el micrófono nuevamente.");
    };
  }
  start() {
    this.active = true;
    this.setStatus("wake");
    this.listen();
  }
  stop() {
    this.active = false;
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.questionTimer);
    this.clearQuestion();
    this.setStatus("off");
    this.recognition.abort();
    this.callbacks.cancelSpeech();
  }
  private setStatus(status: SkinetStatus) { this.state = status; this.callbacks.status(status); }
  private listen() {
    if (!this.active) return;
    try { this.recognition.start(); }
    catch (error) {
      if (error instanceof Error && error.name === "InvalidStateError") return;
      this.stop();
      this.callbacks.error("No se pudo iniciar el micrófono. Puedes escribir tu pregunta.");
    }
  }
  private scheduleListen() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.listen(), 500);
  }
  private greet(question: string) {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.questionTimer);
    this.clearQuestion();
    this.setStatus("speaking");
    this.recognition.abort();
    const greeting = "¿En qué puedo ayudarte?";
    this.callbacks.reply(greeting);
    this.callbacks.speak(greeting, () => {
      if (!this.active || generation !== this.generation) return;
      if (question) { void this.ask(question); return; }
      this.listenForQuestion();
    });
  }
  private clearQuestion() {
    clearTimeout(this.questionDebounce);
    this.pendingQuestion = "";
  }
  private queueQuestion(text: string) {
    this.pendingQuestion = `${this.pendingQuestion} ${text}`.trim();
    this.scheduleQuestion();
  }
  private scheduleQuestion() {
    clearTimeout(this.questionDebounce);
    const submit = () => {
      const text = this.pendingQuestion;
      this.pendingQuestion = "";
      if (!text || !this.active || !["wake", "question"].includes(this.state)) return;
      if (this.state === "question" || isSkinetQuestion(text)) void this.ask(text);
    };
    const delay = this.options.questionDelayMs ?? 1_000;
    if (delay === 0) submit();
    else this.questionDebounce = setTimeout(submit, delay);
  }
  private listenForQuestion() {
    this.setStatus("question");
    this.listen();
    clearTimeout(this.questionTimer);
    this.questionTimer = setTimeout(() => {
      if (this.active && this.state === "question") this.setStatus("wake");
    }, 15_000);
  }
  announce(report: string) {
    if (this.pendingQuestion || ["thinking", "speaking", "question"].includes(this.state)) return false;
    const generation = ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.questionTimer);
    this.setStatus("speaking");
    this.recognition.abort();
    this.callbacks.reply(report);
    this.callbacks.speak(report, () => {
      if (generation !== this.generation) return;
      this.setStatus(this.active ? "wake" : "off");
      if (this.active) this.listen();
    });
    return true;
  }
  async ask(question: string) {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.questionTimer);
    this.clearQuestion();
    this.setStatus("thinking");
    this.recognition.abort();
    this.callbacks.cancelSpeech();
    this.callbacks.question(question);
    try {
      const reply = await this.callbacks.answer(question);
      if (generation !== this.generation) return;
      this.callbacks.reply(reply);
      if (!this.active) { this.setStatus("off"); return; }
      this.setStatus("speaking");
      this.callbacks.speak(reply, () => {
        if (!this.active || generation !== this.generation) return;
        this.listenForQuestion();
      });
    } catch {
      if (generation !== this.generation) return;
      this.stop();
      this.callbacks.error("No pude consultar los datos. Intenta nuevamente.");
    }
  }
}
