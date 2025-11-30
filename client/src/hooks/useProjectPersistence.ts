/**
 * useProjectPersistence - Working Project localStorage persistence
 *
 * The "Working Project" is the current editing state that auto-saves to localStorage.
 * It can be loaded from a named server project, and saved back as a new or updated project.
 *
 * Workflow:
 * - On startup: Load working project from localStorage (or create default)
 * - On changes: Auto-save to localStorage with debounce
 * - Load Named Project: Copy server project data to working project
 * - Save Project: Save working project to server as new or overwrite existing
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useLogStore, View, ViewWithGridState, Project, WorkingProjectState } from '../store/logStore';

// LocalStorage key for working project
const WORKING_PROJECT_KEY = 'si-working-project';

// Debounce delay for auto-save (ms)
const SAVE_DEBOUNCE_MS = 1500;

// Default filter (copied from logStore)
const defaultFilter = {
    sessions: [],
    levels: [],
    titlePattern: '',
    messagePattern: '',
    inverseMatch: false,
    from: null,
    to: null,
    appNames: [],
    hostNames: [],
    entryTypes: []
};

/**
 * Convert a View to ViewWithGridState (adding grid state fields)
 */
function viewToViewWithGridState(view: View): ViewWithGridState {
    return {
        ...view,
        gridFilterModel: {},
        scrollPosition: { top: 0 }
    };
}

/**
 * Create default project with "All Logs" view
 */
function createDefaultProject(user: string): Project {
    return {
        id: 'working',
        name: 'Working Project',
        description: 'Current editing state',
        createdBy: user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isShared: false,
        views: [
            {
                id: 'all',
                name: 'All Logs',
                icon: 'list',
                filter: { ...defaultFilter },
                highlightRules: [],
                useGlobalHighlights: true,
                autoScroll: true,
                columnState: [],
                gridFilterModel: {},
                scrollPosition: { top: 0 }
            }
        ],
        activeViewId: 'all',
        panelSizes: {
            detailHeightPercent: 25,
            watchWidthPercent: 20
        },
        panelVisibility: {
            showDetailPanel: true,
            showWatchPanel: true,
            showStreamPanel: false
        },
        maxDisplayEntries: 10000,
        theme: 'light'
    };
}

/**
 * Create default working project state
 */
function createDefaultWorkingState(user: string): WorkingProjectState {
    return {
        project: createDefaultProject(user),
        loadedProjectId: null,
        loadedProjectDirty: false
    };
}

/**
 * Load working project from localStorage
 */
