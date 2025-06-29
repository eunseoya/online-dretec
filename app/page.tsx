import Link from 'next/link';
import { Card } from 'components/card';
import { Timer } from 'components/timer';

export default function Page() {
    return (
        <div className="flex flex-col gap-12 sm:gap-16">
            <section>
                <Timer />
            </section>
        </div>
    );
}
