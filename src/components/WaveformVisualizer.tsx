import { motion } from "framer-motion";

interface WaveformVisualizerProps {
  bars: number[];
  isPlaying: boolean;
  color?: "coral" | "violet" | "muted";
  size?: "sm" | "md" | "lg";
}

const colorMap = {
  coral: "bg-primary",
  violet: "bg-accent",
  muted: "bg-muted-foreground",
};

const sizeMap = {
  sm: { height: 20, barWidth: 2, gap: 1 },
  md: { height: 32, barWidth: 3, gap: 2 },
  lg: { height: 48, barWidth: 4, gap: 2 },
};

const WaveformVisualizer = ({ bars, isPlaying, color = "coral", size = "md" }: WaveformVisualizerProps) => {
  const { height, barWidth, gap } = sizeMap[size];

  return (
    <div className="flex items-center" style={{ height, gap }}>
      {bars.map((value, i) => (
        <motion.div
          key={i}
          className={`rounded-full ${colorMap[color]}`}
          style={{ width: barWidth, minHeight: 2 }}
          animate={{
            height: isPlaying
              ? [value * height * 0.3, value * height, value * height * 0.5, value * height * 0.8, value * height * 0.3]
              : value * height * 0.6,
          }}
          transition={
            isPlaying
              ? { duration: 0.8 + Math.random() * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.02 }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
};

export default WaveformVisualizer;
