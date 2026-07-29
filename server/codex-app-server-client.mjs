import { spawn } from "node:child_process";
import readline from "node:readline";

export class CodexAppServerClient {
  #nextId = 0;
  #pending = new Map();
  #stderr = "";
  #closed = false;

  constructor({
    codexBin = "codex",
    codexArgs = ["app-server", "--listen", "stdio://"],
    codexEnv,
    onNotification = () => {},
  } = {}) {
    this.onNotification = onNotification;
    this.proc = spawn(codexBin, codexArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: codexEnv ?? process.env,
    });
    this.lines = readline.createInterface({ input: this.proc.stdout });
    this.lines.on("line", (line) => this.#onLine(line));
    this.proc.stderr.on("data", (chunk) => {
      this.#stderr = `${this.#stderr}${chunk.toString()}`.slice(-12_000);
    });
    this.proc.on("exit", (code) => {
      this.#closed = true;
      this.#rejectPending(
        new Error(
          `Codex App Server exited before the request completed (code ${code ?? "unknown"}).`,
        ),
      );
    });
    this.proc.on("error", (cause) => {
      this.#closed = true;
      this.#rejectPending(
        new Error("Codex App Server could not be started.", { cause }),
      );
    });
  }

  #rejectPending(error) {
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }

  #onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `Codex App Server rejected ${pending.method}: ${message.error.message ?? "unknown protocol error"}`,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method) this.onNotification(message);
  }

  send(message) {
    if (this.#closed) throw new Error("Codex App Server is closed.");
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = 60_000) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for Codex App Server method ${method}.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.send({ method, id, params });
    });
  }

  async initialize(
    clientInfo,
    capabilities = { experimentalApi: true },
  ) {
    const result = await this.request(
      "initialize",
      { clientInfo, capabilities },
      20_000,
    );
    this.send({ method: "initialized", params: {} });
    return result;
  }

  async waitForTurn(turnId, timeoutMs = 20 * 60_000) {
    return new Promise((resolve, reject) => {
      const previous = this.onNotification;
      const timer = setTimeout(() => {
        this.onNotification = previous;
        reject(new Error("Timed out waiting for the Codex research turn."));
      }, timeoutMs);
      let finalText = null;

      this.onNotification = (message) => {
        previous(message);
        const item = message.params?.item;
        if (
          message.method === "item/completed" &&
          message.params?.turnId === turnId &&
          item?.type === "agentMessage" &&
          item?.phase === "final_answer"
        ) {
          finalText = item.text;
        }
        if (
          message.method === "turn/completed" &&
          message.params?.turn?.id === turnId
        ) {
          clearTimeout(timer);
          this.onNotification = previous;
          if (message.params.turn.status !== "completed") {
            reject(
              new Error(
                message.params.turn.error?.message ??
                  `Codex turn ended as ${message.params.turn.status}.`,
              ),
            );
            return;
          }
          if (!finalText) {
            reject(new Error("Codex completed without a final structured message."));
            return;
          }
          resolve({
            text: finalText,
            durationMs: message.params.turn.durationMs ?? null,
          });
        }
      };
    });
  }

  close() {
    this.lines.close();
    if (!this.#closed) this.proc.kill("SIGTERM");
  }
}
