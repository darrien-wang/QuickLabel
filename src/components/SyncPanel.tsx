import React, { useState, useEffect } from 'react';
import { Wifi, Server, Monitor, Power, CheckCircle, XCircle } from 'lucide-react';

interface SyncPanelProps {
    onModeChange: (mode: 'standalone' | 'host' | 'client') => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({ onModeChange }) => {
    const [mode, setMode] = useState<'standalone' | 'host' | 'client'>('standalone');
    const [hostIp, setHostIp] = useState<string>('');
    const [targetIp, setTargetIp] = useState<string>('');
    const [status, setStatus] = useState<string>('');
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load Host IP on mount
    // Load Host IP and Status on mount
    useEffect(() => {
        const loadStatus = async () => {
            if (window.electronAPI?.getLanStatus) {
                const status = await window.electronAPI.getLanStatus();
                console.log('Restoring LAN status:', status);

                setMode(status.mode);
                onModeChange(status.mode);
                setIsConnected(status.isConnected);

                if (status.mode === 'host') {
                    setHostIp(status.ip || '');
                    setStatus(`Hosting on ${status.ip}:${status.port}`);
                } else if (status.mode === 'client') {
                    setTargetIp(status.targetIp || '');
                    if (status.isConnected) {
                        setStatus('Connected to Host');
                        // Reloaded page? Re-sync data from host
                        console.log('Restoration: Requesting fresh sync data...');
                        window.electronAPI.requestSync?.();
                    }
                } else {
                    // Standalone, just load local IP for display if needed
                    if (window.electronAPI?.getLocalIp) {
                        const ip = await window.electronAPI.getLocalIp();
                        setHostIp(ip);
                    }
                }
            }
        };
        loadStatus();
    }, []);

    const startHost = async () => {
        setError(null);
        setStatus('Starting host...');
        try {
            const result = await window.electronAPI?.startHost();
            if (result && result.success) {
                setMode('host');
                onModeChange('host');
                setStatus(`Hosting on ${result.ip}:${result.port}`);
                setHostIp(result.ip || '');
                setIsConnected(true);
            } else {
                setError(result?.error || 'Failed to start host');
                setStatus('');
            }
        } catch (err: any) {
            setError(err.message);
            setStatus('');
        }
    };

    const stopHost = async () => {
        await window.electronAPI?.stopHost();
        setMode('standalone');
        onModeChange('standalone');
        setIsConnected(false);
        setStatus('');
    };

    const connectToHost = async () => {
        if (!targetIp) return;
        setError(null);
        setStatus(`Connecting to ${targetIp}...`);
        try {
            const result = await window.electronAPI?.connectToHost(targetIp);
            if (result && result.success) {
                setMode('client');
                onModeChange('client');
                // Status updated via event
            } else {
                setError(result?.error || 'Failed to connect');
                setStatus('');
            }
        } catch (err: any) {
            setError(err.message);
            setStatus('');
        }
    };

    const disconnectClient = async () => {
        await window.electronAPI?.disconnectFromHost();
        setMode('standalone');
        onModeChange('standalone');
        setIsConnected(false);
        setStatus('');
    };

    // Listen for connection events
    useEffect(() => {
        if (!window.electronAPI) return;

        window.electronAPI.onHostConnected(() => {
            setIsConnected(true);
            setStatus('Connected to Host');
        });

        window.electronAPI.onHostConnectionError((err: string) => {
            setIsConnected(false);
            setError(err);
            setStatus('Connection Failed');
        });

        // Cleanup listeners? Not easily possible with current API structure (listeners pile up if not careful), 
        // but in this app component is likely persistent or we can ignore for now.
        // Ideally we return a cleanup function or API returns an unlisten function.
        // For now assuming App.tsx handles global listeners or we just add them once.
        // Actually, React strict mode might double add. 
        // It's better to move listeners to App.tsx and pass status down, but for simplicity we keep basic logic here.

    }, []);

    const handleModeChange = async (newMode: 'standalone' | 'host' | 'client') => {
        if (mode === newMode) return;

        // Cleanup current mode
        if (mode === 'host') {
            await window.electronAPI?.stopHost();
        } else if (mode === 'client') {
            await window.electronAPI?.disconnectFromHost();
        }

        // Set new mode (backend state)
        // Note: For 'host' and 'client', the actual state is set upon successful start/connect
        // But for UI purpose, we reset connection state here
        setIsConnected(false);
        setStatus('');
        setError(null);

        // If switching TO standalone, we are done
        if (newMode === 'standalone') {
            setMode('standalone');
            onModeChange('standalone');
        } else {
            // For Host/Client, we update UI mode immediately to show controls
            setMode(newMode);
            onModeChange(newMode);
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center gap-2 mb-4">
                <Wifi className="text-blue-500" size={24} />
                <h2 className="text-xl font-bold text-gray-800">LAN Synchronization</h2>
            </div>

            <div className="flex gap-4">
                {/* Mode Selection */}
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => handleModeChange('standalone')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${mode === 'standalone' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Standalone
                    </button>
                    <button
                        onClick={() => handleModeChange('host')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${mode === 'host' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Host Mode
                    </button>
                    <button
                        onClick={() => handleModeChange('client')}
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${mode === 'client' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Client Mode
                    </button>
                </div>
            </div>

            {/* Host Control */}
            {mode === 'host' && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <Server size={18} />
                                Host Server
                            </h3>
                            <p className="text-sm text-blue-700 mt-1">
                                Other devices can connect to: <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-200 select-all">{hostIp}</span>
                            </p>
                        </div>
                        {!isConnected ? (
                            <button
                                onClick={startHost}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                            >
                                <Power size={18} />
                                Start Hosting
                            </button>
                        ) : (
                            <button
                                onClick={stopHost}
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <Power size={18} />
                                Stop Hosting
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Client Control */}
            {mode === 'client' && (
                <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-green-800 uppercase mb-1">Host IP Address</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. 192.168.1.100"
                                    value={targetIp}
                                    onChange={(e) => setTargetIp(e.target.value)}
                                    disabled={isConnected}
                                    className="flex-1 border border-green-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                />
                                {!isConnected ? (
                                    <button
                                        onClick={connectToHost}
                                        disabled={!targetIp}
                                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Monitor size={18} />
                                        Connect
                                    </button>
                                ) : (
                                    <button
                                        onClick={disconnectClient}
                                        className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                                    >
                                        <XCircle size={18} />
                                        Disconnect
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Bar */}
            {(status || error) && (
                <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {error ? <XCircle size={16} /> : <CheckCircle size={16} />}
                    <span className="font-medium">{error || status}</span>
                </div>
            )}
        </div>
    );
};
