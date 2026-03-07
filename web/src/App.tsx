import { type DragEvent, useEffect, useMemo, useState } from "react";

import {
  getPresetNames,
  insertPresetIntoSetlistDraft,
  movePresetWithinSetlistDraft,
  PRESET_SLOT_COUNT,
  removePresetFromSetlistDraft,
} from "../../src/domain/index.js";
import { deleteSetlist, fetchPresets, fetchSetlists, loadPreset, loadSetlist, saveSetlist } from "./api";
import type { LibraryEntry, SetlistDraft } from "./types";

const DEFAULT_HOME_DIR = "/Users/john/Documents/Line 6/Tones/Helix";
const LOCAL_STORAGE_HOME_KEY = "helix-setlist-home-dir";
const NEW_SETLIST_TEMPLATE_PATH = "Blank Setlist.hls";
const NEW_SETLIST_DEFAULT_NAME = "New Setlist";

type PendingAction =
  | { kind: "switch-setlist"; relativePath: string }
  | { kind: "new-draft" }
  | null;

type SaveAsReason = "manual" | "switch";
type DragSource =
  | { kind: "library-preset"; relativePath: string }
  | { kind: "setlist-row"; index: number }
  | null;

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

  return draft.sourcePath?.replace(/\.hls$/i, "") ?? "Untitled Setlist";
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

async function saveDraft(args: {
  homeDir: string;
  relativePath: string;
  draft: SetlistDraft;
  overwrite: boolean;
}): Promise<void> {
  await saveSetlist({
    homeDir: args.homeDir,
    relativePath: args.relativePath,
    draft: args.draft,
    overwrite: args.overwrite,
  });
}

