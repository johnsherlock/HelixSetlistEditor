// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  deleteSetlist: vi.fn(),
  listPresets: vi.fn(),
  listSetlists: vi.fn(),
  loadAppSettings: vi.fn(),
  loadBlankTemplate: vi.fn(),
  loadPreset: vi.fn(),
  loadSetlist: vi.fn(),
  pickPresetDirectory: vi.fn(),
  pickSetlistDirectory: vi.fn(),
  saveAppSettings: vi.fn(),
  saveSetlist: vi.fn(),
  saveSetlistAs: vi.fn(),
}));

const updaterMocks = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
}));

vi.mock("../web/src/api", () => apiMocks);
vi.mock("../web/src/updater", () => updaterMocks);

import { App } from "../web/src/App";

function createLibraryEntry(
  name: string,
  absolutePath: string,
  relativeDirectory = "",
) {
  return {
    name,
    absolutePath,
    relativeDirectory,
    modifiedAt: "",
    size: 100,
  };
}

function createPresetSlot(name = ""): Record<string, unknown> {
  return name ? { meta: { name } } : {};
}

function createDraft(names: string[] = []) {
  const presets = Array.from({ length: 128 }, (_, index) => createPresetSlot(names[index] ?? ""));

  return {
    sourcePath: "/setlists/Example.hls",
    outerTemplate: {
      schema: "L6Setlist",
      version: 1,
      encoding: "Base64",
      meta: { name: "Example" },
    },
    innerJson: {
      meta: { name: "Example" },
      presets,
    },
  };
}

function createSetlistResponse(names: string[] = []) {
  return {
    file: {
      name: "Example",
      absolutePath: "/setlists/Example.hls",
      relativeDirectory: "",
      modifiedAt: "",
      size: 100,
    },
    draft: createDraft(names),
    validation: {
      compressionTypeMatches: true,
      crc32Matches: true,
      decompressedSizeMatches: true,
      schemaMatches: true,
    },
    summary: {
      setlistName: "Example",
      presetCount: 128,
    },
  };
}

function createPresetResponse(name: string) {
  return {
    file: {
      name,
      absolutePath: `/presets/${name}.hlx`,
      relativeDirectory: "",
      modifiedAt: "",
      size: 100,
    },
    preset: {
      schema: "L6Preset",
      version: 1,
      name,
      slotData: { meta: { name } },
      wrapperMeta: {},
    },
  };
}

function mockElementFromPoint(target: Element | null) {
  const stub = vi.fn().mockReturnValue(target);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    writable: true,
    value: stub,
  });
  return stub;
}

