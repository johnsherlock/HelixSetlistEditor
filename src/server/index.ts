import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const app = createApp();

app
  .listen({ port, host })
  .then(() => {
    console.log(`Helix Setlist Editor API listening on http://${host}:${port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
