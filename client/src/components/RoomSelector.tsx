/**
 * RoomSelector - Dropdown to switch between rooms (log namespaces)
 */

import { useState, useRef, useEffect } from 'react';
import { useLogStore } from '../store/logStore';
import { getSettings } from '../hooks/useSettings';
import { Tooltip } from './Tooltip';

export function RoomSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [showNewRoomInput, setShowNewRoomInput] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentRoom = useLogStore(state => state.currentRoom);
    const availableRooms = useLogStore(state => state.availableRooms);
    const roomSwitching = useLogStore(state => state.roomSwitching);
    const connected = useLogStore(state => state.connected);
    const switchRoom = useLogStore(state => state.switchRoom);
    const setAvailableRooms = useLogStore(state => state.setAvailableRooms);

    // Button is disabled when not connected or during room switch
    const isDisabled = !connected || roomSwitching;

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setShowNewRoomInput(false);
                setNewRoomName('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close dropdown when disconnected
    useEffect(() => {
        if (!connected) {
            setIsOpen(false);
            setShowNewRoomInput(false);
            setNewRoomName('');
        }
    }, [connected]);

    // Fetch available rooms from server - only when connected
    useEffect(() => {
        if (!connected) return;

        async function fetchRooms() {
            try {
                const settings = getSettings();
                const headers: Record<string, string> = {};
                if (settings.authToken) {
                    headers['Authorization'] = `Bearer ${settings.authToken}`;
                }
                const response = await fetch('/api/rooms', { headers });
                if (!response.ok) {
                    console.error('[RoomSelector] Failed to fetch rooms:', response.status);
                    return;
                }
                const data = await response.json();
                if (data.rooms && Array.isArray(data.rooms)) {
                    setAvailableRooms(data.rooms);
                }
            } catch (err) {
                console.error('[RoomSelector] Failed to fetch rooms:', err);
            }
        }
        fetchRooms();
        // Refresh every 30 seconds while connected
        const interval = setInterval(fetchRooms, 30000);
        return () => clearInterval(interval);
    }, [connected, setAvailableRooms]);

    const handleRoomSelect = (room: string) => {
        if (room !== currentRoom) {
            switchRoom(room);
        }
        setIsOpen(false);
    };

    const handleCreateRoom = () => {
        const trimmedName = newRoomName.trim();
        if (trimmedName && !availableRooms.includes(trimmedName)) {
            // Add the new room to available rooms and switch to it
            setAvailableRooms([...availableRooms, trimmedName]);
            switchRoom(trimmedName);
        }
        setNewRoomName('');
        setShowNewRoomInput(false);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreateRoom();
        } else if (e.key === 'Escape') {
            setShowNewRoomInput(false);
            setNewRoomName('');
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Room button */}
            <Tooltip
                content={!connected ? "Connect first" : "Switch room"}
                position="top"
                disabled={isOpen}
            >
                <button
                    onClick={() => !isDisabled && setIsOpen(!isOpen)}
                    disabled={isDisabled}
                    className={`
                        flex items-center gap-1.5 px-2 py-0.5 rounded
                        text-slate-300 transition-colors text-xs
                        ${isDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:text-slate-100 hover:bg-slate-700/50'}
                    `}
                >
                    {/* Room icon */}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="font-medium">{currentRoom}</span>
                    {roomSwitching ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    ) : (
                        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </button>
            </Tooltip>

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-slate-700 rounded-lg shadow-lg border border-slate-600 min-w-[180px] py-1 z-50">
                    <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        Rooms
                    </div>

                    {/* Room list */}
                    <div className="max-h-48 overflow-y-auto">
                        {availableRooms.map(room => (
                            <button
                                key={room}
                                onClick={() => handleRoomSelect(room)}
                                className={`
                                    w-full px-3 py-1.5 text-left text-xs
                                    flex items-center gap-2
                                    ${room === currentRoom
                                        ? 'bg-blue-600/30 text-blue-300'
                                        : 'text-slate-200 hover:bg-slate-600/50'
                                    }
                                `}
                            >
                                {room === currentRoom && (
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                    </svg>
                                )}
                                <span className={room === currentRoom ? '' : 'ml-5'}>{room}</span>
                            </button>
                        ))}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-slate-600 my-1" />

                    {/* New room input or button */}
                    {showNewRoomInput ? (
                        <div className="px-2 py-1">
                            <input
                                type="text"
                                value={newRoomName}
                                onChange={(e) => setNewRoomName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Room name..."
                                className="w-full px-2 py-1 text-xs bg-slate-600 text-slate-100 rounded border border-slate-500 focus:border-blue-500 focus:outline-none"
                                autoFocus
                            />
                            <div className="flex gap-1 mt-1">
                                <button
                                    onClick={handleCreateRoom}
                                    disabled={!newRoomName.trim()}
                                    className="flex-1 px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Create
                                </button>
                                <button
                                    onClick={() => {
                                        setShowNewRoomInput(false);
                                        setNewRoomName('');
                                    }}
                                    className="flex-1 px-2 py-1 text-[10px] bg-slate-600 text-slate-300 rounded hover:bg-slate-500"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowNewRoomInput(true)}
                            className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-600/50 flex items-center gap-2"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                            </svg>
                            New Room...
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
