import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const required = ["version", "repo", "tag", "platform-key", "artifact", "signature-file", "output"];

for (const key of required) {
  if (!args[key]) {
    throw new Error(`Missing required argument --${key}`);
  }
}

const signature = readFileSync(args["signature-file"], "utf8").trim();
const notes = args["notes-file"] ? readFileSync(args["notes-file"], "utf8").trim() : `Helix Setlist Editor ${args.version}`;
const artifactName = basename(args.artifact);
const encodedArtifactName = encodeURIComponent(artifactName);

const payload = {
  version: args.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [args["platform-key"]]: {
      signature,
      url: `https://github.com/${args.repo}/releases/download/${args.tag}/${encodedArtifactName}`,
    },
  },
};

writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${args.output}`);
