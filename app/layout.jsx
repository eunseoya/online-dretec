import '../styles/globals.css';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { SessionProvider } from '../contexts/SessionContext';

export const metadata = {
    title: {
        template: '%s | dretec online',
        default: 'dretec online'
    }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link
                    rel="icon"
                    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⏱️</text></svg>"
                />{' '}
            </head>
            <SessionProvider>
                <body className="antialiased text-black bg-white">
                    <div className="flex flex-col min-h-screen px-6 bg-noise sm:px-12">
                        <div className="flex flex-col w-full max-w-5xl mx-auto grow">
                            <Header />
                            <main className="grow">{children}</main>
                            <Footer />
                        </div>
                    </div>
                </body>
            </SessionProvider>
        </html>
    );
}