describe("App desktop flows", () => {
  beforeEach(() => {
    apiMocks.loadAppSettings.mockResolvedValue({});
    apiMocks.saveAppSettings.mockResolvedValue(undefined);
    apiMocks.deleteSetlist.mockResolvedValue(undefined);
    apiMocks.pickSetlistDirectory.mockResolvedValue(null);
    apiMocks.pickPresetDirectory.mockResolvedValue(null);
    apiMocks.listSetlists.mockResolvedValue([]);
    apiMocks.listPresets.mockResolvedValue([]);
    apiMocks.loadBlankTemplate.mockResolvedValue(createDraft());
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse());
    apiMocks.loadPreset.mockResolvedValue(createPresetResponse("Dragged Preset"));
    apiMocks.saveSetlist.mockResolvedValue({
      name: "Example",
      absolutePath: "/setlists/Example.hls",
      relativeDirectory: "",
      modifiedAt: "",
      size: 100,
    });
    apiMocks.saveSetlistAs.mockResolvedValue({
      name: "Example Copy",
      absolutePath: "/setlists/Example Copy.hls",
      relativeDirectory: "",
      modifiedAt: "",
      size: 100,
    });
    updaterMocks.checkForAppUpdate.mockResolvedValue(null);
    updaterMocks.installAppUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("selects setlist and preset directories from header icon buttons", async () => {
    apiMocks.pickSetlistDirectory.mockResolvedValue("/setlists");
    apiMocks.pickPresetDirectory.mockResolvedValue("/presets");
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Boulevard", "/presets/Boulevard.hlx")]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Select setlist directory" }));
    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenCalledWith("/setlists", false));
    expect(await screen.findByText("Example")).toBeTruthy();
    expect(screen.getByText("/setlists")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select preset directory" }));
    await waitFor(() => expect(apiMocks.listPresets).toHaveBeenCalledWith("/presets", false));
    expect(await screen.findByText("Boulevard")).toBeTruthy();
    expect(screen.getByText("/presets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete setlist Example" })).toBeTruthy();
  });

  it("opens the native save dialog directly for Save As", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);

    render(<App />);

    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() =>
      expect(apiMocks.saveSetlistAs).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedFileName: "Example.hls",
          initialDirectory: "/setlists",
        }),
      ),
    );
    expect(screen.queryByText("Save setlist copy")).toBeNull();
  });

  it("prompts for an app update found on launch and installs it on request", async () => {
    updaterMocks.checkForAppUpdate.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.1.1",
      body: "Bug fixes",
    });

    render(<App />);

    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(screen.getByText("Version 0.1.1 is available. You are running 0.1.0.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Install update" }));

    await waitFor(() => expect(updaterMocks.installAppUpdate).toHaveBeenCalled());
  });

  it("inserts a preset from the library when dropped on a gap", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Dragged Preset", "/presets/Dragged Preset.hlx")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["Existing"]));
    apiMocks.loadPreset.mockResolvedValue(createPresetResponse("Dragged Preset"));

    render(<App />);

    const presetRow = await screen.findByText("Dragged Preset");
    const gap = await screen.findByTestId("insert-gap-1");
    mockElementFromPoint(gap);

    fireEvent.pointerDown(presetRow.closest(".preset-row") as Element, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window, { clientX: 200, clientY: 200 });

    await waitFor(() => expect(apiMocks.loadPreset).toHaveBeenCalledWith("/presets/Dragged Preset.hlx"));
    expect(within(screen.getByTestId("slot-row-1")).getByText("Dragged Preset")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-2")).getByText("<empty>")).toBeTruthy();
  });

  it("replaces an empty slot directly and requires modal confirmation for a populated slot", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Replacement", "/presets/Replacement.hlx")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["Original"]));
    apiMocks.loadPreset.mockResolvedValue(createPresetResponse("Replacement"));

    render(<App />);

    const presetRow = await screen.findByText("Replacement");
    const elementFromPoint = mockElementFromPoint(null);
    const emptyRow = screen.getByTestId("slot-row-1");
    const populatedRow = screen.getByTestId("slot-row-0");

    elementFromPoint.mockReturnValue(emptyRow);
    fireEvent.pointerDown(presetRow.closest(".preset-row") as Element, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 220 });
    fireEvent.pointerUp(window, { clientX: 220, clientY: 220 });

    await waitFor(() => expect(within(screen.getByTestId("slot-row-1")).getByText("Replacement")).toBeTruthy());

    elementFromPoint.mockReturnValue(populatedRow);
    fireEvent.pointerDown(presetRow.closest(".preset-row") as Element, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 240, clientY: 240 });
    fireEvent.pointerUp(window, { clientX: 240, clientY: 240 });

    expect(await screen.findByText("Replace preset")).toBeTruthy();
    expect(screen.getByText("Replace 1A (Original) with 'Replacement'?")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-0")).getByText("Original")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Replace preset")).toBeNull();
    expect(within(screen.getByTestId("slot-row-0")).getByText("Original")).toBeTruthy();

    elementFromPoint.mockReturnValue(populatedRow);
    fireEvent.pointerDown(presetRow.closest(".preset-row") as Element, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 240, clientY: 240 });
    fireEvent.pointerUp(window, { clientX: 240, clientY: 240 });
    expect(await screen.findByText("Replace preset")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(within(screen.getByTestId("slot-row-0")).getByText("Replacement")).toBeTruthy();
  });

  it("reorders existing setlist rows by dropping on a gap", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["One", "Two", "Three"]));

    render(<App />);

    const row = await screen.findByTestId("slot-row-0");
    const gap = screen.getByTestId("insert-gap-3");
    mockElementFromPoint(gap);

    fireEvent.pointerDown(row, { button: 0, clientX: 50, clientY: 50 });
    await waitFor(() => expect(screen.getByTestId("slot-row-0").className).toContain("dragging"));
    fireEvent.pointerMove(window, { clientX: 260, clientY: 260 });
    fireEvent.pointerUp(window, { clientX: 260, clientY: 260 });

    await waitFor(() => expect(within(screen.getByTestId("slot-row-0")).getByText("Two")).toBeTruthy());
    expect(within(screen.getByTestId("slot-row-1")).getByText("Three")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-2")).getByText("One")).toBeTruthy();
  });

  it("uses Save as the native file dialog action for a new draft", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    await screen.findByDisplayValue("New Setlist");

    const saveButton = screen.getByRole("button", { name: "Save" });
    const saveCopyButton = screen.getByRole("button", { name: "Save As" });

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect((saveCopyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(saveButton);

    await waitFor(() => expect(apiMocks.saveSetlistAs).toHaveBeenCalledTimes(1));
  });

  it("resets a dirty saved setlist back to the on-disk version", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist
      .mockResolvedValueOnce(createSetlistResponse(["Original"]))
      .mockResolvedValueOnce(createSetlistResponse(["Original"]));

    render(<App />);

    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Sort setlist alphabetically" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    expect(screen.getByText("Example *")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(apiMocks.loadSetlist).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Example *")).toBeNull();
    expect(within(screen.getByTestId("slot-row-0")).getByText("Original")).toBeTruthy();
  });

  it("moves a setlist to the recycle bin after confirmation", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockImplementation(async () =>
      apiMocks.deleteSetlist.mock.calls.length > 0 ? [] : [createLibraryEntry("Example", "/setlists/Example.hls")],
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete setlist Example" }));
    expect(await screen.findByText("Delete setlist")).toBeTruthy();
    expect(screen.getByText("Move 'Example' to the recycle bin?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiMocks.deleteSetlist).toHaveBeenCalledWith("/setlists/Example.hls"));
    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenLastCalledWith("/setlists", false));
  });

  it("toggles recursive scanning and shows relative directories in both panels", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockImplementation(async (_directory: string, includeSubdirectories: boolean) =>
      includeSubdirectories
        ? [createLibraryEntry("Example", "/setlists/Pearl Jam/Example.hls", "/Pearl Jam")]
        : [createLibraryEntry("Example", "/setlists/Example.hls")],
    );
    apiMocks.listPresets.mockImplementation(async (_directory: string, includeSubdirectories: boolean) =>
      includeSubdirectories
        ? [createLibraryEntry("Alive", "/presets/Pearl Jam/Alive.hlx", "/Pearl Jam")]
        : [createLibraryEntry("Alive", "/presets/Alive.hlx")],
    );

    render(<App />);

    await screen.findByText("Example");
    const checkboxes = screen.getAllByRole("checkbox", { name: "Include subdirectories" });

    fireEvent.click(checkboxes[0] as HTMLInputElement);
    fireEvent.click(checkboxes[1] as HTMLInputElement);

    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenLastCalledWith("/setlists", true));
    await waitFor(() => expect(apiMocks.listPresets).toHaveBeenLastCalledWith("/presets", true));
    const setlistsPanel = screen.getByRole("heading", { name: "Setlists" }).closest("section");
    const presetsPanel = screen.getByRole("heading", { name: "Presets" }).closest("section");

    expect(setlistsPanel).toBeTruthy();
    expect(presetsPanel).toBeTruthy();
    expect(within(setlistsPanel as HTMLElement).getByText("/Pearl Jam")).toBeTruthy();
    expect(within(presetsPanel as HTMLElement).getByText("/Pearl Jam")).toBeTruthy();
  });

  it("sorts named presets alphabetically after confirmation", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["zeta", "", "Alpha", "beta"]));

    render(<App />);

    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Sort setlist alphabetically" }));
    expect(await screen.findByText("Sort setlist")).toBeTruthy();
    expect(screen.getByText("Sorting a setlist alphabetically can't be undone. Continue?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(within(screen.getByTestId("slot-row-0")).getByText("Alpha")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-1")).getByText("beta")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-2")).getByText("zeta")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-3")).getByText("<empty>")).toBeTruthy();
  });

  it("leaves the setlist unchanged when alphabetical sort is cancelled", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["zeta", "Alpha"]));

    render(<App />);

    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Sort setlist alphabetically" }));
    expect(await screen.findByText("Sort setlist")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(within(screen.getByTestId("slot-row-0")).getByText("zeta")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-1")).getByText("Alpha")).toBeTruthy();
  });
});
