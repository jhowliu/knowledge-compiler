import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createLlmCompileAgentRunner } from "./services/compileAgentRunner.js";

const app = createApp({
  // Production drives the compile loop with the real LLM runner; tests and the
  // default keep the deterministic scripted runner.
  compileAgentRunnerFactory: (context) => createLlmCompileAgentRunner(context),
});

app.listen(env.SERVER_PORT, () => {
  console.log(`Knowledge Compiler API listening on http://localhost:${env.SERVER_PORT}`);
});