function loadWorkingProject(room: string, user: string): WorkingProjectState | null {
    try {
        const key = `${WORKING_PROJECT_KEY}-${room}-${user}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved) as WorkingProjectState;
            // Validate the structure
            if (parsed.project && Array.isArray(parsed.project.views)) {
                return parsed;
            }
        }
    } catch (e) {
        console.error('[ProjectPersistence] Failed to load working project:', e);
    }
    return null;
}

/**
 * Save working project to localStorage
 */
function saveWorkingProject(room: string, user: string, state: WorkingProjectState): void {
    try {
        const key = `${WORKING_PROJECT_KEY}-${room}-${user}`;
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        console.error('[ProjectPersistence] Failed to save working project:', e);
    }
}

/**
 * Extract project data from current store state
 */
function extractProjectFromStore(): Omit<Project, 'id' | 'name' | 'description' | 'createdBy' | 'createdAt' | 'updatedAt' | 'isShared'> {
    const state = useLogStore.getState();

    // Convert views to ViewWithGridState
    const viewsWithGridState: ViewWithGridState[] = state.views.map(viewToViewWithGridState);

    return {
        views: viewsWithGridState,
        activeViewId: state.activeViewId,
        panelSizes: {
            detailHeightPercent: state.detailPanelHeightPercent,
            watchWidthPercent: state.watchPanelWidthPercent
        },
        panelVisibility: {
            showDetailPanel: state.showDetailPanel,
            showWatchPanel: state.showWatchPanel,
            showStreamPanel: state.showStreamPanel
        },
        maxDisplayEntries: state.maxDisplayEntries,
        theme: state.theme
    };
}

/**
 * Apply project data to store state
 */
function applyProjectToStore(project: Project): void {
    const store = useLogStore.getState();

    // Apply views (strip grid state for now - Phase 4 will handle this)
    store.setViews(project.views);

    // Apply active view
    if (project.activeViewId) {
        store.setActiveView(project.activeViewId);
    }

    // Apply panel sizes
    store.setDetailPanelHeightPercent(project.panelSizes.detailHeightPercent);
    store.setWatchPanelWidthPercent(project.panelSizes.watchWidthPercent);

    // Apply panel visibility
    store.setShowDetailPanel(project.panelVisibility.showDetailPanel);
    store.setShowWatchPanel(project.panelVisibility.showWatchPanel);
    store.setShowStreamPanel(project.panelVisibility.showStreamPanel);

    // Apply theme
    store.setTheme(project.theme);
}

/**
 * Hook for working project persistence
 */
export function useProjectPersistence() {
    const currentRoom = useLogStore(state => state.currentRoom);
    const currentUser = useLogStore(state => state.currentUser);

    // Track state changes that should trigger auto-save
    const views = useLogStore(state => state.views);
    const activeViewId = useLogStore(state => state.activeViewId);
    const showDetailPanel = useLogStore(state => state.showDetailPanel);
    const showWatchPanel = useLogStore(state => state.showWatchPanel);
    const showStreamPanel = useLogStore(state => state.showStreamPanel);
    const detailPanelHeightPercent = useLogStore(state => state.detailPanelHeightPercent);
    const watchPanelWidthPercent = useLogStore(state => state.watchPanelWidthPercent);
    const theme = useLogStore(state => state.theme);

    // Working project state
    const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
    const [loadedProjectDirty, setLoadedProjectDirty] = useState(false);
    const [loadedProjectName, setLoadedProjectName] = useState<string | null>(null);

    // Refs
    const mountedRef = useRef(true);
    const saveTimeoutRef = useRef<number | null>(null);
    const initializedRef = useRef(false);
    const lastSavedRef = useRef<string>('');
    const skipNextSaveRef = useRef(false);

    // Initialize on mount - load working project from localStorage
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const workingState = loadWorkingProject(currentRoom, currentUser);

        if (workingState) {
            console.log('[ProjectPersistence] Loaded working project from localStorage');
            skipNextSaveRef.current = true;
            applyProjectToStore(workingState.project);
            setLoadedProjectId(workingState.loadedProjectId);
            setLoadedProjectDirty(workingState.loadedProjectDirty);

            // Update last saved to prevent immediate re-save
            lastSavedRef.current = JSON.stringify(workingState);
        } else {
            console.log('[ProjectPersistence] No working project found, using defaults');
        }
    }, [currentRoom, currentUser]);

    // Build current working state from store
    const buildWorkingState = useCallback((): WorkingProjectState => {
        const projectData = extractProjectFromStore();
        return {
            project: {
                id: 'working',
                name: loadedProjectName || 'Working Project',
                description: 'Current editing state',
                createdBy: currentUser,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isShared: false,
                ...projectData
            },
            loadedProjectId,
            loadedProjectDirty
        };
    }, [currentUser, loadedProjectId, loadedProjectDirty, loadedProjectName]);

    // Schedule debounced save to localStorage
    const scheduleSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            saveTimeoutRef.current = null;
            const state = buildWorkingState();
            saveWorkingProject(currentRoom, currentUser, state);
            lastSavedRef.current = JSON.stringify(state);
            console.log('[ProjectPersistence] Auto-saved to localStorage');
        }, SAVE_DEBOUNCE_MS);
    }, [buildWorkingState, currentRoom, currentUser]);

    // Auto-save when relevant state changes
    useEffect(() => {
        // Skip if not initialized or if we should skip
        if (!initializedRef.current || skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            return;
        }

        // Mark as dirty if we loaded from a named project
        if (loadedProjectId && !loadedProjectDirty) {
            setLoadedProjectDirty(true);
        }

        scheduleSave();
    }, [views, activeViewId, showDetailPanel, showWatchPanel, showStreamPanel,
        detailPanelHeightPercent, watchPanelWidthPercent, theme, scheduleSave, loadedProjectId, loadedProjectDirty]);

    // Load a named project from server
    const loadProject = useCallback(async (projectId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`);
            if (!response.ok) {
                throw new Error(`Failed to load project: ${response.statusText}`);
            }

            const data = await response.json();
            const project = data.project as Project;

            // Apply to store
            skipNextSaveRef.current = true;
            applyProjectToStore(project);

            // Update tracking state
            setLoadedProjectId(projectId);
            setLoadedProjectName(project.name);
            setLoadedProjectDirty(false);

            // Save immediately to localStorage
            const workingState: WorkingProjectState = {
                project,
                loadedProjectId: projectId,
                loadedProjectDirty: false
            };
            saveWorkingProject(currentRoom, currentUser, workingState);
            lastSavedRef.current = JSON.stringify(workingState);

            console.log('[ProjectPersistence] Loaded project:', project.name);
            return { success: true, project };
        } catch (err) {
            console.error('[ProjectPersistence] Failed to load project:', err);
            return { success: false, error: String(err) };
        }
    }, [currentRoom, currentUser]);

    // Save current state as a new project
    const saveAsNewProject = useCallback(async (name: string, description?: string) => {
        try {
            const projectData = extractProjectFromStore();
            const newProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
                name,
                description,
                createdBy: currentUser,
                isShared: false,
                ...projectData
            };

            const response = await fetch(`/api/projects?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: newProject })
            });

            if (!response.ok) {
                throw new Error(`Failed to save project: ${response.statusText}`);
            }

            const data = await response.json();
            const savedProject = data.project as Project;

            // Update tracking state
            setLoadedProjectId(savedProject.id);
            setLoadedProjectName(savedProject.name);
            setLoadedProjectDirty(false);

            // Update localStorage
            const workingState = buildWorkingState();
            workingState.loadedProjectId = savedProject.id;
            workingState.loadedProjectDirty = false;
            saveWorkingProject(currentRoom, currentUser, workingState);

            console.log('[ProjectPersistence] Saved as new project:', savedProject.name);
            return { success: true, project: savedProject };
        } catch (err) {
            console.error('[ProjectPersistence] Failed to save project:', err);
            return { success: false, error: String(err) };
        }
    }, [currentRoom, currentUser, buildWorkingState]);

    // Update existing project with current state
    const updateProject = useCallback(async (projectId: string) => {
        try {
            const projectData = extractProjectFromStore();

            const response = await fetch(`/api/projects/${projectId}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: projectData })
            });

            if (!response.ok) {
                throw new Error(`Failed to update project: ${response.statusText}`);
            }

            const data = await response.json();
            const updatedProject = data.project as Project;

            // Update tracking state
            setLoadedProjectDirty(false);

            // Update localStorage
            const workingState = buildWorkingState();
            workingState.loadedProjectDirty = false;
            saveWorkingProject(currentRoom, currentUser, workingState);

            console.log('[ProjectPersistence] Updated project:', updatedProject.name);
            return { success: true, project: updatedProject };
        } catch (err) {
            console.error('[ProjectPersistence] Failed to update project:', err);
            return { success: false, error: String(err) };
        }
    }, [currentRoom, currentUser, buildWorkingState]);

    // List available projects
    const listProjects = useCallback(async () => {
        try {
            const response = await fetch(`/api/projects?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`);
            if (!response.ok) {
                throw new Error(`Failed to list projects: ${response.statusText}`);
            }

            const data = await response.json();
            return { success: true, projects: data.projects };
        } catch (err) {
            console.error('[ProjectPersistence] Failed to list projects:', err);
            return { success: false, error: String(err), projects: [] };
        }
    }, [currentRoom, currentUser]);

    // Delete a project
    const deleteProject = useCallback(async (projectId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`Failed to delete project: ${response.statusText}`);
            }

            // If we deleted the loaded project, clear tracking
            if (loadedProjectId === projectId) {
                setLoadedProjectId(null);
                setLoadedProjectName(null);
                setLoadedProjectDirty(false);
            }

            console.log('[ProjectPersistence] Deleted project:', projectId);
            return { success: true };
        } catch (err) {
            console.error('[ProjectPersistence] Failed to delete project:', err);
            return { success: false, error: String(err) };
        }
    }, [currentRoom, currentUser, loadedProjectId]);

    // Reset to default project (clear loaded project tracking)
    const resetToDefault = useCallback(() => {
        const defaultState = createDefaultWorkingState(currentUser);

        skipNextSaveRef.current = true;
        applyProjectToStore(defaultState.project);

        setLoadedProjectId(null);
        setLoadedProjectName(null);
        setLoadedProjectDirty(false);

        saveWorkingProject(currentRoom, currentUser, defaultState);
        lastSavedRef.current = JSON.stringify(defaultState);

        console.log('[ProjectPersistence] Reset to default project');
    }, [currentRoom, currentUser]);

    // Cleanup
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        // State
        loadedProjectId,
        loadedProjectName,
        loadedProjectDirty,

        // Actions
        loadProject,
        saveAsNewProject,
        updateProject,
        listProjects,
        deleteProject,
        resetToDefault
    };
}
