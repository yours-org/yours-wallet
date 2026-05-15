import { useState, useRef, useEffect } from 'react';
import walletIcon from '../assets/logos/icon.png';

interface Rotation {
  x: number;
  y: number;
}

export type YoursIconProps = {
  width?: string;
  animated?: boolean;
};

export const YoursIcon = (props: YoursIconProps) => {
  const { animated, width } = props;
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!animated) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!imgRef.current) return;

      const { left, top, width, height } = imgRef.current.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const angleInRadians = Math.atan2(deltaY, deltaX);

      setRotation({
        x: Math.sin(angleInRadians) * 40,
        y: -Math.cos(angleInRadians) * 40,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [animated]);

  return (
    <img
      ref={imgRef}
      src={walletIcon}
      alt="Yours Head"
      className="transition-transform duration-100"
      style={{
        width: width ?? '6.25rem',
        height: width ?? '6.25rem',
        transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
      }}
    />
  );
};
