import { useState, useRef, useCallback } from 'react';

export const useAudioRecording = (onAudioSegment, segmentDurationMs = 60000) => {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const segmentStartTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      segmentStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const segmentStartTime = segmentStartTimeRef.current;
          onAudioSegment(blob, segmentStartTime);
          chunksRef.current = [];
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      intervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          
          setTimeout(() => {
            if (streamRef.current && streamRef.current.active) {
              chunksRef.current = [];
              segmentStartTimeRef.current = Date.now();
              
              const newMediaRecorder = new MediaRecorder(streamRef.current, {
                mimeType: 'audio/webm;codecs=opus'
              });
              
              newMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  chunksRef.current.push(event.data);
                }
              };

              newMediaRecorder.onstop = () => {
                if (chunksRef.current.length > 0) {
                  const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                  const segmentStartTime = segmentStartTimeRef.current;
                  onAudioSegment(blob, segmentStartTime);
                  chunksRef.current = [];
                }
              };

              mediaRecorderRef.current = newMediaRecorder;
              newMediaRecorder.start();
            }
          }, 100);
        }
      }, segmentDurationMs);

    } catch (err) {
      setError('마이크 접근 권한이 필요합니다: ' + err.message);
      console.error('Error starting recording:', err);
    }
  }, [onAudioSegment, segmentDurationMs]);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording
  };
};