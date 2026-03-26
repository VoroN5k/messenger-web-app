// client/src/components/ui/BackgroundFx.tsx
'use client';

export function GridLines() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]" style={{
            backgroundImage: `linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
        }} />
    );
}

export function BackgroundOrbs() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="absolute rounded-full" style={{
                width: 600, height: 600,
                background: 'radial-gradient(circle, rgba(109,40,217,0.2) 0%, transparent 65%)',
                top: '-200px', right: '-150px', filter: 'blur(50px)',
                animation: 'oA 24s ease-in-out infinite',
            }} />
            <div className="absolute rounded-full" style={{
                width: 500, height: 500,
                background: 'radial-gradient(circle, rgba(79,70,229,0.16) 0%, transparent 65%)',
                bottom: '-100px', left: '-100px', filter: 'blur(40px)',
                animation: 'oB 30s ease-in-out infinite',
            }} />
            <style jsx>{`
                @keyframes oA { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-40px,50px)} }
                @keyframes oB { 0%,100%{transform:translate(0,0)} 50%{transform:translate(35px,-35px)} }
            `}</style>
        </div>
    );
}

export function NoiseOverlay() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.022]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px',
        }} />
    );
}