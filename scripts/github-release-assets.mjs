export function normalizeGitHubReleaseAssetName(fileName) {
  return fileName
    .split("/")
    .map((segment) => segment.replace(/\s+/g, "."))
    .join("/");
}

export function encodeGitHubReleaseAssetUrlPath(fileName) {
  return normalizeGitHubReleaseAssetName(fileName)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
