// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
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

vi.mock("../web/src/api", () => apiMocks);

import { App } from "../web/src/App";

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
      modifiedAt: "",
      size: 100,
    });
    apiMocks.saveSetlistAs.mockResolvedValue({
      name: "Example Copy",
      absolutePath: "/setlists/Example Copy.hls",
      modifiedAt: "",
      size: 100,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("selects setlist and preset directories from header icon buttons", async () => {
    apiMocks.pickSetlistDirectory.mockResolvedValue("/setlists");
    apiMocks.pickPresetDirectory.mockResolvedValue("/presets");
    apiMocks.listSetlists.mockResolvedValue([
      { name: "Example", absolutePath: "/setlists/Example.hls", modifiedAt: "", size: 100 },
    ]);
    apiMocks.listPresets.mockResolvedValue([
      { name: "Boulevard", absolutePath: "/presets/Boulevard.hlx", modifiedAt: "", size: 100 },
    ]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Select setlist directory" }));
    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenCalledWith("/setlists"));
    expect(await screen.findByText("Example")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select preset directory" }));
    await waitFor(() => expect(apiMocks.listPresets).toHaveBeenCalledWith("/presets"));
    expect(await screen.findByText("Boulevard")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("opens the native save dialog directly for Save as Copy", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([
      { name: "Example", absolutePath: "/setlists/Example.hls", modifiedAt: "", size: 100 },
    ]);

    render(<App />);

    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Save as Copy" }));

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

  it("inserts a preset from the library when dropped on a gap", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockResolvedValue([
      { name: "Example", absolutePath: "/setlists/Example.hls", modifiedAt: "", size: 100 },
    ]);
    apiMocks.listPresets.mockResolvedValue([
      { name: "Dragged Preset", absolutePath: "/presets/Dragged Preset.hlx", modifiedAt: "", size: 100 },
    ]);
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
    apiMocks.listSetlists.mockResolvedValue([
      { name: "Example", absolutePath: "/setlists/Example.hls", modifiedAt: "", size: 100 },
    ]);
    apiMocks.listPresets.mockResolvedValue([
      { name: "Replacement", absolutePath: "/presets/Replacement.hlx", modifiedAt: "", size: 100 },
    ]);
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
    expect(window.confirm).not.toHaveBeenCalled();

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
    apiMocks.listSetlists.mockResolvedValue([
      { name: "Example", absolutePath: "/setlists/Example.hls", modifiedAt: "", size: 100 },
    ]);
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
    const saveCopyButton = screen.getByRole("button", { name: "Save as Copy" });

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect((saveCopyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(saveButton);

    await waitFor(() => expect(apiMocks.saveSetlistAs).toHaveBeenCalledTimes(1));
  });
});
