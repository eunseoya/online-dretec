import Image from 'next/image';
import Link from 'next/link';

const navItems = [
    { linkText: 'Timer', href: '/' },
    { linkText: 'Stats', href: '/stats' },
    { linkText: 'History', href: '/history' },
    { linkText: 'Settings', href: '/settings' }
];

export function Header() {
    return (
        <nav className="flex flex-wrap items-center gap-4 pt-6 pb-6 sm:pt-12">
            <Link href="/">
                {/* Change logo later */}
                <Image
                    src="https://dretec.co.jp/upload/tenant_1/8dfb60644f232e7a88d153dfb8431ec9.png"
                    alt="dretec online logo"
                    width={120}
                    height={40}
                />
            </Link>
            {!!navItems?.length && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:inline-flex lg:ml-auto">
                    {navItems.map((item, index) => (
                        <li key={index}>
                            <Link href={item.href} className="inline-flex px-1.5 py-1 sm:px-3 sm:py-2">
                                {item.linkText}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </nav>
    );
}
