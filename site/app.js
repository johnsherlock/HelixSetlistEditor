const repo = "johnsherlock/HelixSetlistEditor";
const fallbackReleaseUrl = `https://github.com/${repo}/releases`;
const downloadButtons = {
  mac: document.querySelector('[data-download="mac"]'),
  windows: document.querySelector('[data-download="windows"]'),
};
const versionLabel = document.querySelector("[data-version-label]");
const releaseLink = document.querySelector("[data-release-link]");
const macDownloadModal = document.querySelector("[data-download-modal]");
const macDownloadContinue = document.querySelector("[data-mac-download-continue]");
const macDownloadLabel = "Download for macOS";
const macContinueLabel = "Continue to macOS download";

function setDisabled(button, label) {
  if (!button) {
    return;
  }

  button.classList.add("is-disabled");
  button.removeAttribute("href");
  button.textContent = label;
}

function applyRelease(data) {
  const version = data.version ?? "Latest release";
  if (versionLabel) {
    versionLabel.textContent = `Current version: ${version}`;
  }
  if (releaseLink) {
    releaseLink.href = data.releaseUrl ?? fallbackReleaseUrl;
  }

  if (data.mac?.url) {
    downloadButtons.mac.classList.remove("is-disabled");
    downloadButtons.mac.href = data.mac.url;
    downloadButtons.mac.textContent = macDownloadLabel;
    if (macDownloadContinue) {
      macDownloadContinue.classList.remove("is-disabled");
      macDownloadContinue.href = data.mac.url;
      macDownloadContinue.textContent = macContinueLabel;
    }
  } else {
    setDisabled(downloadButtons.mac, "macOS build unavailable");
    if (macDownloadContinue) {
      macDownloadContinue.removeAttribute("href");
      macDownloadContinue.classList.add("is-disabled");
      macDownloadContinue.textContent = "macOS build unavailable";
    }
  }

  if (data.windows?.url) {
    downloadButtons.windows.href = data.windows.url;
  } else {
    setDisabled(downloadButtons.windows, "Windows build unavailable");
  }
}

function normaliseRelease(release) {
  if (!release) {
    return null;
  }

  const macAsset = release.assets.find((asset) => asset.name.endsWith(".dmg"));
  const windowsAsset = release.assets.find((asset) => asset.name.endsWith(".msi"));

  if (!macAsset && !windowsAsset) {
    return null;
  }

  return {
    version: release.tag_name?.replace(/^v/, "") ?? null,
    releaseUrl: release.html_url ?? fallbackReleaseUrl,
    mac: macAsset
      ? {
          url: macAsset.browser_download_url,
        }
      : null,
    windows: windowsAsset
      ? {
          url: windowsAsset.browser_download_url,
        }
      : null,
  };
}

async function fetchManifest() {
  const response = await fetch("./downloads.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchLatestFromGitHub() {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub releases request failed: ${response.status}`);
  }

  const latestWithDesktopAssets = normaliseRelease(await response.json());

  if (!latestWithDesktopAssets) {
    throw new Error("No downloadable desktop release found.");
  }

  return latestWithDesktopAssets;
}

async function loadReleaseDetails() {
  try {
    const manifest = await fetchManifest();
    if (manifest?.version && (manifest.mac?.url || manifest.windows?.url)) {
      applyRelease(manifest);
      return;
    }
  } catch {
    // fall through to GitHub API
  }

  try {
    const latestRelease = await fetchLatestFromGitHub();
    applyRelease(latestRelease);
  } catch {
    if (versionLabel) {
      versionLabel.textContent = "Latest download details are on GitHub Releases.";
    }
    if (releaseLink) {
      releaseLink.href = fallbackReleaseUrl;
    }
    downloadButtons.mac.href = fallbackReleaseUrl;
    downloadButtons.windows.href = fallbackReleaseUrl;
    if (macDownloadContinue) {
      macDownloadContinue.href = fallbackReleaseUrl;
    }
  }
}

function openMacDownloadModal(event) {
  if (!downloadButtons.mac || downloadButtons.mac.classList.contains("is-disabled")) {
    return;
  }

  event.preventDefault();

  if (macDownloadContinue && downloadButtons.mac.href) {
    macDownloadContinue.href = downloadButtons.mac.href;
  }

  if (typeof macDownloadModal?.showModal === "function") {
    if (!macDownloadModal.open) {
      macDownloadModal.showModal();
    }
    return;
  }

  window.location.href = downloadButtons.mac.href;
}

downloadButtons.mac?.addEventListener("click", openMacDownloadModal);

void loadReleaseDetails();