export function App() {
  const [homeDir, setHomeDir] = useState(() => localStorage.getItem(LOCAL_STORAGE_HOME_KEY) ?? DEFAULT_HOME_DIR);
  const [setlists, setSetlists] = useState<LibraryEntry[]>([]);
  const [presets, setPresets] = useState<LibraryEntry[]>([]);
  const [presetFilter, setPresetFilter] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [draft, setDraft] = useState<SetlistDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsReason, setSaveAsReason] = useState<SaveAsReason>("manual");
  const [saveAsInput, setSaveAsInput] = useState("");
  const [dragSource, setDragSource] = useState<DragSource>(null);
  const [activeDropIndex, setActiveDropIndex] = useState<number | null>(null);

  const filteredPresets = useMemo(() => {
    const query = presetFilter.trim().toLowerCase();

    if (!query) {
      return presets;
    }

    return presets.filter((preset) => preset.name.toLowerCase().includes(query));
  }, [presetFilter, presets]);

  const slotLabels = useMemo(() => createSlotLabels(), []);
  const presetNames = useMemo(() => getPresetNames(draft), [draft]);
  const title = `${getSetlistName(draft)}${dirty ? " *" : ""}`;
  const unsavedPromptText =
    pendingAction?.kind === "new-draft"
      ? "Save, save as a copy, or discard edits before creating a new setlist draft."
      : "Save, save as a copy, or discard edits before loading another setlist.";

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_HOME_KEY, homeDir);
  }, [homeDir]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    void refreshLibrary(true);
  }, []);

  async function refreshLibrary(autoSelectFirst: boolean): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [nextSetlists, nextPresets] = await Promise.all([fetchSetlists(homeDir), fetchPresets(homeDir)]);

      setSetlists(nextSetlists);
      setPresets(nextPresets);

      if (!activePath && autoSelectFirst && nextSetlists[0]) {
        await loadIntoEditor(nextSetlists[0].relativePath);
      } else if (activePath && !nextSetlists.some((entry) => entry.relativePath === activePath)) {
        setActivePath(null);
        setDraft(null);
        setDirty(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load Helix library.");
    } finally {
      setLoading(false);
    }
  }

  async function loadIntoEditor(relativePath: string): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await loadSetlist(homeDir, relativePath);
      setDraft(cloneDraft(response.draft));
      setActivePath(relativePath);
      setDirty(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load the selected setlist.");
    } finally {
      setLoading(false);
    }
  }

  async function createNewDraftFromTemplate(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await loadSetlist(homeDir, NEW_SETLIST_TEMPLATE_PATH);
      const nextDraft = setSetlistName(cloneDraft(response.draft), NEW_SETLIST_DEFAULT_NAME);

      nextDraft.sourcePath = undefined;

      setDraft(nextDraft);
      setActivePath(null);
      setDirty(true);
      setPendingAction(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Failed to create a new setlist from ${NEW_SETLIST_TEMPLATE_PATH}.`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSetlist(relativePath: string): Promise<void> {
    const deletingActive = relativePath === activePath;
    const deletingDirtyActive = deletingActive && dirty;
    const confirmationMessage = deletingDirtyActive
      ? `Delete ${relativePath} from disk? This will also discard the current unsaved edits in the editor.`
      : `Delete ${relativePath} from disk?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    console.info("[helix-ui] delete requested", {
      homeDir,
      relativePath,
      deletingActive,
      dirty,
    });

    try {
      await deleteSetlist(homeDir, relativePath);
      const nextSetlists = await fetchSetlists(homeDir);

      setSetlists(nextSetlists);

      if (deletingActive) {
        setActivePath(null);
        setDraft(null);
        setDirty(false);

        if (nextSetlists[0]) {
          await loadIntoEditor(nextSetlists[0].relativePath);
        }
      }
    } catch (error) {
      console.error("[helix-ui] delete failed", {
        homeDir,
        relativePath,
        error,
      });
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete setlist.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSetlist(relativePath: string): void {
    if (relativePath === activePath) {
      return;
    }

    if (dirty) {
      setPendingAction({ kind: "switch-setlist", relativePath });
      setShowUnsavedModal(true);
      return;
    }

    void loadIntoEditor(relativePath);
  }

  function handleNameChange(name: string): void {
    if (!draft) {
      return;
    }

    setDraft(setSetlistName(draft, name));
    setDirty(true);
  }

  function handlePresetDragStart(relativePath: string): void {
    setDragSource({ kind: "library-preset", relativePath });
  }

  function handleSetlistRowDragStart(index: number): void {
    setDragSource({ kind: "setlist-row", index });
  }

  function handleDragEnd(): void {
    setDragSource(null);
    setActiveDropIndex(null);
  }

  function handleInsertDragOver(event: DragEvent<HTMLDivElement>, insertIndex: number): void {
    if (!draft || !dragSource) {
      return;
    }

    event.preventDefault();
    setActiveDropIndex(insertIndex);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>, insertIndex: number): Promise<void> {
    event.preventDefault();

    if (!draft || !dragSource) {
      setActiveDropIndex(null);
      return;
    }

    try {
      setErrorMessage(null);

      if (dragSource.kind === "library-preset") {
        const effectiveInsertIndex = Math.min(insertIndex, PRESET_SLOT_COUNT - 1);
        const lastPresetName = presetNames[PRESET_SLOT_COUNT - 1]?.trim();

        if (lastPresetName) {
          const confirmed = window.confirm(
            `Inserting here will drop slot 32D (${lastPresetName}). Continue?`,
          );

          if (!confirmed) {
            return;
          }
        }

        setLoading(true);
        const loadedPreset = await loadPreset(homeDir, dragSource.relativePath);
        const { nextDraft, droppedPresetName, truncatedExistingPreset } = insertPresetIntoSetlistDraft(
          draft,
          {
            relativePath: loadedPreset.file.relativePath,
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
        return;
      }

      if (dragSource.index === insertIndex || dragSource.index + 1 === insertIndex) {
        return;
      }

      const nextDraft = movePresetWithinSetlistDraft(draft, dragSource.index, insertIndex);

      setDraft(nextDraft as SetlistDraft);
      setDirty(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update the setlist.");
    } finally {
      setLoading(false);
      setActiveDropIndex(null);
      setDragSource(null);
    }
  }

  function handleRemovePreset(index: number): void {
    if (!draft) {
      return;
    }

    const nextDraft = removePresetFromSetlistDraft(draft, index);

    setDraft(nextDraft as SetlistDraft);
    setDirty(true);
    setErrorMessage(null);
  }

  async function handleSave(): Promise<boolean> {
    if (!draft || !activePath) {
      return false;
    }

    if (!window.confirm(`Overwrite ${activePath}?`)) {
      return false;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await saveDraft({
        homeDir,
        relativePath: activePath,
        draft,
        overwrite: true,
      });
      setDirty(false);
      await refreshLibrary(false);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save the active setlist.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function beginSaveAs(reason: SaveAsReason): void {
    const baseName = activePath?.replace(/\.hls$/i, "") || getSetlistName(draft).trim() || "Untitled Setlist";

    setSaveAsReason(reason);
    setSaveAsInput(`${baseName} Copy.hls`);
    if (reason === "switch") {
      setShowUnsavedModal(false);
    }
    setShowSaveAsModal(true);
  }

  async function handleSaveAsConfirm(): Promise<void> {
    if (!draft) {
      return;
    }

    const trimmed = saveAsInput.trim();

    if (!trimmed) {
      setErrorMessage("Save as copy requires a file name.");
      return;
    }

    const relativePath = trimmed.toLowerCase().endsWith(".hls") ? trimmed : `${trimmed}.hls`;

    setSaving(true);
    setErrorMessage(null);

    try {
      await saveDraft({
        homeDir,
        relativePath,
        draft,
        overwrite: false,
      });

      setShowSaveAsModal(false);
      setActivePath(relativePath);
      setDraft({
        ...cloneDraft(draft),
        sourcePath: relativePath,
      });
      setDirty(false);
      await refreshLibrary(false);

      if (saveAsReason === "switch") {
        await continuePendingActionAfterSave();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save a copy.";

      if (message.includes("Refusing to overwrite existing file")) {
        if (!window.confirm(`${relativePath} already exists. Replace it?`)) {
          setSaving(false);
          if (saveAsReason === "switch") {
            setShowUnsavedModal(true);
          }
          return;
        }

        try {
          await saveDraft({
            homeDir,
            relativePath,
            draft,
            overwrite: true,
          });

          setShowSaveAsModal(false);
          setActivePath(relativePath);
          setDraft({
            ...cloneDraft(draft),
            sourcePath: relativePath,
          });
          setDirty(false);
          await refreshLibrary(false);

          if (saveAsReason === "switch") {
            await continuePendingActionAfterSave();
          }
        } catch (overwriteError) {
          setErrorMessage(overwriteError instanceof Error ? overwriteError.message : "Failed to replace setlist copy.");
        }
      } else {
        setErrorMessage(message);
      }
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
      await loadIntoEditor(action.relativePath);
      return;
    }

    await createNewDraftFromTemplate();
  }

  function handleDiscardAndContinue(): void {
    const action = pendingAction;
    setPendingAction(null);
    setShowUnsavedModal(false);

    if (!action) {
      return;
    }

    if (action.kind === "switch-setlist") {
      void loadIntoEditor(action.relativePath);
      return;
    }

    void createNewDraftFromTemplate();
  }

  function handleNew(): void {
    if (dirty) {
      setPendingAction({ kind: "new-draft" });
      setShowUnsavedModal(true);
      return;
    }

    void createNewDraftFromTemplate();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="panel">
          <label className="field-label" htmlFor="home-dir">
            Home Directory
          </label>
          <div className="home-dir-row">
            <input
              id="home-dir"
              className="text-input"
              value={homeDir}
              onChange={(event) => setHomeDir(event.target.value)}
              placeholder="/Users/john/Documents/Line 6/Tones/Helix"
            />
            <button className="ghost-button" onClick={() => void refreshLibrary(true)} disabled={loading}>
              Load
            </button>
          </div>
        </div>

        <section className="panel list-panel setlists-panel">
          <div className="panel-header">
            <h2>Setlists</h2>
            <span>{setlists.length}</span>
          </div>
          <div className="scroll-region">
            {setlists.map((entry) => (
              <div key={entry.relativePath} className={`list-row ${entry.relativePath === activePath ? "active" : ""}`}>
                <button className="list-select" onClick={() => handleSelectSetlist(entry.relativePath)}>
                  <span>{entry.name}</span>
                  {dirty && entry.relativePath === activePath ? <strong>*</strong> : null}
                </button>
                <button
                  className="delete-button"
                  type="button"
                  aria-label={`Delete ${entry.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteSetlist(entry.relativePath);
                  }}
                >
                  x
                </button>
              </div>
            ))}
            {!setlists.length ? <p className="empty-state">No setlists found in /Setlists.</p> : null}
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Presets</h2>
            <span>{filteredPresets.length}</span>
          </div>
          <input
            className="text-input filter-input"
            value={presetFilter}
            onChange={(event) => setPresetFilter(event.target.value)}
            placeholder="Filter presets"
          />
          <div className="scroll-region">
            {filteredPresets.map((entry) => (
              <div
                key={entry.relativePath}
                className={`preset-row ${dragSource?.kind === "library-preset" && dragSource.relativePath === entry.relativePath ? "dragging" : ""}`}
                draggable
                onDragStart={() => handlePresetDragStart(entry.relativePath)}
                onDragEnd={handleDragEnd}
              >
                <span>{entry.name}</span>
              </div>
            ))}
            {!filteredPresets.length ? <p className="empty-state">No presets match the current filter.</p> : null}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Local library shell</p>
            <h1>Helix Setlist Editor</h1>
          </div>
          <div className="action-row">
            <button className="ghost-button" onClick={handleNew} disabled={saving}>
              New
            </button>
            <button className="ghost-button" onClick={() => void handleSave()} disabled={!draft || !activePath || saving}>
              Save
            </button>
            <button className="ghost-button" onClick={() => beginSaveAs("manual")} disabled={!draft || saving}>
              Save as Copy
            </button>
          </div>
        </header>

        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <section className="editor-panel">
          <div className="title-row">
            <input
              className="title-input"
              value={getSetlistName(draft)}
              onChange={(event) => handleNameChange(event.target.value)}
              disabled={!draft}
              placeholder="Setlist name"
            />
            <span className="dirty-indicator">{dirty ? "*" : ""}</span>
          </div>

          <div className="status-row">
            <span>{activePath ?? "No file selected"}</span>
            <span>{loading ? "Loading..." : `${presetNames.filter(Boolean).length} named presets`}</span>
          </div>

          <div className="setlist-grid">
            {presetNames.map((name, index) => (
              <div key={slotLabels[index]} className="setlist-slot">
                <div
                  className={`drop-gap ${activeDropIndex === index ? "active" : ""} ${dragSource ? "visible" : ""}`}
                  onDragOver={(event) => handleInsertDragOver(event, index)}
                  onDrop={(event) => void handleDrop(event, index)}
                >
                  <span>Insert here</span>
                </div>
                <div
                  className={`setlist-row ${dragSource?.kind === "setlist-row" && dragSource.index === index ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => handleSetlistRowDragStart(index)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="slot-label">{slotLabels[index]}</span>
                  <span className={`preset-name ${name ? "" : "blank"}`}>{name || "<empty>"}</span>
                  <button
                    className="remove-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemovePreset(index);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    type="button"
                    draggable={false}
                    aria-label={`Remove preset from ${slotLabels[index]}`}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
            <div
              className={`drop-gap final-gap ${activeDropIndex === PRESET_SLOT_COUNT ? "active" : ""} ${dragSource ? "visible" : ""}`}
              onDragOver={(event) => handleInsertDragOver(event, PRESET_SLOT_COUNT)}
              onDrop={(event) => void handleDrop(event, PRESET_SLOT_COUNT)}
            >
              <span>Insert here</span>
            </div>
          </div>
        </section>
      </main>

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
              <button className="ghost-button" onClick={() => beginSaveAs("switch")}>
                Save as Copy
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

      {showSaveAsModal ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Save setlist copy</h3>
            <p>Choose a file name for the copied setlist.</p>
            <input
              className="text-input"
              value={saveAsInput}
              onChange={(event) => setSaveAsInput(event.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="solid-button" onClick={() => void handleSaveAsConfirm()}>
                Save copy
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  setShowSaveAsModal(false);
                  if (saveAsReason === "switch") {
                    setShowUnsavedModal(true);
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
