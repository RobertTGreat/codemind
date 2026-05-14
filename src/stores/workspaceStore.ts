import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspacePaneId = "explorer" | "editor" | "chat";
export type WorkspaceSectionId = "sessions" | "openVsx" | "git" | WorkspacePaneId;

type PaneSizeById = Record<WorkspacePaneId, number>;
const minimumPaneSizeFallbackById: PaneSizeById = {
  explorer: 200,
  editor: 360,
  chat: 380,
};
const minimumPaneViewportRatioById: PaneSizeById = {
  explorer: 0.11,
  editor: 0.22,
  chat: 0.22,
};
const MINIMUM_OPEN_VSX_WIDTH = 250;
const MAXIMUM_OPEN_VSX_WIDTH = 560;
const MINIMUM_GIT_WIDTH = 270;
const MAXIMUM_GIT_WIDTH = 620;

function getMinimumPaneSize(paneId: WorkspacePaneId) {
  if (typeof window === "undefined") {
    return minimumPaneSizeFallbackById[paneId];
  }

  return Math.max(
    minimumPaneSizeFallbackById[paneId],
    Math.round(window.innerWidth * minimumPaneViewportRatioById[paneId]),
  );
}

interface WorkspaceStore {
  selectedSessionId: string | null;
  selectedFilePath: string | null;
  openFileTabs: string[];
  paneOrder: WorkspacePaneId[];
  paneSizes: PaneSizeById;
  visibleSections: Record<WorkspaceSectionId, boolean>;
  wasSessionsVisibleBeforeOpenVsx: boolean;
  wasSessionsVisibleBeforeGit: boolean;
  openVsxWidth: number;
  gitWidth: number;
  isShellOpen: boolean;
  shellHeight: number;
  uiScalePercent: number;
  globalRules: string;
  projectRulesByRoot: Record<string, string>;
  setSelectedSessionId: (sessionId: string | null) => void;
  setSelectedFilePath: (relativePath: string | null) => void;
  closeFileTab: (relativePath: string) => void;
  toggleSection: (sectionId: WorkspaceSectionId) => void;
  movePane: (paneId: WorkspacePaneId, direction: -1 | 1) => void;
  setPaneSize: (paneId: WorkspacePaneId, width: number) => void;
  setOpenVsxWidth: (width: number) => void;
  setGitWidth: (width: number) => void;
  toggleShell: () => void;
  setShellHeight: (height: number) => void;
  setUiScalePercent: (uiScalePercent: number) => void;
  setGlobalRules: (rules: string) => void;
  setProjectRules: (projectRoot: string, rules: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      selectedFilePath: null,
      openFileTabs: [],
      paneOrder: ["explorer", "editor", "chat"],
      paneSizes: {
        explorer: 320,
        editor: 620,
        chat: 500,
      },
      visibleSections: {
        sessions: true,
        openVsx: false,
        git: false,
        explorer: true,
        editor: true,
        chat: true,
      },
      wasSessionsVisibleBeforeOpenVsx: false,
      wasSessionsVisibleBeforeGit: false,
      openVsxWidth: 320,
      gitWidth: 340,
      isShellOpen: false,
      shellHeight: 260,
      uiScalePercent: 100,
      globalRules: "",
      projectRulesByRoot: {},
      setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
      setSelectedFilePath: (selectedFilePath) =>
        set((state) => ({
          selectedFilePath,
          openFileTabs:
            selectedFilePath && !state.openFileTabs.includes(selectedFilePath)
              ? [...state.openFileTabs, selectedFilePath]
              : state.openFileTabs,
        })),
      closeFileTab: (relativePath) =>
        set((state) => {
          const openFileTabs = state.openFileTabs.filter(
            (filePath) => filePath !== relativePath,
          );
          const selectedFilePath =
            state.selectedFilePath === relativePath
              ? openFileTabs[openFileTabs.length - 1] ?? null
              : state.selectedFilePath;
          return { openFileTabs, selectedFilePath };
        }),
      toggleSection: (sectionId) =>
        set((state) => {
          const isNextSectionVisible = !state.visibleSections[sectionId];
          const visibleSections = {
            ...state.visibleSections,
            [sectionId]: isNextSectionVisible,
          };
          let wasSessionsVisibleBeforeOpenVsx = state.wasSessionsVisibleBeforeOpenVsx;
          let wasSessionsVisibleBeforeGit = state.wasSessionsVisibleBeforeGit;

          if (sectionId === "openVsx" && isNextSectionVisible) {
            wasSessionsVisibleBeforeOpenVsx =
              state.visibleSections.sessions ||
              (state.visibleSections.git && state.wasSessionsVisibleBeforeGit);
            visibleSections.sessions = false;
            visibleSections.git = false;
            wasSessionsVisibleBeforeGit = false;
          }

          if (sectionId === "openVsx" && !isNextSectionVisible && wasSessionsVisibleBeforeOpenVsx) {
            visibleSections.sessions = true;
            wasSessionsVisibleBeforeOpenVsx = false;
          }

          if (sectionId === "git" && isNextSectionVisible) {
            wasSessionsVisibleBeforeGit =
              state.visibleSections.sessions ||
              (state.visibleSections.openVsx && state.wasSessionsVisibleBeforeOpenVsx);
            visibleSections.sessions = false;
            visibleSections.openVsx = false;
            wasSessionsVisibleBeforeOpenVsx = false;
          }

          if (sectionId === "git" && !isNextSectionVisible && wasSessionsVisibleBeforeGit) {
            visibleSections.sessions = true;
            wasSessionsVisibleBeforeGit = false;
          }

          if (sectionId === "sessions" && isNextSectionVisible) {
            visibleSections.openVsx = false;
            visibleSections.git = false;
            wasSessionsVisibleBeforeOpenVsx = false;
            wasSessionsVisibleBeforeGit = false;
          }

          return {
            visibleSections,
            wasSessionsVisibleBeforeOpenVsx,
            wasSessionsVisibleBeforeGit,
          };
        }),
      movePane: (paneId, direction) =>
        set((state) => {
          const paneOrder = [...state.paneOrder];
          const currentIndex = paneOrder.indexOf(paneId);
          const nextIndex = currentIndex + direction;
          if (currentIndex < 0 || nextIndex < 0 || nextIndex >= paneOrder.length) {
            return state;
          }
          [paneOrder[currentIndex], paneOrder[nextIndex]] = [
            paneOrder[nextIndex],
            paneOrder[currentIndex],
          ];
          return { paneOrder };
        }),
      setPaneSize: (paneId, width) =>
        set((state) => ({
          paneSizes: {
            ...state.paneSizes,
            [paneId]: Math.min(Math.max(width, getMinimumPaneSize(paneId)), 1_100),
          },
        })),
      setOpenVsxWidth: (width) =>
        set({
          openVsxWidth: Math.min(
            Math.max(width, MINIMUM_OPEN_VSX_WIDTH),
            MAXIMUM_OPEN_VSX_WIDTH,
          ),
        }),
      setGitWidth: (width) =>
        set({
          gitWidth: Math.min(Math.max(width, MINIMUM_GIT_WIDTH), MAXIMUM_GIT_WIDTH),
        }),
      toggleShell: () => set((state) => ({ isShellOpen: !state.isShellOpen })),
      setShellHeight: (height) =>
        set({ shellHeight: Math.min(Math.max(height, 160), 520) }),
      setUiScalePercent: (uiScalePercent) =>
        set({ uiScalePercent: Math.min(Math.max(uiScalePercent, 80), 140) }),
      setGlobalRules: (globalRules) => set({ globalRules }),
      setProjectRules: (projectRoot, rules) =>
        set((state) => ({
          projectRulesByRoot: {
            ...state.projectRulesByRoot,
            [projectRoot]: rules,
          },
        })),
    }),
    {
      name: "codemind-workspace",
      partialize: (state) => ({
        selectedSessionId: state.selectedSessionId,
        selectedFilePath: state.selectedFilePath,
        openFileTabs: state.openFileTabs,
        paneOrder: state.paneOrder,
        paneSizes: state.paneSizes,
        visibleSections: state.visibleSections,
        openVsxWidth: state.openVsxWidth,
        gitWidth: state.gitWidth,
        isShellOpen: state.isShellOpen,
        shellHeight: state.shellHeight,
        uiScalePercent: state.uiScalePercent,
        globalRules: state.globalRules,
        projectRulesByRoot: state.projectRulesByRoot,
      }),
    },
  ),
);
