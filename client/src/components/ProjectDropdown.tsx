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
import { useLogStore, ProjectSummary } from '../store/logStore';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

// Density-based sizing configuration
const DENSITY_CONFIG = {
    compact: {
        buttonPy: 'py-0.5',
        buttonPx: 'px-1.5',
        buttonText: 'text-[11px]',
        folderIcon: 'w-3.5 h-3.5',
        chevronIcon: 'w-2.5 h-2.5',
        saveButtonPx: 'px-1',
        saveIcon: 'w-3.5 h-3.5',
        dropdownWidth: 'w-56',
        headerPy: 'py-1.5',
        headerPx: 'px-2',
        headerText: 'text-[10px]',
        itemPy: 'py-1.5',
        itemPx: 'px-2',
        itemIcon: 'w-3.5 h-3.5',
        itemText: 'text-xs',
        itemDescText: 'text-[10px]',
        actionIcon: 'w-3 h-3',
        footerPy: 'py-1.5',
        footerPx: 'px-1.5',
        footerText: 'text-[10px]',
        footerIcon: 'w-3.5 h-3.5',
        checkboxSize: 'w-2.5 h-2.5',
        checkmarkSize: 'w-1.5 h-1.5',
    },
    default: {
        buttonPy: 'py-1',
        buttonPx: 'px-2',
        buttonText: 'text-sm',
        folderIcon: 'w-4 h-4',
        chevronIcon: 'w-3 h-3',
        saveButtonPx: 'px-1.5',
        saveIcon: 'w-4 h-4',
        dropdownWidth: 'w-64',
        headerPy: 'py-2',
        headerPx: 'px-3',
        headerText: 'text-xs',
        itemPy: 'py-2',
        itemPx: 'px-3',
        itemIcon: 'w-4 h-4',
        itemText: 'text-sm',
        itemDescText: 'text-xs',
        actionIcon: 'w-3.5 h-3.5',
        footerPy: 'py-2',
        footerPx: 'px-2',
        footerText: 'text-xs',
        footerIcon: 'w-4 h-4',
        checkboxSize: 'w-3 h-3',
        checkmarkSize: 'w-2 h-2',
    },
    comfortable: {
        buttonPy: 'py-1.5',
        buttonPx: 'px-2.5',
        buttonText: 'text-sm',
        folderIcon: 'w-4 h-4',
        chevronIcon: 'w-3 h-3',
        saveButtonPx: 'px-1.5',
        saveIcon: 'w-4 h-4',
        dropdownWidth: 'w-72',
        headerPy: 'py-2.5',
        headerPx: 'px-4',
        headerText: 'text-xs',
        itemPy: 'py-2.5',
        itemPx: 'px-4',
        itemIcon: 'w-4 h-4',
        itemText: 'text-sm',
        itemDescText: 'text-xs',
        actionIcon: 'w-4 h-4',
        footerPy: 'py-2.5',
        footerPx: 'px-3',
        footerText: 'text-xs',
        footerIcon: 'w-4 h-4',
        checkboxSize: 'w-3.5 h-3.5',
        checkmarkSize: 'w-2.5 h-2.5',
    },
};

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
        exportProject,
        importProject
    } = useProjectPersistence();

    const { settings, updateSettings } = useSettings();
    const { rowDensity } = useLogStore();
    const density = DENSITY_CONFIG[rowDensity];

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

    const handleExportProject = async (e: React.MouseEvent) => {
        e.stopPropagation();
        exportProject();
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
        <div ref={dropdownRef} className={`relative flex items-center gap-1 ${className || ''}`}>
            {/* Dropdown trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 ${density.buttonPx} ${density.buttonPy} ${density.buttonText} text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors`}
            >
                <svg className={`${density.folderIcon} text-slate-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="max-w-[150px] truncate">{displayName}</span>
                <svg className={`${density.chevronIcon} text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Save button - only visible when there are unsaved changes (positioned after project name) */}
            {loadedProjectDirty && loadedProjectId && !settings.autoSaveProject && (
                <button
                    onClick={handleSaveProject}
                    className={`flex items-center gap-1 ${density.saveButtonPx} ${density.buttonPy} text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors`}
                    title="Save unsaved changes"
                >
                    <svg className={density.saveIcon} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h10l4 4v12a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v5h8V3" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l3 3 3-3" />
                    </svg>
                </button>
            )}

            {/* Dropdown menu */}
            {isOpen && (
                <div className={`absolute top-full left-0 mt-1 ${density.dropdownWidth} bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden`}>
                    {/* Header */}
                    <div className={`${density.headerPx} ${density.headerPy} bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700`}>
                        <div className={`${density.headerText} font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide`}>
                            Projects
                        </div>
                    </div>

                    {/* Project list - limited height with scroll */}
                    <div className="max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className={`${density.itemPx} py-4 text-center ${density.itemText} text-slate-400`}>
                                Loading...
                            </div>
                        ) : projects.length === 0 ? (
                            <div className={`${density.itemPx} py-4 text-center ${density.itemText} text-slate-400`}>
                                No saved projects
                            </div>
                        ) : (
                            projects.map(project => (
                                <div
                                    key={project.id}
                                    onClick={() => handleLoadProject(project.id)}
                                    className={`group flex items-center gap-2 ${density.itemPx} ${density.itemPy} cursor-pointer transition-colors ${
                                        loadedProjectId === project.id
                                            ? 'bg-blue-50 dark:bg-blue-900/30'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {project.isShared ? (
                                        <svg className={`${density.itemIcon} text-slate-400 flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    ) : (
                                        <svg className={`${density.itemIcon} text-slate-400 flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className={`${density.itemText} truncate ${
                                            loadedProjectId === project.id
                                                ? 'text-blue-600 dark:text-blue-400 font-medium'
                                                : 'text-slate-700 dark:text-slate-200'
                                        }`}>
                                            {project.name}
                                        </div>
                                        {project.description && (
                                            <div className={`${density.itemDescText} text-slate-400 truncate`}>
                                                {project.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Export button */}
                                        <button
                                            onClick={(e) => handleExportProject(e)}
                                            className="p-1 text-slate-400 hover:text-blue-500 transition-colors flex-shrink-0"
                                            title="Export project"
                                        >
                                            <svg className={density.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                        </button>
                                        {/* Delete button */}
                                        <button
                                            onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                                            className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            title="Delete project"
                                        >
                                            <svg className={density.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            <div className={`${density.itemPx} py-1.5 ${density.footerText} text-red-500 bg-red-50 dark:bg-red-900/20`}>
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
                                className={`flex-1 flex items-center justify-center gap-1 ${density.footerPx} ${density.footerPy} ${density.footerText} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
                                title="Create new empty project"
                            >
                                <svg className={density.footerIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                className={`flex-1 flex items-center justify-center gap-1 ${density.footerPx} ${density.footerPy} ${density.footerText} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
                                title="Save current configuration as new project"
                            >
                                <svg className={density.footerIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                                </svg>
                                <span>Save As</span>
                            </button>
                            <div className="w-px bg-slate-200 dark:bg-slate-600" />
                            {/* Import */}
                            <button
                                onClick={handleImportClick}
                                className={`flex-1 flex items-center justify-center gap-1 ${density.footerPx} ${density.footerPy} ${density.footerText} text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}
                                title="Import project from file"
                            >
                                <svg className={density.footerIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className={`w-full flex items-center gap-1.5 ${density.itemPx} py-1 ${density.footerText} text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-t border-slate-100 dark:border-slate-600`}
                            title="Automatically save changes"
                        >
                            <div className={`${density.checkboxSize} rounded border flex items-center justify-center transition-colors ${
                                settings.autoSaveProject
                                    ? 'bg-blue-500 border-blue-500'
                                    : 'border-slate-300 dark:border-slate-500'
                            }`}>
                                {settings.autoSaveProject && (
                                    <svg className={`${density.checkmarkSize} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
