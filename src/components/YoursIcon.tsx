import { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import walletIcon from '../assets/logos/icon.png';

const YoursImg = styled.img<{
  $rotation: { x: number; y: number };
}>`
  transition: transform 0.1s;
  width: ${(props) => props.width ?? '6.25rem'};
  height: ${(props) => props.width ?? '6.25rem'};
`;

interface Rotation {
  x: number;
  y: number;
}

export type YoursIconProps = {
  /** The size of the head */
  width?: string;
  /** Whether or not the head should follow the mouse */
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

      // Calculate angle
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
    <YoursImg
      ref={imgRef}
      src={walletIcon}
      width={width}
      alt="Yours Head"
      $rotation={rotation}
      style={{
        transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
      }}
    />
  );
};
