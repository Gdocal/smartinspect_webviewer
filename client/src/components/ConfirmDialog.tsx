/**
 * ConfirmDialog - Enterprise-grade confirmation dialog component
 *
 * Features:
 * - Portal-based rendering (renders at document body level)
 * - Keyboard support (Escape to cancel, Enter to confirm)
 * - Focus trap within dialog
 * - Accessible (ARIA attributes, focus management)
 * - Customizable title, message, button text
 * - Danger/destructive action styling
 * - Backdrop click to cancel
 * - Smooth animations
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    // Focus management - focus cancel button on open (safer default)
    useEffect(() => {
        if (isOpen) {
            // Small delay to ensure dialog is rendered
            const timeoutId = setTimeout(() => {
                cancelButtonRef.current?.focus();
            }, 0);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen]);

    // Keyboard handling
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'Escape':
                    event.preventDefault();
                    onCancel();
                    break;
                case 'Enter':
                    // Only trigger confirm if focus is on confirm button
                    if (document.activeElement === confirmButtonRef.current) {
                        event.preventDefault();
                        onConfirm();
                    }
                    break;
                case 'Tab':
                    // Focus trap - keep focus within dialog
                    if (event.shiftKey) {
                        if (document.activeElement === cancelButtonRef.current) {
                            event.preventDefault();
                            confirmButtonRef.current?.focus();
                        }
                    } else {
                        if (document.activeElement === confirmButtonRef.current) {
                            event.preventDefault();
                            cancelButtonRef.current?.focus();
                        }
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onConfirm, onCancel]);

    // Prevent body scroll when dialog is open
    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen]);

    const handleBackdropClick = useCallback((event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            onCancel();
        }
    }, [onCancel]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 dark:bg-black/70 transition-opacity"
                onClick={handleBackdropClick}
            />

            {/* Dialog */}
            <div
                ref={dialogRef}
                className="relative bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full mx-4 transform transition-all"
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-2">
                    <h2
                        id="confirm-dialog-title"
                        className={`text-lg font-semibold ${
                            danger
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-900 dark:text-slate-100'
                        }`}
                    >
                        {title}
                    </h2>
                </div>

                {/* Body */}
                <div className="px-6 py-4">
                    <p
                        id="confirm-dialog-message"
                        className="text-sm text-slate-600 dark:text-slate-300"
                    >
                        {message}
                    </p>
                </div>

                {/* Footer - For danger dialogs, Cancel is on right and more prominent to prevent accidental destructive actions */}
                <div className="px-6 pb-6 pt-2 flex justify-end gap-3">
                    {danger ? (
                        <>
                            {/* Danger: destructive action on left (red text), Cancel on right (neutral) */}
                            <button
                                ref={confirmButtonRef}
                                type="button"
                                onClick={onConfirm}
                                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-slate-100 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                            >
                                {confirmText}
                            </button>
                            <button
                                ref={cancelButtonRef}
                                type="button"
                                onClick={onCancel}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                            >
                                {cancelText}
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Non-danger: standard layout - Cancel on left, Confirm on right */}
                            <button
                                ref={cancelButtonRef}
                                type="button"
                                onClick={onCancel}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                            >
                                {cancelText}
                            </button>
                            <button
                                ref={confirmButtonRef}
                                type="button"
                                onClick={onConfirm}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                            >
                                {confirmText}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// Hook for managing confirm dialog with Promise-based API
export interface UseConfirmDialogReturn {
    isOpen: boolean;
    dialogProps: ConfirmDialogOptions | null;
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
    handleConfirm: () => void;
    handleCancel: () => void;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
    const [isOpen, setIsOpen] = useState(false);
    const [dialogProps, setDialogProps] = useState<ConfirmDialogOptions | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setDialogProps(options);
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        resolveRef.current?.(true);
        resolveRef.current = null;
    }, []);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        resolveRef.current?.(false);
        resolveRef.current = null;
    }, []);

    return {
        isOpen,
        dialogProps,
        confirm,
        handleConfirm,
        handleCancel,
    };
}
