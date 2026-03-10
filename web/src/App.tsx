import React, { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { driver, type Driver as DriverJs } from "driver.js";

import {
  getPresetNames,
  insertPresetIntoSetlistDraft,
  movePresetWithinSetlistDraft,
  PRESET_SLOT_COUNT,
  replacePresetInSetlistDraft,
  removePresetFromSetlistDraft,
  sortSetlistDraftAlphabetically,
} from "../../src/domain/index.js";
import {
  deleteSetlist,
  getRuntimeInfo,
  listPresets,
  listSetlists,
  loadAppSettings,
  loadBlankTemplate,
  loadPreset,
  loadSetlist,
  pickPresetDirectory,
  pickSetlistDirectory,
  resetAppSettings,
  saveAppSettings,
  saveSetlist,
  saveSetlistAs,
} from "./api";
import type { AppSettings, LibraryEntry, RuntimeInfo, SetlistDraft } from "./types";
import { checkForAppUpdate, installAppUpdate, type AvailableAppUpdate } from "./updater";

type PendingAction =
  | { kind: "switch-setlist"; absolutePath: string }
  | { kind: "new-draft" }
  | null;
type PendingReplace = {
  slotIndex: number;
  existingPresetName: string;
  incomingPresetName: string;
  preset: {
    absolutePath: string;
    name: string;
    slotData: Record<string, unknown>;
  };
} | null;
type PendingDeleteSetlist = LibraryEntry | null;

type DragSource =
  | { kind: "library-preset"; absolutePath: string }
  | { kind: "setlist-row"; index: number }
  | null;
type DropTarget = { kind: "insert" | "replace"; index: number } | null;
type DragPointerState = {
  x: number;
  y: number;
  label: string;
} | null;
type RecentDropHighlight = {
  index: number;
  nonce: number;
} | null;

const INTRO_GUIDE_STEP_COUNT = 6;

function createSlotLabels(): string[] {
  const labels = ["A", "B", "C", "D"];
  const result: string[] = [];

  for (let bank = 1; bank <= 32; bank += 1) {
    for (const label of labels) {
      result.push(`${bank}${label}`);
    }
  }

  return result;
}

function cloneDraft(draft: SetlistDraft): SetlistDraft {
  return structuredClone(draft);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getFileName(absolutePath: string | null | undefined): string | null {
  if (!absolutePath) {
    return null;
  }

  return absolutePath.split(/[\\/]/).pop() ?? absolutePath;
}

function getDirectoryName(absolutePath: string): string | null {
  const normalized = absolutePath.replace(/[\\/]+$/, "");
  const lastSeparator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));

  if (lastSeparator <= 0) {
    return null;
  }

  return normalized.slice(0, lastSeparator);
}

function stripExtension(fileName: string | null | undefined): string {
  return (fileName ?? "Untitled Setlist").replace(/\.[^.]+$/, "");
}

function sanitizeFileNameSegment(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");
  return normalized;
}

function buildSuggestedSetlistFileName(draft: SetlistDraft | null, activePath: string | null): string {
  const explicitFileName = getFileName(activePath);

  if (explicitFileName) {
    return explicitFileName.toLowerCase().endsWith(".hls") ? explicitFileName : `${explicitFileName}.hls`;
  }

  const setlistName = sanitizeFileNameSegment(getSetlistName(draft));
  return setlistName.toLowerCase().endsWith(".hls") ? setlistName : `${setlistName}.hls`;
}

function getSetlistName(draft: SetlistDraft | null): string {
  if (!draft) {
    return "No Setlist Loaded";
  }

  const innerMeta = asRecord(asRecord(draft.innerJson).meta);

  if (typeof innerMeta.name === "string" && innerMeta.name.trim()) {
    return innerMeta.name;
  }

  const outerMeta = asRecord(draft.outerTemplate.meta);

  if (typeof outerMeta.name === "string" && outerMeta.name.trim()) {
    return outerMeta.name;
  }

  return stripExtension(getFileName(draft.sourcePath));
}

function getEditableSetlistName(draft: SetlistDraft | null): string {
  if (!draft) {
    return "";
  }

  const innerMeta = asRecord(asRecord(draft.innerJson).meta);

  if (typeof innerMeta.name === "string") {
    return innerMeta.name;
  }

  const outerMeta = asRecord(draft.outerTemplate.meta);

  if (typeof outerMeta.name === "string") {
    return outerMeta.name;
  }

  return stripExtension(getFileName(draft.sourcePath));
}

function hasValidSetlistName(draft: SetlistDraft | null): boolean {
  return getEditableSetlistName(draft).trim().length > 0;
}

function hasValidSetlistNameValue(name: string): boolean {
  return name.trim().length > 0;
}

function setSetlistName(draft: SetlistDraft, name: string): SetlistDraft {
  const nextDraft = cloneDraft(draft);
  const innerJson = asRecord(nextDraft.innerJson);
  const innerMeta = asRecord(innerJson.meta);
  const outerMeta = asRecord(nextDraft.outerTemplate.meta);

  innerMeta.name = name;
  outerMeta.name = name;
  innerJson.meta = innerMeta;
  nextDraft.innerJson = innerJson;
  nextDraft.outerTemplate.meta = outerMeta;

  return nextDraft;
}

function FolderOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.05c.5 0 .97.21 1.29.59l1.32 1.57c.1.12.25.19.41.19H18A2.25 2.25 0 0 1 20.25 9v7.5A2.25 2.25 0 0 1 18 18.75H6A2.25 2.25 0 0 1 3.75 16.5v-9.75Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M8.25 12.75 10.5 15l5.25-5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SortAlphaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 5v14m0 0-3-3m3 3 3-3M13 7h6M13 12h4M13 17h2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function App() {
  const [setlistDirectory, setSetlistDirectory] = useState<string | null>(null);
  const [presetDirectory, setPresetDirectory] = useState<string | null>(null);
  const [includeSetlistSubdirectories, setIncludeSetlistSubdirectories] = useState(false);
  const [includePresetSubdirectories, setIncludePresetSubdirectories] = useState(false);
  const [setlists, setSetlists] = useState<LibraryEntry[]>([]);
  const [presets, setPresets] = useState<LibraryEntry[]>([]);
  const [presetFilter, setPresetFilter] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [draft, setDraft] = useState<SetlistDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hideWelcomeMessage, setHideWelcomeMessage] = useState(false);
  const [guideActive, setGuideActive] = useState(false);
  const [guidePending, setGuidePending] = useState(false);
  const [guideOptOut, setGuideOptOut] = useState(false);
  const [nameValidationError, setNameValidationError] = useState(false);
  const [setlistNameInput, setSetlistNameInput] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace>(null);
  const [pendingDeleteSetlist, setPendingDeleteSetlist] = useState<PendingDeleteSetlist>(null);
  const [showSortConfirm, setShowSortConfirm] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableAppUpdate | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<DropTarget>(null);
  const [dragPointer, setDragPointer] = useState<DragPointerState>(null);
  const [recentDropHighlight, setRecentDropHighlight] = useState<RecentDropHighlight>(null);
  const setlistNameInputRef = useRef<HTMLInputElement>(null);
  const introGuideRef = useRef<DriverJs | null>(null);
  const guideOptOutRef = useRef(false);

  const filteredPresets = useMemo(() => {
    const query = presetFilter.trim().toLowerCase();

    if (!query) {
      return presets;
    }

    return presets.filter((preset) => preset.name.toLowerCase().includes(query));
  }, [presetFilter, presets]);

  const slotLabels = useMemo(() => createSlotLabels(), []);
  const presetNames = useMemo(() => getPresetNames(draft), [draft]);
  const title = `${getSetlistName(draft) || "Untitled Setlist"}${dirty ? " *" : ""}`;
  const unsavedPromptText =
    pendingAction?.kind === "new-draft"
      ? "Save, save as a copy, or discard edits before creating a new setlist draft."
      : "Save, save as a copy, or discard edits before loading another setlist.";
  const fullPathLabel = activePath ?? "Unsaved setlist. Click Save to choose a file location.";
  const canDeleteSetlists = runtimeInfo?.canMoveFileToTrash ?? false;

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [settings, nextRuntimeInfo] = await Promise.all([loadAppSettings(), getRuntimeInfo()]);

        if (cancelled) {
          return;
        }

        setRuntimeInfo(nextRuntimeInfo);
        setSetlistDirectory(settings.setlistDirectory ?? null);
        setPresetDirectory(settings.presetDirectory ?? null);
        setIncludeSetlistSubdirectories(settings.includeSetlistSubdirectories ?? false);
        setIncludePresetSubdirectories(settings.includePresetSubdirectories ?? false);
        setHideWelcomeMessage(settings.hideWelcomeMessage ?? false);
        setGuideOptOut(settings.hideWelcomeMessage ?? false);
        guideOptOutRef.current = settings.hideWelcomeMessage ?? false;
        setGuidePending(!settings.hideWelcomeMessage);
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextUpdate = await checkForAppUpdate();

      if (!cancelled && nextUpdate) {
        setAvailableUpdate(nextUpdate);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    void saveAppSettings({
      setlistDirectory: setlistDirectory ?? undefined,
      presetDirectory: presetDirectory ?? undefined,
      includeSetlistSubdirectories,
      includePresetSubdirectories,
      hideWelcomeMessage,
    } satisfies AppSettings);
  }, [
    hideWelcomeMessage,
    includePresetSubdirectories,
    includeSetlistSubdirectories,
    presetDirectory,
    setlistDirectory,
    settingsLoaded,
  ]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    void refreshSetlists(setlistDirectory, includeSetlistSubdirectories);
  }, [includeSetlistSubdirectories, setlistDirectory, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    void refreshPresets(presetDirectory, includePresetSubdirectories);
  }, [includePresetSubdirectories, presetDirectory, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded || draft || activePath) {
      return;
    }

    void createNewDraftFromTemplate(false);
  }, [activePath, draft, settingsLoaded]);

  useEffect(() => {
    guideOptOutRef.current = guideOptOut;
  }, [guideOptOut]);

  useEffect(() => {
    if (
      !settingsLoaded ||
      !draft ||
      loading ||
      !guidePending ||
      introGuideRef.current
    ) {
      return;
    }

    const guide = driver({
      allowClose: false,
      allowKeyboardControl: false,
      disableActiveInteraction: true,
      popoverClass: "helix-guide-popover",
      showButtons: ["previous", "next"],
      prevBtnText: "← Previous",
      nextBtnText: "Next →",
      doneBtnText: "Done",
      steps: [
        {
          popover: {
            title: "Welcome",
            description:
              "Welcome to Helix Setlist Editor - your offline editor for creating and managing Helix Setlists! Before we begin, let's have a quick look around...",
            side: "over",
            align: "center",
          },
        },
        {
          element: "[data-tour='setlists-panel']",
          popover: {
            title: "Setlists",
            description:
              "Select the directory where your setlists are stored on your local hard drive. You can view and delete setlists from here. Include subdirectories if your setlist are stored in a nested directory structure.",
          },
        },
        {
          element: "[data-tour='presets-panel']",
          popover: {
            title: "Presets",
            description:
              "Select the directory where your presets are stored on your local hard drive. Include subdirectories if your presets are stored in a nested directory structure. Filter your presets using the search.",
          },
        },
        {
          element: "[data-tour='setlist-editor']",
          popover: {
            title: "Editor",
            description:
              "Setlists are displayed here. Drag presets from your preset list into the position you want and rearrange as you need, or quickly sort it alphabetically. Don't forget to give your setlist a good name!",
          },
        },
        {
          element: "[data-tour='action-row']",
          popover: {
            title: "Actions",
            description:
              "Create a new setlist, save changes or reset changes you've made to your setlist!",
          },
        },
        {
          popover: {
            title: "Ready to start",
            description: "That's it - happy editing!",
            side: "over",
            align: "center",
          },
        },
      ],
      onPopoverRender: (popover, opts) => {
        const existingOptOut = popover.wrapper.querySelector(".guide-optout");
        if (existingOptOut) {
          existingOptOut.remove();
        }

        if (opts.state.activeIndex !== INTRO_GUIDE_STEP_COUNT - 1) {
          return;
        }

        const label = document.createElement("label");
        label.className = "subdir-toggle modal-checkbox guide-optout";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = guideOptOutRef.current;
        checkbox.addEventListener("change", () => {
          guideOptOutRef.current = checkbox.checked;
          setGuideOptOut(checkbox.checked);
        });

        const text = document.createElement("span");
        text.textContent = "Do not show this guide again";

        label.appendChild(checkbox);
        label.appendChild(text);
        popover.description.insertAdjacentElement("afterend", label);
      },
      onDestroyed: () => {
        introGuideRef.current = null;
        setGuidePending(false);
        setGuideActive(false);
        if (guideOptOutRef.current) {
          setHideWelcomeMessage(true);
        }
      },
    });

    introGuideRef.current = guide;
    setGuideActive(true);

    const startTimer = window.setTimeout(() => {
      guide.drive();
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      if (introGuideRef.current === guide) {
        guide.destroy();
        introGuideRef.current = null;
      }
    };
  }, [draft, guidePending, loading, settingsLoaded]);

  useEffect(() => {
    let mounted = true;

    async function handleShowGuideAgain(): Promise<void> {
      guideOptOutRef.current = false;
      if (!mounted) {
        return;
      }
      setGuideOptOut(false);
      setGuidePending(true);
    }

    async function handleResetAppState(): Promise<void> {
      const confirmed = window.confirm(
        "Reset app state? This will clear selected directories, reopen a blank setlist, and show the intro guide again.",
      );

      if (!confirmed || !mounted) {
        return;
      }

      setErrorMessage(null);
      setPresetFilter("");
      setPendingAction(null);
      setShowUnsavedModal(false);
      setPendingReplace(null);
      setPendingDeleteSetlist(null);
      setShowSortConfirm(false);
      setSetlists([]);
      setPresets([]);
      setSetlistDirectory(null);
      setPresetDirectory(null);
      setIncludeSetlistSubdirectories(false);
      setIncludePresetSubdirectories(false);
      setActivePath(null);
      setDirty(false);
      setHideWelcomeMessage(false);
      setGuideOptOut(false);
      guideOptOutRef.current = false;
      setGuidePending(true);
      await resetAppSettings();
      await createNewDraftFromTemplate(false);
    }

    const unlistenPromises = [
      listen("app://show-intro-guide", () => {
        void handleShowGuideAgain();
      }),
      listen("app://reset-app-state", () => {
        void handleResetAppState();
      }),
    ];

    return () => {
      mounted = false;
      for (const unlistenPromise of unlistenPromises) {
        void unlistenPromise.then((unlisten) => unlisten());
      }
    };
  }, []);

  async function refreshSetlists(directory: string | null, includeSubdirectories: boolean): Promise<void> {
    if (!directory) {
      setSetlists([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const nextSetlists = await listSetlists(directory, includeSubdirectories);

      setSetlists(nextSetlists);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load setlists.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPresets(directory: string | null, includeSubdirectories: boolean): Promise<void> {
    if (!directory) {
      setPresets([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      setPresets(await listPresets(directory, includeSubdirectories));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load presets.");
    } finally {
      setLoading(false);
    }
  }

  async function loadIntoEditor(absolutePath: string): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await loadSetlist(absolutePath);
      setDraft(cloneDraft(response.draft));
      setSetlistNameInput(getEditableSetlistName(response.draft));
      setActivePath(absolutePath);
      setDirty(false);
      setNameValidationError(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load the selected setlist.");
    } finally {
      setLoading(false);
    }
  }

  async function createNewDraftFromTemplate(markDirty = false): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextDraft = setSetlistName(await loadBlankTemplate(), "");

      nextDraft.sourcePath = undefined;

      setDraft(nextDraft);
      setSetlistNameInput("");
      setActivePath(null);
      setDirty(markDirty);
      setPendingAction(null);
      setNameValidationError(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create a new setlist.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePickSetlistDirectory(): Promise<void> {
    const selectedDirectory = await pickSetlistDirectory();

    if (selectedDirectory) {
      setSetlistDirectory(selectedDirectory);
    }
  }

  async function handlePickPresetDirectory(): Promise<void> {
    const selectedDirectory = await pickPresetDirectory();

    if (selectedDirectory) {
      setPresetDirectory(selectedDirectory);
    }
  }

  function handleSelectSetlist(absolutePath: string): void {
    if (absolutePath === activePath) {
      return;
    }

    if (dirty) {
      setPendingAction({ kind: "switch-setlist", absolutePath });
      setShowUnsavedModal(true);
      return;
    }

    void loadIntoEditor(absolutePath);
  }

  function handleNameChange(name: string): void {
    if (!draft) {
      return;
    }

    const nextName = name.slice(0, 17);

    setDraft(setSetlistName(draft, nextName));
    setSetlistNameInput(nextName);
    setDirty(true);
    if (nextName.trim()) {
      setNameValidationError(false);
    }
  }

  function beginPointerDrag(source: DragSource, clientX: number, clientY: number, label: string): void {
    if (!source) {
      return;
    }

    setDragSource(source);
    setDragPointer({
      x: clientX,
      y: clientY,
      label,
    });
    setActiveDropTarget(null);
  }

  function handlePresetPointerDown(event: React.PointerEvent<HTMLDivElement>, absolutePath: string): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    beginPointerDrag(
      { kind: "library-preset", absolutePath },
      event.clientX,
      event.clientY,
      stripExtension(getFileName(absolutePath) ?? absolutePath),
    );
  }

  function handleSetlistRowPointerDown(event: React.PointerEvent<HTMLDivElement>, index: number): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    beginPointerDrag(
      { kind: "setlist-row", index },
      event.clientX,
      event.clientY,
      presetNames[index]?.trim() || slotLabels[index],
    );
  }

  function handleDragEnd(): void {
    setDragSource(null);
    setActiveDropTarget(null);
    setDragPointer(null);
  }

  function clearDragVisuals(): void {
    setDragSource(null);
    setActiveDropTarget(null);
    setDragPointer(null);
  }

  function flashSlot(index: number): void {
    setRecentDropHighlight(null);
    window.setTimeout(() => {
      setRecentDropHighlight({
        index,
        nonce: Date.now(),
      });
    }, 0);
  }

  function setInsertTarget(insertIndex: number): void {
    setActiveDropTarget({ kind: "insert", index: insertIndex });
  }

  function setReplaceTarget(replaceIndex: number): void {
    setActiveDropTarget({ kind: "replace", index: replaceIndex });
  }

  async function applyInsertDrop(source: Exclude<DragSource, null>, insertIndex: number): Promise<void> {
    if (!draft) {
      handleDragEnd();
      return;
    }

    try {
      setErrorMessage(null);

      if (source.kind === "library-preset") {
        const effectiveInsertIndex = Math.min(insertIndex, PRESET_SLOT_COUNT - 1);
        const lastPresetName = presetNames[PRESET_SLOT_COUNT - 1]?.trim();

        if (lastPresetName) {
          const confirmed = window.confirm(`Inserting here will drop slot 32D (${lastPresetName}). Continue?`);

          if (!confirmed) {
            return;
          }
        }

        setLoading(true);
        const loadedPreset = await loadPreset(source.absolutePath);
        const { nextDraft, droppedPresetName, truncatedExistingPreset } = insertPresetIntoSetlistDraft(
          draft,
          {
            absolutePath: loadedPreset.file.absolutePath,
            name: loadedPreset.preset.name ?? loadedPreset.file.name,
            slotData: loadedPreset.preset.slotData,
          },
          effectiveInsertIndex,
        );

        if (truncatedExistingPreset && droppedPresetName) {
          setErrorMessage(`Inserted ${loadedPreset.file.name}. Slot 32D (${droppedPresetName}) was dropped.`);
        }

        setDraft(nextDraft as SetlistDraft);
        setDirty(true);
        flashSlot(effectiveInsertIndex);
        return;
      }

      if (source.index === insertIndex || source.index + 1 === insertIndex) {
        return;
      }

      const targetIndex = source.index < insertIndex ? insertIndex - 1 : insertIndex;
      setDraft(movePresetWithinSetlistDraft(draft, source.index, insertIndex) as SetlistDraft);
      setDirty(true);
      flashSlot(Math.max(0, Math.min(targetIndex, PRESET_SLOT_COUNT - 1)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update the setlist.");
    } finally {
      setLoading(false);
      handleDragEnd();
    }
  }

  async function applyReplaceDrop(source: Extract<DragSource, { kind: "library-preset" }>, replaceIndex: number): Promise<void> {
    if (!draft) {
      handleDragEnd();
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const loadedPreset = await loadPreset(source.absolutePath);
      const existingPresetName = presetNames[replaceIndex]?.trim();
      const incomingPresetName = loadedPreset.preset.name ?? loadedPreset.file.name;

      const loadedPresetData = {
        absolutePath: loadedPreset.file.absolutePath,
        name: incomingPresetName,
        slotData: loadedPreset.preset.slotData,
      };

      if (existingPresetName) {
        setPendingReplace({
          slotIndex: replaceIndex,
          existingPresetName,
          incomingPresetName,
          preset: loadedPresetData,
        });
        return;
      }

      const nextDraft = replacePresetInSetlistDraft(
        draft,
        loadedPresetData,
        replaceIndex,
      );

      setDraft(nextDraft as SetlistDraft);
      setDirty(true);
      flashSlot(replaceIndex);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to replace the preset.");
    } finally {
      setLoading(false);
      handleDragEnd();
    }
  }

  function handleConfirmReplace(): void {
    if (!draft || !pendingReplace) {
      setPendingReplace(null);
      return;
    }

    setDraft(replacePresetInSetlistDraft(draft, pendingReplace.preset, pendingReplace.slotIndex) as SetlistDraft);
    setDirty(true);
    flashSlot(pendingReplace.slotIndex);
    setPendingReplace(null);
  }

  function handleCancelReplace(): void {
    setPendingReplace(null);
  }

  function resolveDropTarget(clientX: number, clientY: number, source: Exclude<DragSource, null>): DropTarget {
    const element = document.elementFromPoint(clientX, clientY);

    if (!(element instanceof Element)) {
      return null;
    }

    const targetElement = element.closest<HTMLElement>("[data-drop-kind]");

    if (!targetElement) {
      return null;
    }

    const kind = targetElement.dataset.dropKind;
    const index = Number.parseInt(targetElement.dataset.dropIndex ?? "", 10);

    if (!Number.isFinite(index)) {
      return null;
    }

    if (kind === "replace" && source.kind !== "library-preset") {
      return null;
    }

    if (kind === "insert" || kind === "replace") {
      return { kind, index };
    }

    return null;
  }

  useEffect(() => {
    if (!dragSource) {
      return;
    }

    const currentSource = dragSource;

    function handlePointerMove(event: PointerEvent): void {
      setDragPointer((previous) =>
        previous
          ? {
              ...previous,
              x: event.clientX,
              y: event.clientY,
            }
          : previous,
      );

      const target = resolveDropTarget(event.clientX, event.clientY, currentSource);

      if (!target) {
        setActiveDropTarget(null);
        return;
      }

      if (target.kind === "insert") {
        setInsertTarget(target.index);
        return;
      }

      setReplaceTarget(target.index);
    }

    function handlePointerUp(event: PointerEvent): void {
      const target = resolveDropTarget(event.clientX, event.clientY, currentSource);

      if (!target) {
        handleDragEnd();
        return;
      }

      clearDragVisuals();

      if (target.kind === "insert") {
        void applyInsertDrop(currentSource, target.index);
        return;
      }

      if (currentSource.kind === "library-preset") {
        void applyReplaceDrop(currentSource, target.index);
        return;
      }

      handleDragEnd();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragSource, presetNames, slotLabels, draft]);

  useEffect(() => {
    if (!recentDropHighlight) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRecentDropHighlight((current) =>
        current?.nonce === recentDropHighlight.nonce ? null : current,
      );
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [recentDropHighlight]);

  function handleRemovePreset(index: number): void {
    if (!draft) {
      return;
    }

    setDraft(removePresetFromSetlistDraft(draft, index) as SetlistDraft);
    setDirty(true);
    setErrorMessage(null);
  }

  function handleAlphabeticalSort(): void {
    if (!draft) {
      return;
    }

    setShowSortConfirm(true);
  }

  function handleConfirmAlphabeticalSort(): void {
    if (!draft) {
      setShowSortConfirm(false);
      return;
    }

    setDraft(sortSetlistDraftAlphabetically(draft) as SetlistDraft);
    setDirty(true);
    setErrorMessage(null);
    setShowSortConfirm(false);
  }

  function handleCancelAlphabeticalSort(): void {
    setShowSortConfirm(false);
  }

  function ensureValidSetlistName(): boolean {
    if (hasValidSetlistNameValue(setlistNameInput) && hasValidSetlistName(draft)) {
      return true;
    }

    setNameValidationError(true);
    setErrorMessage(null);
    setlistNameInputRef.current?.focus();
    return false;
  }

  async function handleSave(): Promise<boolean> {
    if (!draft) {
      return false;
    }

    if (!ensureValidSetlistName()) {
      return false;
    }

    if (!activePath) {
      return handleSaveAsCopy("manual");
    }

    if (!window.confirm(`Overwrite ${getFileName(activePath)}?`)) {
      return false;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await saveSetlist({
        absolutePath: activePath,
        draft,
        overwrite: true,
      });
      setDirty(false);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save the active setlist.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continuePendingActionAfterSave(): Promise<void> {
    if (!pendingAction) {
      return;
    }

    const action = pendingAction;
    setPendingAction(null);
    setShowUnsavedModal(false);

    if (action.kind === "switch-setlist") {
      await loadIntoEditor(action.absolutePath);
      return;
    }

    await createNewDraftFromTemplate(true);
  }

  function handleDiscardAndContinue(): void {
    const action = pendingAction;
    setPendingAction(null);
    setShowUnsavedModal(false);

    if (!action) {
      return;
    }

    if (action.kind === "switch-setlist") {
      void loadIntoEditor(action.absolutePath);
      return;
    }

    void createNewDraftFromTemplate(true);
  }

  function handleNew(): void {
    if (dirty) {
      setPendingAction({ kind: "new-draft" });
      setShowUnsavedModal(true);
      return;
    }

    void createNewDraftFromTemplate();
  }

  async function handleReset(): Promise<void> {
    if (!draft || !dirty) {
      return;
    }

    setErrorMessage(null);

    if (activePath) {
      await loadIntoEditor(activePath);
      return;
    }

    await createNewDraftFromTemplate(false);
  }

  function handleRequestDeleteSetlist(entry: LibraryEntry): void {
    if (!canDeleteSetlists) {
      return;
    }

    setPendingDeleteSetlist(entry);
  }

  function handleCancelDeleteSetlist(): void {
    setPendingDeleteSetlist(null);
  }

  async function handleConfirmDeleteSetlist(): Promise<void> {
    if (!pendingDeleteSetlist) {
      return;
    }

    const target = pendingDeleteSetlist;
    setPendingDeleteSetlist(null);
    setLoading(true);
    setErrorMessage(null);

    try {
      await deleteSetlist(target.absolutePath);

      if (!setlistDirectory) {
        setSetlists([]);
        if (activePath === target.absolutePath) {
          setActivePath(null);
          setDraft(null);
          setDirty(false);
        }
        return;
      }

      const nextSetlists = await listSetlists(setlistDirectory, includeSetlistSubdirectories);
      setSetlists(nextSetlists);

      if (activePath !== target.absolutePath) {
        return;
      }

      setPendingAction(null);
      setShowUnsavedModal(false);
      setPendingReplace(null);
      setShowSortConfirm(false);
      setDirty(false);

      if (nextSetlists[0]) {
        await loadIntoEditor(nextSetlists[0].absolutePath);
        return;
      }

      setActivePath(null);
      setDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to move the setlist to Trash.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAsCopy(reason: "manual" | "switch" = "manual"): Promise<boolean> {
    if (!draft) {
      return false;
    }

    if (!ensureValidSetlistName()) {
      return false;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const savedFile = await saveSetlistAs({
        draft,
        suggestedFileName: buildSuggestedSetlistFileName(draft, activePath),
        initialDirectory: setlistDirectory ?? getDirectoryName(activePath ?? "") ?? null,
      });

      if (!savedFile) {
        return false;
      }

      const nextPath = savedFile.absolutePath;
      const nextDirectory = getDirectoryName(nextPath);
      const nextDraft = {
        ...cloneDraft(draft),
        sourcePath: nextPath,
      };

      setActivePath(nextPath);
      setDraft(nextDraft);
      setDirty(false);

      if (nextDirectory && nextDirectory !== setlistDirectory) {
        setSetlistDirectory(nextDirectory);
      } else if (setlistDirectory) {
        await refreshSetlists(setlistDirectory, includeSetlistSubdirectories);
      }

      if (reason === "switch") {
        await continuePendingActionAfterSave();
      }

      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save a copy.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleDismissUpdate(): void {
    if (installingUpdate) {
      return;
    }

    setAvailableUpdate(null);
    setUpdateStatusMessage(null);
  }

  async function handleInstallUpdate(): Promise<void> {
    if (!availableUpdate) {
      return;
    }

    setInstallingUpdate(true);
    setUpdateStatusMessage("Downloading update...");
    setErrorMessage(null);

    try {
      await installAppUpdate(availableUpdate, (event) => {
        if (event.event === "Started") {
          setUpdateStatusMessage("Downloading update...");
          return;
        }

        if (event.event === "Progress") {
          setUpdateStatusMessage("Downloading update...");
          return;
        }

        setUpdateStatusMessage("Installing update...");
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to install the available update.");
      setInstallingUpdate(false);
      setUpdateStatusMessage(null);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="panel list-panel setlists-panel" data-tour="setlists-panel">
          <div className="panel-header">
            <div className="panel-header-main">
              <h2>Setlists</h2>
              <span>{setlists.length}</span>
            </div>
            <button
              className="icon-button"
              onClick={() => void handlePickSetlistDirectory()}
              disabled={loading}
              type="button"
              aria-label="Select setlist directory"
              title={setlistDirectory ?? "Select setlist directory"}
            >
              <FolderOpenIcon />
            </button>
          </div>
          <div className="panel-meta">
            <p className="panel-directory-path" title={setlistDirectory ?? "No setlist directory selected"}>
              {setlistDirectory ?? "No setlist directory selected"}
            </p>
            <label className="subdir-toggle">
              <input
                type="checkbox"
                checked={includeSetlistSubdirectories}
                onChange={(event) => setIncludeSetlistSubdirectories(event.target.checked)}
                disabled={!setlistDirectory}
              />
              <span>Include subdirectories</span>
            </label>
          </div>
          <div className="scroll-region">
            {setlists.map((entry) => (
              <div key={entry.absolutePath} className={`list-row ${entry.absolutePath === activePath ? "active" : ""}`}>
                <button className="list-select" onClick={() => handleSelectSetlist(entry.absolutePath)} type="button">
                  <span className="list-primary">
                    {entry.name}
                    {dirty && entry.absolutePath === activePath ? " *" : ""}
                  </span>
                  {includeSetlistSubdirectories && entry.relativeDirectory ? (
                    <span className="list-secondary" title={entry.relativeDirectory}>
                      {entry.relativeDirectory}
                    </span>
                  ) : null}
                </button>
                {canDeleteSetlists ? (
                  <button
                    className="remove-button"
                    type="button"
                    aria-label={`Delete setlist ${entry.name}`}
                    title={`Delete ${entry.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRequestDeleteSetlist(entry);
                    }}
                  >
                    x
                  </button>
                ) : null}
              </div>
            ))}
            {!setlistDirectory ? (
              <p className="empty-state">Select a setlist directory to browse existing setlists. This is optional if you only want to create a new setlist.</p>
            ) : null}
            {setlistDirectory && !setlists.length ? <p className="empty-state">No setlists found in the selected directory.</p> : null}
          </div>
        </section>

        <section className="panel list-panel" data-tour="presets-panel">
          <div className="panel-header">
            <div className="panel-header-main">
              <h2>Presets</h2>
              <span>{filteredPresets.length}</span>
            </div>
            <button
              className="icon-button"
              onClick={() => void handlePickPresetDirectory()}
              disabled={loading}
              type="button"
              aria-label="Select preset directory"
              title={presetDirectory ?? "Select preset directory"}
            >
              <FolderOpenIcon />
            </button>
          </div>
          <div className="panel-meta">
            <p className="panel-directory-path" title={presetDirectory ?? "No preset directory selected"}>
              {presetDirectory ?? "No preset directory selected"}
            </p>
            <label className="subdir-toggle">
              <input
                type="checkbox"
                checked={includePresetSubdirectories}
                onChange={(event) => setIncludePresetSubdirectories(event.target.checked)}
                disabled={!presetDirectory}
              />
              <span>Include subdirectories</span>
            </label>
          </div>
          <div className="filter-shell">
            <input
              className="text-input filter-input"
              value={presetFilter}
              onChange={(event) => setPresetFilter(event.target.value)}
              placeholder="Filter presets"
              disabled={!presetDirectory}
            />
            {presetFilter ? (
              <button
                className="filter-clear-button"
                type="button"
                aria-label="Clear preset filter"
                onClick={() => setPresetFilter("")}
              >
                x
              </button>
            ) : null}
          </div>
          <div className="scroll-region">
            {filteredPresets.map((entry) => (
              <div
                key={entry.absolutePath}
                className={`preset-row ${dragSource?.kind === "library-preset" && dragSource.absolutePath === entry.absolutePath ? "dragging" : ""}`}
                onPointerDown={(event) => handlePresetPointerDown(event, entry.absolutePath)}
              >
                <span className="list-primary">{entry.name}</span>
                {includePresetSubdirectories && entry.relativeDirectory ? (
                  <span className="list-secondary" title={entry.relativeDirectory}>
                    {entry.relativeDirectory}
                  </span>
                ) : null}
              </div>
            ))}
            {!presetDirectory ? <p className="empty-state">Select a preset directory to browse preset files.</p> : null}
            {presetDirectory && !filteredPresets.length ? <p className="empty-state">No presets match the current filter.</p> : null}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="hero">
          <div className="hero-copy">
            <h1>Helix Setlist Editor</h1>
          </div>
          <div className="action-row" data-tour="action-row">
            <button className="ghost-button" onClick={handleNew} disabled={saving}>
              New
            </button>
            <button className="ghost-button" onClick={() => void handleSave()} disabled={!draft || saving}>
              Save
            </button>
            <button className="ghost-button" onClick={() => void handleSaveAsCopy("manual")} disabled={!draft || !activePath || saving}>
              Save As
            </button>
            <button className="ghost-button" onClick={() => void handleReset()} disabled={!draft || !dirty || saving}>
              Reset
            </button>
          </div>
        </header>

        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <section className="editor-panel" data-tour="setlist-editor">
          <div className="title-row">
            <label className="field-label title-label" htmlFor="setlist-name-input">
              Name
            </label>
            <input
              ref={setlistNameInputRef}
              id="setlist-name-input"
              className={`title-input ${nameValidationError ? "invalid" : ""}`}
              value={setlistNameInput}
              onChange={(event) => handleNameChange(event.target.value)}
              disabled={!draft}
              placeholder="Setlist name"
              maxLength={17}
            />
            <span className="path-label" title={fullPathLabel}>
              {fullPathLabel}
            </span>
            <span className="dirty-indicator">{dirty ? "*" : ""}</span>
          </div>

          <div className="status-row">
            <span>{loading ? "Loading..." : `${presetNames.filter(Boolean).length} named presets`}</span>
            <button
              className="icon-button sort-button"
              type="button"
              aria-label="Sort setlist alphabetically"
              title="Sort setlist alphabetically"
              onClick={handleAlphabeticalSort}
              disabled={!draft || saving}
            >
              <SortAlphaIcon />
            </button>
          </div>

          <div className="setlist-grid">
            {presetNames.map((name, index) => (
              <div key={slotLabels[index]} className="setlist-slot">
                <div
                  className={`drop-gap ${activeDropTarget?.kind === "insert" && activeDropTarget.index === index ? "active" : ""} ${dragSource ? "visible" : ""}`}
                  data-testid={`insert-gap-${index}`}
                  data-drop-kind="insert"
                  data-drop-index={index}
                >
                  <span>Insert here</span>
                </div>
                <div
                  className={`setlist-row ${dragSource?.kind === "setlist-row" && dragSource.index === index ? "dragging" : ""} ${activeDropTarget?.kind === "replace" && activeDropTarget.index === index ? "replace-target" : ""} ${recentDropHighlight?.index === index ? "recent-drop" : ""}`}
                  data-testid={`slot-row-${index}`}
                  data-drop-kind="replace"
                  data-drop-index={index}
                  onPointerDown={(event) => handleSetlistRowPointerDown(event, index)}
                >
                  <span className="slot-label">{slotLabels[index]}</span>
                  <span className={`preset-name ${name ? "" : "blank"}`}>{name || "<empty>"}</span>
                  <button
                    className="remove-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemovePreset(index);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    type="button"
                    aria-label={`Remove preset from ${slotLabels[index]}`}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
            <div
              className={`drop-gap final-gap ${activeDropTarget?.kind === "insert" && activeDropTarget.index === PRESET_SLOT_COUNT ? "active" : ""} ${dragSource ? "visible" : ""}`}
              data-testid={`insert-gap-${PRESET_SLOT_COUNT}`}
              data-drop-kind="insert"
              data-drop-index={PRESET_SLOT_COUNT}
            >
              <span>Insert here</span>
            </div>
          </div>
        </section>
      </main>

      {dragPointer ? (
        <div
          className="drag-preview"
          style={{
            left: dragPointer.x +10,
            top: dragPointer.y -15,
          }}
        >
          {dragPointer.label}
        </div>
      ) : null}

      {availableUpdate && !guideActive ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Update available</h3>
            <p>{`Version ${availableUpdate.version} is available. You are running ${availableUpdate.currentVersion}.`}</p>
            {availableUpdate.body ? <p className="modal-note">{availableUpdate.body}</p> : null}
            {updateStatusMessage ? <p className="modal-note">{updateStatusMessage}</p> : null}
            <div className="modal-actions">
              <button className="solid-button" onClick={() => void handleInstallUpdate()} disabled={installingUpdate}>
                {installingUpdate ? "Installing..." : "Install update"}
              </button>
              <button className="ghost-button" onClick={handleDismissUpdate} disabled={installingUpdate}>
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUnsavedModal ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Unsaved changes</h3>
            <p>{unsavedPromptText}</p>
            <div className="modal-actions">
              <button
                className="solid-button"
                onClick={() => {
                  void handleSave().then((saved) => {
                    if (saved) {
                      void continuePendingActionAfterSave();
                    }
                  });
                }}
              >
                Save
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  void handleSaveAsCopy("switch");
                }}
                disabled={!activePath}
              >
                Save As
              </button>
              <button className="ghost-button" onClick={handleDiscardAndContinue}>
                Discard
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  setPendingAction(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingReplace ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Replace preset</h3>
            <p>
              {`Replace ${slotLabels[pendingReplace.slotIndex]} (${pendingReplace.existingPresetName}) with '${pendingReplace.incomingPresetName}'?`}
            </p>
            <div className="modal-actions">
              <button className="solid-button" onClick={handleConfirmReplace}>
                OK
              </button>
              <button className="ghost-button" onClick={handleCancelReplace}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSortConfirm ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Sort setlist</h3>
            <p>Sorting a setlist alphabetically can't be undone. Continue?</p>
            <div className="modal-actions">
              <button className="solid-button" onClick={handleConfirmAlphabeticalSort}>
                OK
              </button>
              <button className="ghost-button" onClick={handleCancelAlphabeticalSort}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteSetlist ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Delete setlist</h3>
            <p>{`Move '${pendingDeleteSetlist.name}' to the recycle bin?`}</p>
            <div className="modal-actions">
              <button className="solid-button" onClick={() => void handleConfirmDeleteSetlist()}>
                Delete
              </button>
              <button className="ghost-button" onClick={handleCancelDeleteSetlist}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
