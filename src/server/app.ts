import { existsSync } from "node:fs";
import { resolve } from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { HelixLibraryService, type SaveSetlistInput, type SetlistDraft } from "../io/library.js";

interface PathQuery {
  homeDir: string;
  relativePath: string;
}

interface HomeDirQuery {
  homeDir: string;
}

interface SaveSetlistBody {
  homeDir: string;
  relativePath: string;
  overwrite?: boolean;
  draft: SetlistDraft;
}

export function createApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 10 * 1024 * 1024,
  });
  const webRoot = resolve(process.cwd(), "dist", "web");

  app.get("/api/health", async () => ({ ok: true }));

  app.get<{ Querystring: HomeDirQuery }>("/api/library", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);

      return {
        homeDir: library.getHomeDir(),
        presetsDir: library.getCollectionDir("presets"),
        setlistsDir: library.getCollectionDir("setlists"),
      };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to inspect library.",
      });
    }
  });

  app.get<{ Querystring: HomeDirQuery }>("/api/setlists", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);
      return { items: await library.listSetlists() };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to list setlists.",
      });
    }
  });

  app.get<{ Querystring: HomeDirQuery }>("/api/presets", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);
      return { items: await library.listPresets() };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to list presets.",
      });
    }
  });

  app.get<{ Querystring: PathQuery }>("/api/setlists/load", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);
      return await library.loadSetlist(request.query.relativePath);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to load setlist.",
      });
    }
  });

  app.get<{ Querystring: PathQuery }>("/api/presets/load", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);
      return await library.loadPreset(request.query.relativePath);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to load preset.",
      });
    }
  });

  app.post<{ Body: SaveSetlistBody }>("/api/setlists/save", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.body.homeDir);
      const saveInput: SaveSetlistInput = {
        relativePath: request.body.relativePath,
        overwrite: request.body.overwrite,
        draft: request.body.draft,
      };
      const file = await library.saveSetlist(saveInput);
      return { file };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to save setlist.",
      });
    }
  });

  app.delete<{ Querystring: PathQuery }>("/api/setlists", async (request, reply) => {
    try {
      const library = createLibraryFromHomeDir(request.query.homeDir);
      await library.deleteSetlist(request.query.relativePath);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Failed to delete setlist.",
      });
    }
  });

  if (existsSync(resolve(webRoot, "index.html"))) {
    void app.register(fastifyStatic, {
      root: webRoot,
      prefix: "/",
    });

    app.get("/", async (_, reply) => {
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function createLibraryFromHomeDir(homeDir: string | undefined): HelixLibraryService {
  if (!homeDir || !homeDir.trim()) {
    throw new Error("homeDir is required.");
  }

  return new HelixLibraryService(homeDir);
}
