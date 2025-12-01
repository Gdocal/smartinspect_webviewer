/**
 * ProjectDropdown - Header dropdown for project selection
 *
 * Allows users to:
 * - See the current project name (with dirty indicator)
 * - Save current state as a new project
 * - Load a named project
 * - Manage projects (edit, delete)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectPersistence } from '../hooks/useProjectPersistence';
import { useSettings } from '../hooks/useSettings';
import { ProjectSummary } from '../store/logStore';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

interface ProjectDropdownProps {
    className?: string;
}

export function ProjectDropdown({ className }: ProjectDropdownProps) {
    const {
        loadedProjectId,
        loadedProjectName,
        loadedProjectDirty,
        loadProject,
        saveAsNewProject,
        updateProject,
        listProjects,
        deleteProject,
        resetToDefault,
        exportProjectById,
        importProject
    } = useProjectPersistence();

    const { settings, updateSettings } = useSettings();

    const [isOpen, setIsOpen] = useState(false);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const confirmDialog = useConfirmDialog();

    // Load projects when dropdown opens
    const loadProjectsList = useCallback(async () => {
        setIsLoading(true);
        const result = await listProjects();
        if (result.success) {
            setProjects(result.projects);
        }
        setIsLoading(false);
    }, [listProjects]);

    useEffect(() => {
        if (isOpen) {
            loadProjectsList();
        }
    }, [isOpen, loadProjectsList]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Don't close if clicking on a dialog/modal
            const target = event.target as HTMLElement;
            if (target.closest('[role="dialog"]') || target.closest('.fixed.inset-0')) {
                return;
            }

            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Check for unsaved changes before destructive actions
    const checkUnsavedChanges = useCallback(async (): Promise<'save' | 'discard' | 'cancel'> => {
        if (!loadedProjectDirty || settings.autoSaveProject) {
            return 'discard'; // No unsaved changes or auto-save handles it
        }

        const result = await confirmDialog.confirm({
            title: 'Unsaved Changes',
            message: 'You have unsaved changes. What would you like to do?',
            confirmText: 'Save & Continue',
            cancelText: 'Discard',
            danger: false
        });

        if (result === null) {
            return 'cancel'; // Dialog was dismissed
        }
        return result ? 'save' : 'discard';
    }, [loadedProjectDirty, settings.autoSaveProject, confirmDialog]);

    const handleLoadProject = async (projectId: string) => {
        // Check for unsaved changes first
        if (loadedProjectDirty && !settings.autoSaveProject && loadedProjectId) {
            const action = await checkUnsavedChanges();
            if (action === 'cancel') return;
            if (action === 'save') {
                await updateProject(loadedProjectId);
            }
        }

        const result = await loadProject(projectId);
        if (result.success) {
            setIsOpen(false);
        }
    };

    const handleSaveProject = async () => {
        if (loadedProjectId) {
            // Update existing project
            const result = await updateProject(loadedProjectId);
            if (result.success) {
                setIsOpen(false);
            }
        }
    };

    const handleSaveAsNew = async () => {
        if (!newProjectName.trim()) {
            setSaveError('Please enter a project name');
            return;
        }

        setSaveError(null);

        // If creating new project, check for unsaved changes first
        if (isCreatingNew && loadedProjectDirty && !settings.autoSaveProject && loadedProjectId) {
            const action = await checkUnsavedChanges();
            if (action === 'cancel') return;
            if (action === 'save') {
                await updateProject(loadedProjectId);
            }
            // Reset to default after handling unsaved changes
            resetToDefault();
        } else if (isCreatingNew) {
            resetToDefault();
        }

        const result = await saveAsNewProject(newProjectName.trim());
        if (result.success) {
            setShowSaveDialog(false);
            setNewProjectName('');
            setIsCreatingNew(false);
            setIsOpen(false);
        } else {
            setSaveError(result.error || 'Failed to save project');
        }
    };

    const handleDeleteProject = async (e: React.MouseEvent, projectId: string, projectName: string) => {
        e.stopPropagation();
        const confirmed = await confirmDialog.confirm({
            title: 'Delete Project',
            message: `Are you sure you want to delete "${projectName}"?`,
            confirmText: 'OK',
            cancelText: 'Cancel',
            danger: true
        });
        if (confirmed) {
            await deleteProject(projectId);
            await loadProjectsList();
        }
    };

    const handleExportProject = async (e: React.MouseEvent, projectId: string, projectName: string) => {
        e.stopPropagation();
        await exportProjectById(projectId, projectName);
    };

    const handleImportClick = () => {
        setImportError(null);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const result = await importProject(file);
        if (result.success) {
            setIsOpen(false);
            setImportError(null);
        } else {
            setImportError(result.error || 'Failed to import project');
        }

        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const displayName = loadedProjectName || 'Working Project';

    return (
        <div ref={dropdownRef} className={`relative ${className || ''}`}>
            {/* Dropdown trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 py-1 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="max-w-[150px] truncate">{displayName}</span>
                <svg className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Save button - only visible when there are unsaved changes */}
            {loadedProjectDirty && loadedProjectId && !settings.autoSaveProject && (
                <button
                    onClick={handleSaveProject}
                    className="flex items-center gap-1 px-2 py-1 text-sm text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors"
                    title="Save unsaved changes"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3v4a1 1 0 001 1h3" />
                    </svg>
                </button>
            )}

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Projects
                        </div>
                    </div>

                    {/* Project list - limited height with scroll */}
                    <div className="max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className="px-3 py-4 text-center text-sm text-slate-400">
                                Loading...
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="px-3 py-4 text-center text-sm text-slate-400">
                                No saved projects
                            </div>
                        ) : (
                            projects.map(project => (
                                <div
                                    key={project.id}
                                    onClick={() => handleLoadProject(project.id)}
                                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                                        loadedProjectId === project.id
                                            ? 'bg-blue-50 dark:bg-blue-900/30'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {project.isShared ? (
                                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm truncate ${
                                            loadedProjectId === project.id
                                                ? 'text-blue-600 dark:text-blue-400 font-medium'
                                                : 'text-slate-700 dark:text-slate-200'
                                        }`}>
                                            {project.name}
                                        </div>
                                        {project.description && (
                                            <div className="text-xs text-slate-400 truncate">
                                                {project.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Export button */}
                                        <button
                                            onClick={(e) => handleExportProject(e, project.id, project.name)}
                                            className="p-1 text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
                                            title="Export project"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                        </button>
                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                                            className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            title="Delete project"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className="border-t border-slate-200 dark:border-slate-700">
                        {importError && (
                            <div className="px-3 py-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-900/20">
                                {importError}
                            </div>
                        )}
                        {/* Action buttons row */}
                        <div className="flex">
                            {/* New Project */}
                            <button
                                onClick={() => {
                                    setNewProjectName('');
                                    setIsCreatingNew(true);
                                    setShowSaveDialog(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                title="Create new empty project"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>New</span>
                            </button>
                            <div className="w-px bg-slate-200 dark:bg-slate-600" />
                            {/* Save As */}
                            <button
                                onClick={() => {
                                    setIsCreatingNew(false);
                                    setShowSaveDialog(true);
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                title="Save current configuration as new project"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                                </svg>
                                <span>Save As</span>
                            </button>
                            <div className="w-px bg-slate-200 dark:bg-slate-600" />
                            {/* Import */}
                            <button
                                onClick={handleImportClick}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                title="Import project from file"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Import</span>
                            </button>
                        </div>
                        {/* Auto-save toggle - compact row */}
                        <button
                            onClick={async () => {
                                const newAutoSave = !settings.autoSaveProject;
                                updateSettings({ autoSaveProject: newAutoSave });
                                if (newAutoSave && loadedProjectId && loadedProjectDirty) {
                                    await updateProject(loadedProjectId);
                                }
                            }}
                            className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-t border-slate-100 dark:border-slate-600"
                            title="Automatically save changes"
                        >
                            <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                                settings.autoSaveProject
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-slate-300 dark:border-slate-500'
                            }`}>
                                {settings.autoSaveProject && (
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <span>Auto-save changes</span>
                        </button>
                        {/* Hidden file input for import */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".siwv,.json"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>
                </div>
            )}

            {/* Save As / New Project Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-80 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                            <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                                {isCreatingNew ? 'New Project' : 'Save Project As'}
                            </h3>
                        </div>
                        <div className="p-4">
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                Project Name
                            </label>
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSaveAsNew();
                                    }
                                }}
                                placeholder="My Project"
                                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                autoFocus
                            />
                            {saveError && (
                                <div className="mt-2 text-xs text-red-500">
                                    {saveError}
                                </div>
                            )}
                        </div>
                        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowSaveDialog(false);
                                    setNewProjectName('');
                                    setIsCreatingNew(false);
                                    setSaveError(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAsNew}
                                className="px-4 py-2 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
                            >
                                {isCreatingNew ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Dialog */}
            {confirmDialog.dialogProps && (
                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    onConfirm={confirmDialog.handleConfirm}
                    onCancel={confirmDialog.handleCancel}
                    {...confirmDialog.dialogProps}
                />
            )}
        </div>
    );
}
