import React from 'react';
import { WorkoutHeader } from '@/components/WorkoutHeader';
import { VideoRecorder } from '@/components/VideoRecorder';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Background gradient */}
      <div className="fixed inset-0 gradient-secondary opacity-50" />
      
      <div className="relative z-10 container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Ultra Compact Header for Mobile */}
        <div className="mb-3 sm:mb-6">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-full gradient-primary shadow-glow flex items-center justify-center">
              <div className="w-6 h-6 sm:w-8 sm:h-8 text-white">🏋️</div>
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-tight">
                Form Checker
              </h1>
              <p className="text-muted-foreground text-xs sm:text-base leading-tight">
                Live delayed video for form analysis
              </p>
            </div>
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
