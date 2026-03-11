// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  deleteSetlist: vi.fn(),
  getRuntimeInfo: vi.fn(),
  listPresets: vi.fn(),
  listSetlists: vi.fn(),
  loadAppSettings: vi.fn(),
  loadBlankTemplate: vi.fn(),
  loadPreset: vi.fn(),
  loadSetlist: vi.fn(),
  pickPresetDirectory: vi.fn(),
  pickSetlistDirectory: vi.fn(),
  resetAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
  saveSetlist: vi.fn(),
  saveSetlistAs: vi.fn(),
}));

const updaterMocks = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
  getCurrentAppVersion: vi.fn(),
  installAppUpdate: vi.fn(),
}));

const driverMocks = vi.hoisted(() => {
  const state: { config?: Record<string, unknown> } = {};
  const instance = {
    isActive: vi.fn(() => false),
    refresh: vi.fn(),
    drive: vi.fn(),
    setConfig: vi.fn(),
    setSteps: vi.fn(),
    getConfig: vi.fn(),
    getState: vi.fn(() => ({})),
    getActiveIndex: vi.fn(),
    isFirstStep: vi.fn(),
    isLastStep: vi.fn(),
    getActiveStep: vi.fn(),
    getActiveElement: vi.fn(),
    getPreviousElement: vi.fn(),
    getPreviousStep: vi.fn(),
    moveNext: vi.fn(),
    movePrevious: vi.fn(),
    moveTo: vi.fn(),
    hasNextStep: vi.fn(),
    hasPreviousStep: vi.fn(),
    highlight: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    state,
    instance,
    driver: vi.fn((config?: Record<string, unknown>) => {
      state.config = config;
      return instance;
    }),
  };
});

const eventMocks = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();

  return {
    handlers,
    listen: vi.fn(async (event: string, handler: () => void) => {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    }),
    emit(event: string) {
      handlers.get(event)?.();
    },
  };
});

vi.mock("../web/src/api", () => apiMocks);
vi.mock("../web/src/updater", () => updaterMocks);
vi.mock("driver.js", () => ({ driver: driverMocks.driver }));
vi.mock("@tauri-apps/api/event", () => ({ listen: eventMocks.listen }));

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

async function clickSetlist(name: string) {
  const label = await screen.findByText(name);
  const button = label.closest("button");
  expect(button).toBeTruthy();
  fireEvent.click(button as HTMLElement);
}

