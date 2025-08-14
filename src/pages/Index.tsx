import React from 'react';
import { WorkoutHeader } from '@/components/WorkoutHeader';
import { VideoRecorder } from '@/components/VideoRecorder';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Background gradient */}
      <div className="fixed inset-0 gradient-secondary opacity-50" />
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        <WorkoutHeader />
        
        <div className="max-w-2xl mx-auto">
          <VideoRecorder />
        </div>
        
        {/* Instructions */}
        <div className="max-w-2xl mx-auto mt-8 space-y-4 text-center">
          <div className="bg-card/80 backdrop-blur-sm rounded-lg p-6 shadow-card">
            <h3 className="text-lg font-semibold mb-3 text-primary">How to use</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Position your device where it can see your workout area</p>
              <p>2. Start recording and perform your exercise</p>
              <p>3. Stop recording when finished</p>
              <p>4. Use delayed playback to review your form without rushing</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
