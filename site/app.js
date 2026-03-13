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
const macDownloadIntel = document.querySelector("[data-mac-download-intel]");
const macDownloadArchCopy = document.querySelector("[data-mac-download-arch-copy]");
const screenshotOpenButton = document.querySelector("[data-screenshot-open]");
const imageModal = document.querySelector("[data-image-modal]");
const carouselImage = document.querySelector("[data-carousel-image]");
const carouselPrevButton = document.querySelector("[data-carousel-prev]");
const carouselNextButton = document.querySelector("[data-carousel-next]");
const copyCommandBlock = document.querySelector("[data-copy-command]");
const copyCommandButton = document.querySelector("[data-copy-command-button]");
const macDownloadLabel = "Download for MacOS";
const macContinueLabel = "Continue to MacOS download";
const macAppleSiliconLabel = "Download for Apple Silicon";
const macIntelLabel = "Download for Intel Mac";
const copyCommandDefaultLabel = "Copy command";
const demoSteps = [
  { src: "./assets/Step1.png", alt: "Step 1 of the Helix Setlist Editor demo" },
  { src: "./assets/Step2.png", alt: "Step 2 of the Helix Setlist Editor demo" },
  { src: "./assets/Step3.png", alt: "Step 3 of the Helix Setlist Editor demo" },
  { src: "./assets/Step4.png", alt: "Step 4 of the Helix Setlist Editor demo" },
  { src: "./assets/Step5.png", alt: "Step 5 of the Helix Setlist Editor demo" },
  { src: "./assets/Step6.png", alt: "Step 6 of the Helix Setlist Editor demo" },
  { src: "./assets/Step7.png", alt: "Step 7 of the Helix Setlist Editor demo" },
];
let currentDemoStepIndex = 0;

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

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
  const macAppleSilicon = data.macAppleSilicon ?? data.mac ?? null;
  const macIntel = data.macIntel ?? null;

  if (versionLabel) {
    versionLabel.textContent = `Current version: ${version}`;
  }
  if (releaseLink) {
    releaseLink.href = data.releaseUrl ?? fallbackReleaseUrl;
  }

  if (macAppleSilicon?.url || macIntel?.url) {
    const primaryMacUrl = macAppleSilicon?.url ?? macIntel?.url;
    downloadButtons.mac.classList.remove("is-disabled");
    downloadButtons.mac.href = primaryMacUrl;
    downloadButtons.mac.textContent = macDownloadLabel;

    if (macDownloadContinue) {
      macDownloadContinue.classList.remove("is-disabled");
      macDownloadContinue.href = primaryMacUrl;
      macDownloadContinue.textContent =
        macAppleSilicon?.url && macIntel?.url
          ? macAppleSiliconLabel
          : macContinueLabel;
    }

    if (macDownloadArchCopy) {
      macDownloadArchCopy.hidden = !(macAppleSilicon?.url && macIntel?.url);
    }

    if (macDownloadIntel) {
      if (macAppleSilicon?.url && macIntel?.url) {
        macDownloadIntel.hidden = false;
        macDownloadIntel.classList.remove("is-disabled");
        macDownloadIntel.href = macIntel.url;
        macDownloadIntel.textContent = macIntelLabel;
      } else {
        macDownloadIntel.hidden = true;
        macDownloadIntel.removeAttribute("href");
        macDownloadIntel.classList.add("is-disabled");
      }
    }
  } else {
    setDisabled(downloadButtons.mac, "MacOS build unavailable");
    if (macDownloadContinue) {
      macDownloadContinue.removeAttribute("href");
      macDownloadContinue.classList.add("is-disabled");
      macDownloadContinue.textContent = "MacOS build unavailable";
    }
    if (macDownloadIntel) {
      macDownloadIntel.hidden = true;
      macDownloadIntel.removeAttribute("href");
      macDownloadIntel.classList.add("is-disabled");
    }
    if (macDownloadArchCopy) {
      macDownloadArchCopy.hidden = true;
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

  const macAssets = release.assets.filter((asset) => asset.name.endsWith(".dmg"));
  const macAppleSiliconAsset = macAssets.find((asset) => /(aarch64|arm64)/i.test(asset.name));
  const macIntelAsset = macAssets.find((asset) => /(x86_64|x64|intel)/i.test(asset.name));
  const genericMacAsset = macAssets.find(
    (asset) => !/(aarch64|arm64|x86_64|x64|intel)/i.test(asset.name),
  );
  const macAsset = macAppleSiliconAsset ?? macIntelAsset ?? genericMacAsset ?? null;
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
    macAppleSilicon: macAppleSiliconAsset
      ? {
          url: macAppleSiliconAsset.browser_download_url,
        }
      : genericMacAsset
        ? {
            url: genericMacAsset.browser_download_url,
          }
        : null,
    macIntel: macIntelAsset
      ? {
          url: macIntelAsset.browser_download_url,
        }
      : null,
    windows: windowsAsset
      ? {
          url: windowsAsset.browser_download_url,
        }
      : null,
  };
}