describe("App desktop flows", () => {
  beforeEach(() => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true });
    apiMocks.getRuntimeInfo.mockResolvedValue({ platform: "macos", canMoveFileToTrash: true });
    apiMocks.saveAppSettings.mockResolvedValue(undefined);
    apiMocks.deleteSetlist.mockResolvedValue(undefined);
    apiMocks.pickSetlistDirectory.mockResolvedValue(null);
    apiMocks.pickPresetDirectory.mockResolvedValue(null);
    apiMocks.resetAppSettings.mockResolvedValue(undefined);
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
    updaterMocks.getCurrentAppVersion.mockResolvedValue("0.1.4");
    updaterMocks.installAppUpdate.mockResolvedValue(undefined);
    driverMocks.state.config = undefined;
    eventMocks.handlers.clear();
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

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Select setlist directory" }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Select setlist directory" }));
    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenCalledWith("/setlists", false));
    expect(await screen.findByText("Example")).toBeTruthy();
    expect(screen.getByText("/setlists")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select preset directory" }));
    await waitFor(() => expect(apiMocks.listPresets).toHaveBeenCalledWith("/presets", false));
    expect(await screen.findByText("Boulevard")).toBeTruthy();
    expect(screen.getByText("/presets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete setlist Example" })).toBeTruthy();
  }, 10000);

  it("opens the native save dialog directly for Save As", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);

    render(<App />);

    await clickSetlist("Example");
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
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true });
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

  it("checks for updates from the app menu and reports when no update is available", async () => {
    render(<App />);

    eventMocks.emit("app://check-for-updates");

    expect(await screen.findByText("Check for updates")).toBeTruthy();
    expect(screen.getByText("You're up to date. You are running 0.1.4.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByText("Check for updates")).toBeNull());
  });

  it("starts the guided intro by default and persists the opt-out on completion", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({});

    render(<App />);

    await waitFor(() => expect(driverMocks.driver).toHaveBeenCalledTimes(1));
    expect(driverMocks.instance.drive).toHaveBeenCalledTimes(1);
    expect(driverMocks.state.config).toEqual(
      expect.objectContaining({
        allowClose: false,
        allowKeyboardControl: false,
        showButtons: ["previous", "next"],
      }),
    );

    const popover = {
      wrapper: document.createElement("div"),
      arrow: document.createElement("div"),
      title: document.createElement("div"),
      description: document.createElement("div"),
      footer: document.createElement("div"),
      progress: document.createElement("div"),
      previousButton: document.createElement("button"),
      nextButton: document.createElement("button"),
      closeButton: document.createElement("button"),
      footerButtons: document.createElement("div"),
    };
    popover.wrapper.appendChild(popover.title);
    popover.wrapper.appendChild(popover.description);
    popover.wrapper.appendChild(popover.footer);
    const config = driverMocks.state.config as {
      onPopoverRender?: (popover: typeof popover, opts: { state: { activeIndex: number } }) => void;
      onDestroyed?: () => void;
    };
    config.onPopoverRender?.(popover, { state: { activeIndex: 5 } });

    const optOutCheckbox = popover.wrapper.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(optOutCheckbox).toBeTruthy();
    fireEvent.change(optOutCheckbox, { target: { checked: true } });
    config.onDestroyed?.();

    await waitFor(() =>
      expect(apiMocks.saveAppSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ hideWelcomeMessage: true }),
      ),
    );
  });

  it("does not start the guided intro when the user has opted out", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true });

    render(<App />);

    await waitFor(() => expect(driverMocks.driver).not.toHaveBeenCalled());
  });

  it("creates a blank draft on startup without auto-selecting the first setlist", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);

    render(<App />);

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(await screen.findByText("Example")).toBeTruthy();
    expect(apiMocks.loadSetlist).not.toHaveBeenCalled();
    expect(document.querySelector(".list-row.active")).toBeNull();
  });

  it("defers the update prompt until the guided intro is completed", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({});
    updaterMocks.checkForAppUpdate.mockResolvedValue({
      currentVersion: "0.1.0",
      version: "0.1.1",
      body: "Bug fixes",
    });

    render(<App />);

    await waitFor(() => expect(driverMocks.driver).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Update available")).toBeNull();

    const config = driverMocks.state.config as { onDestroyed?: () => void };
    config.onDestroyed?.();

    expect(await screen.findByText("Update available")).toBeTruthy();
  });

  it("resets app state from the help menu event back to the blank startup state", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      hideWelcomeMessage: true,
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
      includeSetlistSubdirectories: true,
      includePresetSubdirectories: true,
    });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Alive", "/presets/Alive.hlx")]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    expect(await screen.findByText("Example")).toBeTruthy();
    expect(await screen.findByText("Alive")).toBeTruthy();

    eventMocks.emit("app://reset-app-state");

    await waitFor(() => expect(apiMocks.resetAppSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("No setlist directory selected")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("No preset directory selected")).toBeTruthy());

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInput.value).toBe("");
    expect(screen.queryByText("Example")).toBeNull();
    expect(screen.queryByText("Alive")).toBeNull();
    await waitFor(() => expect(driverMocks.driver).toHaveBeenCalledTimes(1));
  });

  it("inserts a preset from the library when dropped on a gap", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      hideWelcomeMessage: true,
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Dragged Preset", "/presets/Dragged Preset.hlx")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["Existing"]));
    apiMocks.loadPreset.mockResolvedValue(createPresetResponse("Dragged Preset"));

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
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
      hideWelcomeMessage: true,
      setlistDirectory: "/setlists",
      presetDirectory: "/presets",
    });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.listPresets.mockResolvedValue([createLibraryEntry("Replacement", "/presets/Replacement.hlx")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["Original"]));
    apiMocks.loadPreset.mockResolvedValue(createPresetResponse("Replacement"));

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
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
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["One", "Two", "Three"]));

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
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

  it("uses Save as the native file dialog action for a named new draft", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const nameInput = await screen.findByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "New Setlist" } });

    const saveButton = screen.getByRole("button", { name: "Save" });
    const saveCopyButton = screen.getByRole("button", { name: "Save As" });

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect((saveCopyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(saveButton);

    await waitFor(() => expect(apiMocks.saveSetlistAs).toHaveBeenCalledTimes(1));
  });

  it("creates a new setlist with a blank name", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New" }));

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInput.value).toBe("");
  });

  it("allows a loaded setlist name to be cleared fully", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });

    expect(nameInput.value).toBe("");
  });

  it("blocks Save on a new setlist when the name is blank and clears the error after entry", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: "Save" });

    fireEvent.click(saveButton);
    expect(apiMocks.saveSetlist).not.toHaveBeenCalled();
    expect(apiMocks.saveSetlistAs).not.toHaveBeenCalled();
    await waitFor(() => expect(nameInput.className).toContain("invalid"));
    expect(document.activeElement).toBe(nameInput);

    fireEvent.change(nameInput, { target: { value: "Valid Name" } });
    expect(nameInput.className).not.toContain("invalid");
  });

  it("resets a dirty saved setlist back to the on-disk version", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist
      .mockResolvedValueOnce(createSetlistResponse(["Original"]))
      .mockResolvedValueOnce(createSetlistResponse(["Original"]));

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Sort setlist alphabetically" }));
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    expect(screen.getByText("Example *")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(apiMocks.loadSetlist.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("Example *")).toBeNull();
    expect(within(screen.getByTestId("slot-row-0")).getByText("Original")).toBeTruthy();
  }, 10000);

  it("moves a setlist to the recycle bin after confirmation", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockImplementation(async () =>
      apiMocks.deleteSetlist.mock.calls.length > 0 ? [] : [createLibraryEntry("Example", "/setlists/Example.hls")],
    );

    render(<App />);

    const setlistRow = await screen.findByText("Example");
    const rowContainer = setlistRow.closest(".list-row");

    expect(rowContainer).toBeTruthy();

    fireEvent.click(within(rowContainer as HTMLElement).getByRole("button", { name: "Delete setlist Example" }));
    expect(await screen.findByText("Delete setlist")).toBeTruthy();
    expect(screen.getByText("Move 'Example' to the recycle bin?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiMocks.deleteSetlist).toHaveBeenCalledWith("/setlists/Example.hls"));
    await waitFor(() => expect(apiMocks.listSetlists).toHaveBeenLastCalledWith("/setlists", false));
  });

  it("hides delete setlist actions when recycle bin support is unavailable", async () => {
    apiMocks.getRuntimeInfo.mockResolvedValue({ platform: "windows", canMoveFileToTrash: false });
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "C:\\setlists\\Example.hls")]);

    render(<App />);

    await screen.findByText("Example");
    expect(screen.queryByRole("button", { name: "Delete setlist Example" })).toBeNull();
  });

  it("toggles recursive scanning and shows relative directories in both panels", async () => {
    apiMocks.loadAppSettings.mockResolvedValue({
      hideWelcomeMessage: true,
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
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["zeta", "", "Alpha", "beta"]));

    render(<App />);

    await clickSetlist("Example");
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
    apiMocks.loadAppSettings.mockResolvedValue({ hideWelcomeMessage: true, setlistDirectory: "/setlists" });
    apiMocks.listSetlists.mockResolvedValue([createLibraryEntry("Example", "/setlists/Example.hls")]);
    apiMocks.loadSetlist.mockResolvedValue(createSetlistResponse(["zeta", "Alpha"]));

    render(<App />);

    await clickSetlist("Example");
    await screen.findByDisplayValue("Example");
    fireEvent.click(screen.getByRole("button", { name: "Sort setlist alphabetically" }));
    expect(await screen.findByText("Sort setlist")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(within(screen.getByTestId("slot-row-0")).getByText("zeta")).toBeTruthy();
    expect(within(screen.getByTestId("slot-row-1")).getByText("Alpha")).toBeTruthy();
  });
});
