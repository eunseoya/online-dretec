'use client';

import { useSession } from '../../contexts/SessionContext';

const TIMEZONE_OPTIONS = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Asia/Singapore', label: 'Singapore Standard Time (SGT)' },
    { value: 'Asia/Seoul', label: 'Korea Standard Time (KST)' },
    { value: 'Europe/Amsterdam', label: 'Central European Time (CET)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
];

export default function SettingsPage() {
    const { timezone, setTimezone } = useSession();

    const handleTimezoneChange = (event) => {
        setTimezone(event.target.value);
    };

    return (
        <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
                <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                        Time Zone
                    </label>
                    <select
                        id="timezone"
                        value={timezone}
                        onChange={handleTimezoneChange}
                        className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {TIMEZONE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <p className="text-gray-600">
                    {new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    })}
                </p>
            </div>
        </div>
    );
}
