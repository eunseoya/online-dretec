'use client';

import { useSession } from '../../contexts/SessionContext';

export default function StatsPage() {
    const { sessions } = useSession();

    const calculateStats = () => {
        const totalSessions = sessions.length;
        const totalTime = sessions.reduce((acc, session) => {
            // Convert all durations to seconds for consistent calculation
            const durationInSeconds =
                session.formattedDuration.includes('M') &&
                session.formattedDuration.includes('S') &&
                !session.formattedDuration.includes('H')
                    ? Math.floor(session.duration / 100) // Convert from centiseconds to seconds
                    : session.duration; // Already in seconds
            return acc + durationInSeconds;
        }, 0);

        const averageTime = totalSessions > 0 ? totalTime / totalSessions : 0;

        return { totalSessions, totalTime, averageTime };
    };

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600)
            .toString()
            .padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60)
            .toString()
            .padStart(2, '0');
        const s = Math.floor(seconds % 60)
            .toString()
            .padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const stats = calculateStats();

    return (
        <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className=" p-4 rounded-lg text-center">
                        <div className="text-2xl">{stats.totalSessions}</div>
                        <div className="text-sm text-gray-600">Total Sessions</div>
                    </div>
                    <div className="p-4 rounded-lg text-center">
                        <div className="text-2xl">{formatTime(stats.totalTime)}</div>
                        <div className="text-sm text-gray-600">Total Time</div>
                    </div>
                    <div className="p-4 rounded-lg text-center">
                        <div className="text-2xl">{formatTime(stats.averageTime)}</div>
                        <div className="text-sm text-gray-600">Average Session</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
