import { useState, useEffect, useMemo } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [dismissed, setDismissed] = useState(() => {
        return localStorage.getItem('pwa-install-dismissed') === 'true';
    });

    // Detect if we're on localhost or an IP address
    const installInfo = useMemo(() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

        return {
            isLocalhost,
            isIP,
            hostname,
            // Instructions vary based on access method
            instructions: isIP
                ? 'Menu (⋮) → Save and share → Install...'
                : isLocalhost
                    ? 'Click the install icon in the address bar'
                    : 'Install via browser menu'
        };
    }, []);

    useEffect(() => {
        // Check if already installed (standalone mode or minimal-ui for installed apps)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
        // Also check navigator.standalone for iOS
        const isIOSStandalone = (navigator as { standalone?: boolean }).standalone === true;

        if (isStandalone || isMinimalUI || isIOSStandalone) {
            setIsInstalled(true);
            return;
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Store the event so it can be triggered later
            setInstallPrompt(e as BeforeInstallPromptEvent);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setInstallPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const install = async () => {
        if (!installPrompt) return false;

        // Show the install prompt
        await installPrompt.prompt();

        // Wait for the user to respond
        const { outcome } = await installPrompt.userChoice;

        if (outcome === 'accepted') {
            setInstallPrompt(null);
            return true;
        }

        return false;
    };

    const dismissHint = () => {
        setDismissed(true);
        localStorage.setItem('pwa-install-dismissed', 'true');
    };

    return {
        canInstall: !!installPrompt && !isInstalled,
        isInstalled,
        install,
        // For showing install hint banner
        showInstallHint: !isInstalled && !dismissed && installInfo.isIP,
        installInfo,
        dismissHint
    };
}
