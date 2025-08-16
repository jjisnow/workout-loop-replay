import React from 'react';
import { WorkoutHeader } from '@/components/WorkoutHeader';
import { VideoRecorder } from '@/components/VideoRecorder';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Background gradient */}
      <div className="fixed inset-0 gradient-secondary opacity-50" />
      
      <div className="relative z-10 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Compact Header for Mobile */}
        <div className="text-center space-y-2 sm:space-y-4 mb-4 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full gradient-primary shadow-glow">
            <div className="w-8 h-8 sm:w-10 sm:h-10 text-white">🏋️</div>
          </div>
          
          <div className="space-y-1 sm:space-y-2">
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Form Checker
            </h1>
            <p className="text-muted-foreground text-sm sm:text-lg">
              Live delayed video for form analysis
            </p>
          </div>
        </div>
        
        <div className="max-w-2xl mx-auto">
          <VideoRecorder />
        </div>
      </div>
    </div>
  );
};

export default Index;
