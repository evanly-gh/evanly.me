import { Canvas } from '@react-three/fiber';
import { PALETTE } from './theme';

export default function App() {
  return (
    <Canvas camera={{ position: [0, 5, 15], fov: 55 }}>
      <color attach="background" args={[PALETTE.void]} />
      <ambientLight intensity={0.4} />
      <mesh rotation={[0.4, 0.6, 0]}>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color={PALETTE.violet} />
      </mesh>
      <directionalLight position={[5, 10, 5]} intensity={2} />
    </Canvas>
  );
}
