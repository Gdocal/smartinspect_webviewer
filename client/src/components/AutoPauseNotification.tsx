/**
 * AutoPauseNotification - Displays notifications when streams are auto-paused
 *
 * DISABLED: Toast notifications are now replaced by inline status indicators
 * in the StreamsView left panel. The stream list shows paused streams with
 * amber styling and a play button to resume.
 *
 * Keeping this component for backwards compatibility but returning null.
 */

export function AutoPauseNotification() {
    // DISABLED: Return null - pause status is now shown inline in StreamsView
    return null;
}
