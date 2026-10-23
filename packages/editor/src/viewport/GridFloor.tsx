import { Grid } from '@react-three/drei';

export function GridFloor({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Grid
      position={[0, 0, 0]}
      args={[24, 24]}
      cellSize={0.5}
      cellThickness={0.6}
      cellColor="#1b2530"
      sectionSize={2}
      sectionThickness={1}
      sectionColor="#2c3a48"
      fadeDistance={28}
      fadeStrength={1.4}
      infiniteGrid
    />
  );
}
