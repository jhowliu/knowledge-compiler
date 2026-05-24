import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.SERVER_PORT, () => {
  console.log(`Knowledge Compiler API listening on http://localhost:${env.SERVER_PORT}`);
});
