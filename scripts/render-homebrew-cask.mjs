import { writeFileSync } from "node:fs";

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
const required = ["version", "repo", "sha256", "artifact-name", "output"];

for (const key of required) {
  if (!args[key]) {
    throw new Error(`Missing required argument --${key}`);
  }
}

const cask = `cask "helix-setlist-editor" do
  version "${args.version}"
  sha256 "${args.sha256}"

  url "https://github.com/${args.repo}/releases/download/v#{version}/${args["artifact-name"]}",
      verified: "github.com/${args.repo}/"
  name "Helix Setlist Editor"
  desc "Desktop editor for Line 6 Helix .hls setlists"
  homepage "https://github.com/${args.repo}"

  depends_on arch: :arm64

  app "Helix Setlist Editor.app"

  caveats do
    <<~EOS
      This beta build is unsigned and not notarized.
      If macOS blocks the first launch, right-click the app in Finder, choose Open, and confirm the prompt.
    EOS
  end
end
`;

writeFileSync(args.output, cask, "utf8");
console.log(`Wrote ${args.output}`);
