import React from 'react';
import { Dumbbell, Timer } from 'lucide-react';

export const WorkoutHeader: React.FC = () => {
  return (
    <div className="text-center space-y-4 mb-8">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full gradient-primary shadow-glow">
        <Dumbbell className="w-10 h-10 text-white" />
      </div>
      
      <div className="space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Form Checker
        </h1>
        <p className="text-muted-foreground text-lg">
          Live delayed video feed for real-time form checking
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-accent">
        <Timer className="w-4 h-4" />
        <span>Live delayed monitoring</span>
      </div>
    </div>
  );
};