function compareVersions(left, right) {
  const leftParts = String(left ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right ?? "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function choosePreferredRelease(manifest, latestRelease) {
  if (manifest && latestRelease) {
    return compareVersions(latestRelease.version, manifest.version) > 0 ? latestRelease : manifest;
  }

  return latestRelease ?? manifest ?? null;
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
  let manifest = null;
  let latestRelease = null;

  try {
    manifest = await fetchManifest();
  } catch {
    // fall through to GitHub API
  }

  try {
    latestRelease = await fetchLatestFromGitHub();
  } catch {
    // fall back to manifest if available
  }

  const preferredRelease = choosePreferredRelease(
    manifest?.version && (manifest.mac?.url || manifest.windows?.url) ? manifest : null,
    latestRelease,
  );

  if (preferredRelease) {
    applyRelease(preferredRelease);
    return;
  }

  {
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

  if (typeof macDownloadModal?.showModal === "function") {
    if (!macDownloadModal.open) {
      macDownloadModal.showModal();
    }
    return;
  }

  window.location.href = downloadButtons.mac.href;
}

function updateCarousel(stepIndex) {
  if (!carouselImage || demoSteps.length === 0) {
    return;
  }

  currentDemoStepIndex = (stepIndex + demoSteps.length) % demoSteps.length;
  const step = demoSteps[currentDemoStepIndex];

  carouselImage.src = step.src;
  carouselImage.alt = step.alt;

  if (carouselPrevButton) {
    const isFirstStep = currentDemoStepIndex === 0;
    carouselPrevButton.hidden = isFirstStep;
    carouselPrevButton.style.display = isFirstStep ? "none" : "inline-flex";
  }

  if (carouselNextButton) {
    const isLastStep = currentDemoStepIndex === demoSteps.length - 1;
    carouselNextButton.hidden = isLastStep;
    carouselNextButton.style.display = isLastStep ? "none" : "inline-flex";
  }
}

function moveCarousel(direction) {
  updateCarousel(currentDemoStepIndex + direction);
}

function handleCarouselPrevClick(event) {
  event.preventDefault();
  event.stopPropagation();
  moveCarousel(-1);
}

function handleCarouselNextClick(event) {
  event.preventDefault();
  event.stopPropagation();
  moveCarousel(1);
}

function handleImageModalKeydown(event) {
  if (!imageModal?.open) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveCarousel(-1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveCarousel(1);
  }
}

function openImageModal() {
  updateCarousel(0);

  if (typeof imageModal?.showModal === "function") {
    if (!imageModal.open) {
      imageModal.showModal();
    }
  }
}

async function handleCopyCommand() {
  if (!copyCommandBlock || !copyCommandButton) {
    return;
  }

  const command = copyCommandBlock.textContent?.trim();
  if (!command) {
    return;
  }

  try {
    await copyText(command);
    copyCommandButton.textContent = "Copied";
  } catch {
    copyCommandButton.textContent = "Copy failed";
  }

  window.setTimeout(() => {
    copyCommandButton.textContent = copyCommandDefaultLabel;
  }, 1600);
}

downloadButtons.mac?.addEventListener("click", openMacDownloadModal);
screenshotOpenButton?.addEventListener("click", openImageModal);
carouselPrevButton?.addEventListener("click", handleCarouselPrevClick);
carouselNextButton?.addEventListener("click", handleCarouselNextClick);
imageModal?.addEventListener("keydown", handleImageModalKeydown);
copyCommandButton?.addEventListener("click", handleCopyCommand);

void loadReleaseDetails();
