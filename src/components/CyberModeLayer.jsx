import { useEffect, useMemo, useRef } from 'react';

const PARTICLE_COLORS = [
  'rgba(245, 202, 114, 0.95)',
  'rgba(217, 163, 71, 0.88)',
  'rgba(255, 231, 179, 0.82)',
  'rgba(180, 112, 41, 0.78)',
];

const buildParticles = () =>
  Array.from({ length: 24 }, (_, index) => ({
    id: `particle-${index}`,
    left: `${(index * 17 + 9) % 100}%`,
    top: `${(index * 29 + 7) % 100}%`,
    size: `${3 + ((index * 7) % 8)}px`,
    duration: `${15 + (index % 6) * 2.2}s`,
    delay: `${(index % 5) * -1.05}s`,
    driftX: `${(index % 2 === 0 ? 1 : -1) * (10 + (index % 4) * 5)}px`,
    driftY: `${22 + (index % 7) * 9}px`,
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
  }));

const CyberModeLayer = ({ showcaseEnabled = false }) => {
  const particles = useMemo(buildParticles, []);
  const layerRef = useRef(null);

  useEffect(() => {
    const node = layerRef.current;
    if (!node) return undefined;
    const media = window.matchMedia('(pointer: fine)');
    if (!media.matches) return undefined;
    let frameId = 0;

    const updatePointer = (clientX, clientY) => {
      const x = `${(clientX / window.innerWidth) * 100}%`;
      const y = `${(clientY / window.innerHeight) * 100}%`;
      node.style.setProperty('--pointer-x', x);
      node.style.setProperty('--pointer-y', y);
    };

    updatePointer(window.innerWidth * 0.62, window.innerHeight * 0.24);

    const handleMove = (event) => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updatePointer(event.clientX, event.clientY);
      });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div ref={layerRef} className={`cyber-mode-layer ${showcaseEnabled ? 'cyber-mode-layer-showcase' : ''}`} aria-hidden="true">
      <div className="cyber-vignette" />
      <div className="cyber-dust" />
      <div className="cyber-spotlight" />
      <div className="cyber-orb cyber-orb-a" />
      <div className="cyber-orb cyber-orb-b" />
      {showcaseEnabled ? (
        <>
          <div className="gold-command-grid" />
          <div className="gold-arc-rings" />
          <div className="gold-light-beam" />
        </>
      ) : null}

      {particles.map((particle) => (
        <span
          key={particle.id}
          className="cyber-particle"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            background: `radial-gradient(circle, ${particle.color} 0%, rgba(255,248,220,0.28) 24%, transparent 72%)`,
            animationDuration: particle.duration,
            animationDelay: particle.delay,
            '--drift-x': particle.driftX,
            '--drift-y': particle.driftY,
          }}
        />
      ))}
    </div>
  );
};

export default CyberModeLayer;
