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

import { useEffect, useRef, useCallback } from 'react';
import { useLogStore, View, ViewWithGridState, Project, WorkingProjectState, defaultLimits } from '../store/logStore';
import { getSettings } from './useSettings';

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
        limits: { ...defaultLimits },
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
        limits: { ...state.limits },
        theme: state.theme
    };
}

/**
 * Apply project data to store state
 * Includes defensive handling for older/incomplete project schemas
 */
function applyProjectToStore(project: Project): void {
    const store = useLogStore.getState();

    // Apply views with fallback to current views if missing
    if (project.views && Array.isArray(project.views) && project.views.length > 0) {
        store.setViews(project.views);
    }

    // Apply active view
    if (project.activeViewId) {
        store.setActiveView(project.activeViewId);
    }

    // Apply panel sizes with defaults
    const panelSizes = project.panelSizes || {};
    if (typeof panelSizes.detailHeightPercent === 'number') {
        store.setDetailPanelHeightPercent(panelSizes.detailHeightPercent);
    }
    if (typeof panelSizes.watchWidthPercent === 'number') {
        store.setWatchPanelWidthPercent(panelSizes.watchWidthPercent);
    }

    // Apply panel visibility with defaults
    const panelVisibility = project.panelVisibility || {};
    if (typeof panelVisibility.showDetailPanel === 'boolean') {
        store.setShowDetailPanel(panelVisibility.showDetailPanel);
    }
    if (typeof panelVisibility.showWatchPanel === 'boolean') {
        store.setShowWatchPanel(panelVisibility.showWatchPanel);
    }
    if (typeof panelVisibility.showStreamPanel === 'boolean') {
        store.setShowStreamPanel(panelVisibility.showStreamPanel);
    }

    // Apply theme
    if (project.theme) {
        store.setTheme(project.theme);
    }

    // Apply limits with fallback to defaults for backward compatibility
    const limits = project.limits || {};
    store.setLimits({
        initialLoadLimit: limits.initialLoadLimit ?? defaultLimits.initialLoadLimit,
        maxBufferEntries: limits.maxBufferEntries ?? defaultLimits.maxBufferEntries,
        maxGridRows: limits.maxGridRows ?? defaultLimits.maxGridRows
    });
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

    // Project tracking state from global store (shared across components)
    const loadedProjectId = useLogStore(state => state.loadedProjectId);
    const loadedProjectDirty = useLogStore(state => state.loadedProjectDirty);
    const loadedProjectName = useLogStore(state => state.loadedProjectName);
    const setLoadedProjectId = useLogStore(state => state.setLoadedProjectId);
    const setLoadedProjectDirty = useLogStore(state => state.setLoadedProjectDirty);
    const setLoadedProjectName = useLogStore(state => state.setLoadedProjectName);

    // Refs
    const mountedRef = useRef(true);
    const saveTimeoutRef = useRef<number | null>(null);
    const initializedRef = useRef(false);
    const lastSavedRef = useRef<string>('');

    // Initialize on mount - load working project from localStorage
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const workingState = loadWorkingProject(currentRoom, currentUser);

        if (workingState) {
            console.log('[ProjectPersistence] Loaded working project from localStorage');
            applyProjectToStore(workingState.project);
            setLoadedProjectId(workingState.loadedProjectId);
            setLoadedProjectDirty(workingState.loadedProjectDirty);
            // Restore project name from saved state
            if (workingState.project?.name) {
                setLoadedProjectName(workingState.project.name);
            }

            // Update last saved to prevent immediate re-save
            lastSavedRef.current = JSON.stringify(workingState);
        } else {
            console.log('[ProjectPersistence] No working project found, using defaults');
        }
    }, [currentRoom, currentUser, setLoadedProjectId, setLoadedProjectDirty, setLoadedProjectName]);

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

    // Track skips - use counter to skip multiple effect runs during project load/reset
    const skipCountRef = useRef(0);

    // Use ref to track dirty state for effect without causing re-runs
    const loadedProjectDirtyRef = useRef(loadedProjectDirty);
    loadedProjectDirtyRef.current = loadedProjectDirty;

    // Use ref to track project ID for effect without causing re-runs when it changes
    const loadedProjectIdRef = useRef(loadedProjectId);
    loadedProjectIdRef.current = loadedProjectId;

    // Use ref for project name to avoid stale closures
    const loadedProjectNameRef = useRef(loadedProjectName);
    loadedProjectNameRef.current = loadedProjectName;

    // Schedule debounced save to localStorage - use refs to avoid dependency issues
    const scheduleSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            saveTimeoutRef.current = null;

            // Build working state using refs for tracking state
            const projectData = extractProjectFromStore();
            const state: WorkingProjectState = {
                project: {
                    id: 'working',
                    name: loadedProjectNameRef.current || 'Working Project',
                    description: 'Current editing state',
                    createdBy: currentUser,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isShared: false,
                    ...projectData
                },
                loadedProjectId: loadedProjectIdRef.current,
                loadedProjectDirty: loadedProjectDirtyRef.current
            };

            saveWorkingProject(currentRoom, currentUser, state);
            lastSavedRef.current = JSON.stringify(state);
            console.log('[ProjectPersistence] Auto-saved to localStorage, dirty:', loadedProjectDirtyRef.current);

            // Auto-save to server if enabled and project is loaded and dirty
            const settings = getSettings();
            if (settings.autoSaveProject && loadedProjectIdRef.current && loadedProjectDirtyRef.current) {
                try {
                    const response = await fetch(`/api/projects/${loadedProjectIdRef.current}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: projectData })
                    });

                    if (response.ok) {
                        // Clear dirty flag after successful save
                        setLoadedProjectDirty(false);
                        // Update localStorage with clean state
                        state.loadedProjectDirty = false;
                        saveWorkingProject(currentRoom, currentUser, state);
                        console.log('[ProjectPersistence] Auto-saved to server');
                    }
                } catch (err) {
                    console.error('[ProjectPersistence] Auto-save to server failed:', err);
                }
            }
        }, SAVE_DEBOUNCE_MS);
    }, [currentRoom, currentUser, setLoadedProjectDirty]);

    // Auto-save when relevant state changes (only saves to localStorage, doesn't mark dirty)
    useEffect(() => {
        // Skip if not initialized
        if (!initializedRef.current) {
            console.log('[ProjectPersistence] Effect skipped: not initialized');
            return;
        }

        // Skip if we're in the middle of loading/resetting a project
        if (skipCountRef.current > 0) {
            console.log('[ProjectPersistence] Effect skipped: skipCount =', skipCountRef.current);
            skipCountRef.current--;
            return;
        }

        console.log('[ProjectPersistence] Auto-save effect running');
        scheduleSave();
    }, [views, activeViewId, showDetailPanel, showWatchPanel, showStreamPanel,
        detailPanelHeightPercent, watchPanelWidthPercent, theme, scheduleSave]);

    // Helper function to mark project as dirty (exported for use by other actions)
    // Respects skipCount to avoid marking dirty during project load/reset
    const markDirty = useCallback(() => {
        // Skip if we're in the loading window (skipCount > 0)
        if (skipCountRef.current > 0) {
            console.log('[ProjectPersistence] markDirty skipped: skipCount =', skipCountRef.current);
            return;
        }
        if (loadedProjectIdRef.current && !loadedProjectDirtyRef.current) {
            console.log('[ProjectPersistence] Marking project as dirty:', loadedProjectIdRef.current);
            setLoadedProjectDirty(true);
        }
    }, [setLoadedProjectDirty]);

    // Load a named project from server
    const loadProject = useCallback(async (projectId: string) => {
        try {
            const response = await fetch(`/api/projects/${projectId}?room=${encodeURIComponent(currentRoom)}&user=${encodeURIComponent(currentUser)}`);
            if (!response.ok) {
                throw new Error(`Failed to load project: ${response.statusText}`);
            }

            const serverResponse = await response.json();

            // Server returns { id, name, projectData: { views, panelSizes, ... } }
            // We need to merge the name with projectData to create a full Project
            const project: Project = {
                name: serverResponse.name,
                ...serverResponse.projectData
            };

            // Apply to store - skip multiple effect runs during load
            // (views, activeView, panelSizes, panelVisibility, theme, projectId, dirty = ~7 changes)
            skipCountRef.current = 10;
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

            // Skip effect runs during state updates to prevent false dirty flag
            skipCountRef.current = 5;

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

            // Skip effect runs during state updates to prevent false dirty flag
            skipCountRef.current = 3;

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

        // Skip multiple effect runs during reset
        skipCountRef.current = 10;
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
        resetToDefault,
        markDirty  // Call this when user explicitly changes project state
    };
}
