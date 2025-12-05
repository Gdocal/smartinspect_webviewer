/**
 * AutoPauseNotification - Displays notifications when streams are auto-paused
 *
 * Shows a dismissible notification banner when streams are auto-paused due to high rate.
 * Allows quick resume of individual streams or all auto-paused streams.
 */

import { useLogStore } from '../store/logStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

export function AutoPauseNotification() {
    const { notifications, dismissNotification, clearNotifications, removeAutoPausedStream, addManualOverride } = useLogStore();
    const { resumeStream } = useWebSocket();

    // Filter to only show non-dismissed auto-pause notifications
    const activeNotifications = notifications.filter(n => !n.dismissed && n.type === 'warning' && n.channel);

    if (activeNotifications.length === 0) return null;

    const handleResumeStream = (channel: string, notificationId: string) => {
        resumeStream(channel);
        removeAutoPausedStream(channel);
        addManualOverride(channel);  // Prevent re-pausing
        dismissNotification(notificationId);
    };

    const handleResumeAll = () => {
        for (const notification of activeNotifications) {
            if (notification.channel) {
                resumeStream(notification.channel);
                removeAutoPausedStream(notification.channel);
                addManualOverride(notification.channel);
            }
        }
        clearNotifications();
    };

    const handleDismissAll = () => {
        clearNotifications();
    };

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {activeNotifications.slice(0, 5).map(notification => (
                <div
                    key={notification.id}
                    className="bg-amber-50 dark:bg-amber-900/80 border border-amber-200 dark:border-amber-700 rounded-lg shadow-lg p-3 animate-slide-in"
                >
                    <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                {notification.message}
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                            </p>
                        </div>
                        <button
                            onClick={() => dismissNotification(notification.id)}
                            className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {notification.channel && (
                        <div className="mt-2 flex gap-2">
                            <button
                                onClick={() => handleResumeStream(notification.channel!, notification.id)}
                                className="flex-1 px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 rounded hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors"
                            >
                                Resume Stream
                            </button>
                        </div>
                    )}
                </div>
            ))}

            {/* Show count and actions if more than 5 notifications */}
            {activeNotifications.length > 5 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    +{activeNotifications.length - 5} more notifications
                </div>
            )}

            {/* Bulk actions */}
            {activeNotifications.length > 1 && (
                <div className="flex gap-2 mt-1">
                    <button
                        onClick={handleResumeAll}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/80 transition-colors"
                    >
                        Resume All ({activeNotifications.length})
                    </button>
                    <button
                        onClick={handleDismissAll}
                        className="flex-1 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                        Dismiss All
                    </button>
                </div>
            )}
        </div>
    );
}
