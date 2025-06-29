'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LogEntry {
    id: string;
    startTime: Date;
    duration: number;
    formattedDuration: string;
}

interface SessionContextType {
    sessions: LogEntry[];
    addSession: (session: LogEntry) => void;
    clearSessions: () => void;
    removeSession: (id: string) => void;
    timezone: string;
    setTimezone: (timezone: string) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const [sessions, setSessions] = useState<LogEntry[]>([]);
    const [timezone, setTimezone] = useState('America/New_York');

    const addSession = (session: LogEntry) => {
        setSessions((prev) => [session, ...prev]);
    };

    const clearSessions = () => {
        setSessions([]);
    };

    const removeSession = (id: string) => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
    };

    return (
        <SessionContext.Provider
            value={{
                sessions,
                addSession,
                clearSessions,
                removeSession,
                timezone,
                setTimezone
            }}
        >
            {children}
        </SessionContext.Provider>
    );
};
