'use client';

import { useSession } from '../../contexts/SessionContext';

export default function HistoryPage() {
    const { sessions, removeSession, clearSessions, timezone } = useSession();

    const formatEasternTime = (date) => {
        const options = {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const formatted = date.toLocaleString('en-US', options);
        const [datePart, timePart] = formatted.split(', ');
        const [month, day, year] = datePart.split('/');
        return `${year}.${month}.${day} ${timePart}`;
    };

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${remainingSeconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    };

    const formatTotalDuration = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white rounded-lg shadow p-6">
                {sessions.length === 0 ? (
                    <p className="text-gray-700">No session history yet.</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr>
                                        <th className="py-2 px-4 font-semibold">Date</th>
                                        <th className="py-2 px-4 font-semibold">Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((session) => (
                                        <tr key={session.id}>
                                            <td className="py-2 px-4">{formatEasternTime(session.startTime)}</td>
                                            <td className="py-2 px-4">{formatDuration(session.duration)}</td>
                                            <td className="py-2 ">
                                                <button
                                                    onClick={() => removeSession(session.id)}
                                                    className="text-red-500 hover:text-red-700 text-sm"
                                                    title="Delete session"
                                                >
                                                    X
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex justify-between">
                            <p className="text-gray-700 rounded text-sm">
                                Total:{' '}
                                {formatTotalDuration(sessions.reduce((total, session) => total + session.duration, 0))}
                            </p>
                            <p
                                onClick={clearSessions}
                                className=" text-red-600 rounded text-sm cursor-pointer hover:text-red-800"
                            >
                                Clear All
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
