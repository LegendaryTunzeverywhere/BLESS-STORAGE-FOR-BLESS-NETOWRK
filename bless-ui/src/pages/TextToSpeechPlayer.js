import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Box, Flex, Progress, Text, IconButton, Select, Button, useToast,
  Menu, MenuButton, MenuList, MenuItem, Tooltip, Badge, Slider,
  SliderTrack, SliderFilledTrack, SliderThumb,
} from "@chakra-ui/react";
import {
  FaPlay, FaPause, FaStop, FaForward, FaBackward, FaSave, FaDownload
} from "react-icons/fa";
import axios from "axios";
import { generateAudio } from "./storageService.js"; // Adjust path if needed

const API = process.env.API_BASE || 'https://server-bless.onrender.com';

const cleanTextForSpeech = (text) =>
  text
    .replace(/[*_~`]/g, "")
    .replace(/```[\s\S]*?```/g, "Code block omitted")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n\s*[-*+]\s+/g, ". ")
    .trim();

const speakWithBrowserTTS = (text, lang = "en-US", voice = null, onEndCallback) => {
  if (!window.speechSynthesis) {
    alert("Your browser does not support text-to-speech.");
    return null; // Return null if not supported
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.pitch = 1;
  utterance.rate = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    if (onEndCallback) onEndCallback(true);
  };

  utterance.onerror = (event) => {
    console.error("Browser TTS error:", event.error);
    if (onEndCallback) onEndCallback(false, event.error);
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return utterance; // Return the utterance object for external control
};

export default function TextToSpeechPlayer({ 
  text = "", 
  fileId = "", 
  fileName = "", 
  account = "", 
  signer, 
  tutorialStep,
  isAudioPlaying, 
  onAudioPlayingChange 
}) {
  const audioRef = useRef(new Audio());
  const browserUtteranceRef = useRef(null); // New ref for browser TTS utterance
  const containerRef = useRef();
  const currentBlobUrlRef = useRef(null);
  const isUnmountedRef = useRef(false);
  const isStoppingRef = useRef(false); // New ref to track intentional stop
  
  // Audio states
  const [audioUrl, setAudioUrl] = useState("");
  const [audioFilename, setAudioFilename] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [language, setLanguage] = useState("en-US"); // Changed default language
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isBrowserTTSActive, setIsBrowserTTSActive] = useState(false); // New state for browser TTS


  const toast = useToast();

  // Cleanup blob URLs
  const cleanupBlobUrl = useCallback((url) => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn("Failed to revoke blob URL:", error);
      }
    }
  }, []);

  // Safe state updates (prevents updates after unmount)
  const safeSetState = useCallback((setter, value) => {
    if (!isUnmountedRef.current) {
      setter(value);
    }
  }, []);

  const getSecureAudioUrl = useCallback(async (filename) => {
    if (!filename || !account || !signer) {
      throw new Error("Missing required parameters for secure audio URL");
    }

    try {
      const sig = await signer.signMessage("serve_audio");
      
      const response = await axios.get(`${API}/audio/serve/${filename}`, {
        headers: {
          "x-evm-address": account,
          "x-evm-message": "serve_audio", 
          "x-evm-signature": sig,
        },
        responseType: 'blob',
        timeout: 30000, // 30 second timeout
      });

      if (!response.data) {
        throw new Error("No audio data received");
      }

      return URL.createObjectURL(response.data);
    } catch (error) {
      console.error("Failed to get secure audio URL:", error);
      throw new Error(`Failed to get secure audio URL: ${error.message}`);
    }
  }, [account, signer]);

  // Enhanced error handling for audio
  const handleAudioError = useCallback((error) => {
    console.error("Audio error:", error);
    
    safeSetState(setIsPlaying, false);
    safeSetState(setIsPaused, false);
    safeSetState(setProgress, 0);
    
    if (onAudioPlayingChange) {
      onAudioPlayingChange(false);
    }
    
    // Only show toast if not unmounted and not an intentional stop
    if (!isUnmountedRef.current && !isStoppingRef.current) {
      toast({
        title: "Audio Error",
        description: "There was a problem with audio playback. Please try again.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  }, [onAudioPlayingChange, toast, safeSetState]);

  // Effect to load existing audio when fileId or account changes
  useEffect(() => {
    const loadExistingAudio = async () => {
      if (!fileId || !account || !signer) {
        setAudioUrl("");
        setAudioFilename("");
        return;
      }

      try {
        const sig = await signer.signMessage("list_audio");
        const res = await axios.get(`${API}/audio/my-files`, {
          headers: {
            "x-evm-address": account,
            "x-evm-message": "list_audio",
            "x-evm-signature": sig,
          },
          timeout: 15000, // 15 second timeout
        });

        if (!res.data || !res.data.files) {
          throw new Error("Invalid response format");
        }

        const currentFile = res.data.files.find(f => f.id === fileId);
        if (currentFile && currentFile.hasAudio && currentFile.audioFilename) {
          // Clean up previous blob URL
          if (currentBlobUrlRef.current) {
            cleanupBlobUrl(currentBlobUrlRef.current);
          }

          const secureAudioUrl = await getSecureAudioUrl(currentFile.audioFilename);
          currentBlobUrlRef.current = secureAudioUrl;
          
          if (!isUnmountedRef.current) {
            setAudioUrl(secureAudioUrl);
            setAudioFilename(currentFile.audioFilename);
            
            // Reset audio element
            const audio = audioRef.current;
            audio.src = secureAudioUrl;
            audio.load();
            
            toast({
              title: "✅ Existing audio loaded",
              description: `Ready to play summary for ${currentFile.filename}`,
              status: "info",
              duration: 3000,
              isClosable: true,
            });
          }
        } else {
          setAudioUrl("");
          setAudioFilename("");
        }
      } catch (err) {
        console.error("Error loading existing audio:", err);
        
        if (!isUnmountedRef.current) {
          setAudioUrl("");
          setAudioFilename("");
          
          // Only show error if it's not a network timeout or cancellation
          if (!err.code || (err.code !== 'ECONNABORTED' && err.code !== 'ERR_CANCELED')) {
            toast({
              title: "Error loading audio",
              description: "Could not check for existing audio files. Please try again.",
              status: "error",
              duration: 4000,
              isClosable: true,
            });
          }
        }
      }
    };

    loadExistingAudio();
  }, [fileId, account, signer, toast, getSecureAudioUrl, cleanupBlobUrl]);

  // Effect to load voices when language changes
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      const filtered = voices.filter(v => v.lang.startsWith(language));
      setAvailableVoices(filtered);
      setSelectedVoice(filtered[0] || null);
    };

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices();
    }
  }, [language]);

  // Effect to track audio progress with better error handling
  useEffect(() => {
    // Store reference at the start of the effect
    const audio = audioRef.current;
    
    const updateProgress = () => {
      if (!isUnmountedRef.current && audio?.duration > 0) {
        const newProgress = (audio.currentTime / audio.duration) * 100;
        setProgress(Math.min(100, Math.max(0, newProgress)));
      }
    };

    const handleAudioEnded = () => {
      console.log("Audio ended."); // Added log
      if (!isUnmountedRef.current) {
        setIsPlaying(false);
        setIsPaused(false);
        setProgress(100);
        if (onAudioPlayingChange) {
          onAudioPlayingChange(false);
        }
      }
    };

    const handleLoadStart = () => {
      if (!isUnmountedRef.current) {
        setProgress(0);
      }
    };

    const handleCanPlay = () => {
      // Audio is ready to play
      console.log("Audio can play");
    };

    const handleAudioErrorEvent = (e) => {
      const error = e.target.error;
      let errorMessage = "Unknown audio error";
      
      if (error) {
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = "Audio playback aborted";
            break;
          case error.MEDIA_ERR_NETWORK:
            errorMessage = "Network error occurred";
            break;
          case error.MEDIA_ERR_DECODE:
            errorMessage = "Audio decoding error";
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Audio format not supported";
            break;
          default:
            errorMessage = "Audio playback error";
        }
      }
      
      handleAudioError(new Error(errorMessage));
    };

    // Add event listeners
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleAudioEnded);
    audio.addEventListener('error', handleAudioErrorEvent);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      // Cleanup event listeners
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleAudioEnded);
      audio.removeEventListener('error', handleAudioErrorEvent);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [onAudioPlayingChange, handleAudioError]);

  // Effect to update audio properties
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = Math.min(1, Math.max(0, volume));
      audio.playbackRate = Math.min(4, Math.max(0.25, playbackSpeed));
      console.log(`Audio volume set to: ${audio.volume}, playbackRate set to: ${audio.playbackRate}`); // Added log
    }
  }, [volume, playbackSpeed]);

  // Cleanup effect
  useEffect(() => {
    const audioElement = audioRef.current;
    
    return () => {
      isUnmountedRef.current = true;
      
      // Cleanup audio
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
        audioElement.load();
      }
      
      // Cleanup blob URL
      if (currentBlobUrlRef.current) {
        cleanupBlobUrl(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [cleanupBlobUrl]);

  const handlePlay = async () => {
    if (!text || !fileId || !account || !signer || isLoading) {
      toast({ 
        title: "Cannot play audio", 
        description: "Missing text, file ID, or wallet information", 
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    if (isBrowserTTSActive) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
        setIsPaused(false);
        if (onAudioPlayingChange) {
          onAudioPlayingChange(true);
        }
      } else if (!window.speechSynthesis.speaking) {
        // If not paused and not speaking, start new browser TTS
        browserUtteranceRef.current = speakWithBrowserTTS(
          text, 
          language || "en-US", 
          selectedVoice,
          (success, error) => {
            if (!isUnmountedRef.current) {
              setIsPlaying(success);
              setIsPaused(!success);
              setProgress(success ? 100 : 0);
              if (onAudioPlayingChange) {
                onAudioPlayingChange(false);
              }
              setIsBrowserTTSActive(false);
            }
            if (error) {
              handleAudioError(new Error(`Browser TTS error: ${error.message}`));
            }
          }
        );
        if (browserUtteranceRef.current) {
          setIsPlaying(true);
          setIsPaused(false);
          if (onAudioPlayingChange) {
            onAudioPlayingChange(true);
          }
        }
      }
    } else if (audioUrl) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        setIsPaused(false);
        if (onAudioPlayingChange) {
          onAudioPlayingChange(true);
        }
      } catch (err) {
        console.error("Playback error:", err);
        handleAudioError(err);
      }
    } else {
      await generateTTS();
    }
  };

  const handlePause = () => {
    if (isBrowserTTSActive) {
      window.speechSynthesis.pause();
    } else {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setIsPaused(true);
    if (onAudioPlayingChange) {
      onAudioPlayingChange(false);
    }
  };

  const handleStop = () => {
    isStoppingRef.current = true; // Set flag before stopping
    if (isBrowserTTSActive) {
      window.speechSynthesis.cancel();
      setIsBrowserTTSActive(false); // Deactivate browser TTS
    } else {
      const audio = audioRef.current;
      audio.pause();
      audio.currentTime = 0;
    }

    // Update states common to both
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);

    if (onAudioPlayingChange) {
      onAudioPlayingChange(false);
    }

    console.log("Audio stopped completely");
    // Reset flag after a short delay to allow error handlers to check it
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 100);
  };

  const handleSkip = () => {
    if (isSkipping || !audioUrl || isBrowserTTSActive) return; // Added isBrowserTTSActive check

    setIsSkipping(true);
    const audio = audioRef.current;

    if (audio && audio.duration) { // Ensure audio and duration are valid
      const newTime = Math.min(audio.duration, audio.currentTime + 5);
      audio.currentTime = newTime;
      console.log(`Skipped to: ${newTime}s`); // Added log
    } else {
      console.warn("Cannot skip: audio not ready or duration unknown.");
    }

    setTimeout(() => {
      if (!isUnmountedRef.current) {
        setIsSkipping(false);
      }
    }, 500);
  };

  const handleRewind = () => {
    if (isRewinding || !audioUrl || isBrowserTTSActive) return; // Added isBrowserTTSActive check

    setIsRewinding(true);
    const audio = audioRef.current;

    if (audio) { // Ensure audio is valid
      const newTime = Math.max(0, audio.currentTime - 5);
      audio.currentTime = newTime;
      console.log(`Rewound to: ${newTime}s`); // Added log
    } else {
      console.warn("Cannot rewind: audio not ready.");
    }

    setTimeout(() => {
      if (!isUnmountedRef.current) {
        setIsRewinding(false);
      }
    }, 500);
  };

  const handleSpeedChange = (speed) => {
    const validSpeed = Math.min(4, Math.max(0.25, speed));
    setPlaybackSpeed(validSpeed);
    if (isBrowserTTSActive && browserUtteranceRef.current) {
      browserUtteranceRef.current.rate = validSpeed;
      console.log(`Browser TTS speed set to: ${validSpeed}`); // Added log
    } else if (audioRef.current) {
      audioRef.current.playbackRate = validSpeed;
      console.log(`Audio playback speed set to: ${validSpeed}`); // Added log
    }
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    handleStop();
    
    // Clear existing audio when language changes
    if (audioUrl) {
      cleanupBlobUrl(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
      setAudioUrl("");
      setAudioFilename("");
    }
  };

  const generateTTS = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      
      const cleanedText = cleanTextForSpeech(text);
      if (!cleanedText.trim()) {
        throw new Error("No valid text to convert to speech");
      }

      const res = await generateAudio(
        cleanedText,
        fileName || "summary.mp3",
        fileId,
        language,
        account,
        signer,
      );

      if (!res?.data?.url || !res?.data?.filename) {
        // Fallback to browser TTS if ElevenLabs fails
        console.warn("ElevenLabs audio generation failed, falling back to browser TTS.");
        setIsBrowserTTSActive(true);
        browserUtteranceRef.current = speakWithBrowserTTS(
          text, 
          language || "en-US", 
          selectedVoice,
          (success, error) => {
            if (!isUnmountedRef.current) {
              setIsPlaying(success);
              setIsPaused(!success);
              setProgress(success ? 100 : 0); // Set to 100 on end, 0 on error
              if (onAudioPlayingChange) {
                onAudioPlayingChange(false);
              }
              setIsBrowserTTSActive(false); // Deactivate browser TTS when done
            }
            if (error) {
              handleAudioError(new Error(`Browser TTS error: ${error.message}`));
            }
          }
        );
        if (browserUtteranceRef.current) {
          setIsPlaying(true);
          setIsPaused(false);
          if (onAudioPlayingChange) {
            onAudioPlayingChange(true);
          }
        }
        toast({ 
          title: "⚠️ Fallback to Browser TTS", 
          description: "Could not generate audio with ElevenLabs. Using browser's built-in speech.",
          status: "warning",
          duration: 4000,
          isClosable: true,
        });
        return; // Exit after fallback
      }

      // Clean up previous blob URL
      if (currentBlobUrlRef.current) {
        cleanupBlobUrl(currentBlobUrlRef.current);
      }

      // If ElevenLabs succeeds, ensure browser TTS is not active
      setIsBrowserTTSActive(false);
      // Clear any active browser TTS
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      browserUtteranceRef.current = null; // Clear browser utterance ref

      const secureAudioUrl = await getSecureAudioUrl(res.data.filename);
      currentBlobUrlRef.current = secureAudioUrl;
      
      if (!isUnmountedRef.current) {
        setAudioUrl(secureAudioUrl);
        setAudioFilename(res.data.filename);
        
        const audio = audioRef.current;
        audio.src = secureAudioUrl;
        audio.load();

        const playAudio = async () => {
          try {
            await audio.play();
            if (!isUnmountedRef.current) {
              setIsPlaying(true);
              if (onAudioPlayingChange) {
                onAudioPlayingChange(true);
              }
            }
          } catch (err) {
            console.error("Playback error:", err);
            handleAudioError(err);
          }
        };

        const onCanPlayThrough = () => {
          playAudio();
        };

        const onError = (e) => {
          handleAudioError(new Error("Failed to load generated audio"));
        };

        audio.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
        audio.addEventListener('error', onError, { once: true });
        
        toast({ 
          title: "✅ Audio generated successfully", 
          description: `Playing summary for ${res.data.originalFile || fileName}`,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error("TTS Generation Error:", err);
      
      let errorMessage = "Failed to generate audio";
      
      if (err.response) {
        if (err.response.status === 401) {
          // Suppress the 401 error message as requested, show info about fallback
          // No toast for 401, just fallback and let the "Loading..." badge handle it.
          console.warn("Authentication failed for audio generation (401). Falling back to browser TTS.");
          setIsBrowserTTSActive(true);
          browserUtteranceRef.current = speakWithBrowserTTS(
            text, 
            language || "en-US", 
            selectedVoice,
            (success, error) => {
              if (!isUnmountedRef.current) {
                setIsPlaying(success);
                setIsPaused(!success);
                setProgress(success ? 100 : 0);
                if (onAudioPlayingChange) {
                  onAudioPlayingChange(false);
                }
                setIsBrowserTTSActive(false);
              }
              if (error) {
                handleAudioError(new Error(`Browser TTS error: ${error.message}`));
              }
            }
          );
          if (browserUtteranceRef.current) {
            setIsPlaying(true);
            setIsPaused(false);
            if (onAudioPlayingChange) {
              onAudioPlayingChange(true);
            }
          }
          return; // Exit after handling 401
        } else if (err.response.status === 403) {
          errorMessage = "Access denied - you don't own this file";
        } else if (err.response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again later.";
        } else if (err.response.data?.details) {
          errorMessage = err.response.data.details;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      if (!isUnmountedRef.current) {
        // Fallback to browser TTS on error (and suppress error toast if it succeeds)
        setIsBrowserTTSActive(true);

        browserUtteranceRef.current = speakWithBrowserTTS(
          text,
          language || "en-US",
          selectedVoice,
          (success, error) => {
            if (!isUnmountedRef.current) {
              setIsPlaying(success);
              setIsPaused(!success);
              setProgress(success ? 100 : 0);
              if (onAudioPlayingChange) {
                onAudioPlayingChange(false);
              }
              setIsBrowserTTSActive(false);
            }

            // ✅ Only show error toast if fallback also fails
            if (error) {
              handleAudioError(new Error(`Browser TTS error: ${error.message}`));
            }
          }
        );

        if (browserUtteranceRef.current) {
          setIsPlaying(true);
          setIsPaused(false);
          if (onAudioPlayingChange) {
            onAudioPlayingChange(true);
          }
        } else {
          // 🔴 Browser TTS could not even start — show fallback error
          toast({
            title: "TTS failed",
            description: errorMessage,
            status: "error",
            duration: 4000,
            isClosable: true,
          });
        }
      }
    } finally {
      if (!isUnmountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const downloadMp3 = async () => {
    if (!audioFilename || isDownloading || !account || !signer) return;
    
    try {
      setIsDownloading(true);
      const sig = await signer.signMessage("download_audio");
      
      const response = await axios.get(`${API}/audio/download/${audioFilename}`, {
        headers: {
          "x-evm-address": account,
          "x-evm-message": "download_audio",
          "x-evm-signature": sig,
        },
        responseType: 'blob',
        timeout: 60000, // 60 second timeout for downloads
      });

      if (!response.data) {
        throw new Error("No data received from download");
      }

      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${fileName || 'summary'}_audio.mp3`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup download URL
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      toast({ 
        title: "✅ Download started", 
        description: "Audio file download initiated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      
    } catch (err) {
      console.error("Download Error:", err);
      
      let errorMessage = "Download failed";
      if (err.response?.status === 403) {
        errorMessage = "Access denied";
      } else if (err.response?.status === 404) {
        errorMessage = "Audio file not found";
      } else if (err.message) {
        errorMessage = err.message;
      }

      if (!isUnmountedRef.current) {
        toast({ 
          title: "Download failed", 
          description: errorMessage, 
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      }
    } finally {
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          setIsDownloading(false);
        }
      }, 2000);
    }
  };

  const exportAnalysis = async () => {
    if (isExporting || !text || !fileId || !account || !signer) return;
    
    setIsExporting(true);
    try {
      const sig = await signer.signMessage("export_summary");
      const res = await axios.post(`${API}/ExportSummary`, {
        fileId,
        summary: text,
      }, {
        headers: {
          "x-evm-address": account,
          "x-evm-message": "export_summary",
          "x-evm-signature": sig,
        },
        timeout: 30000, // 30 second timeout
      });
      
      if (!isUnmountedRef.current) {
        toast({ 
          title: "✅ Exported successfully", 
          description: `CID: ${res.data?.cid || 'Generated'}`,
          status: "success",
          duration: 4000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error("Export error:", err);
      
      let errorMessage = "Export failed";
      if (err.response?.status === 403) {
        errorMessage = "Access denied";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      if (!isUnmountedRef.current) {
        toast({ 
          title: "Export failed", 
          description: errorMessage, 
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      }
    } finally {
      if (!isUnmountedRef.current) {
        setIsExporting(false);
      }
    }
  };

  // Validation helpers
  const hasRequiredData = text && fileId && account && signer;
  const canControlAudio =
    !!audioUrl &&
    !isBrowserTTSActive &&
    audioRef.current?.readyState >= 2;

return (
  <Box ref={containerRef}>
    <Box
      mt={4}
      p={4}
      border="1px solid #ccc"
      borderRadius="md"
      transition="box-shadow 0.4s ease"
      boxShadow={tutorialStep === 5 ? "0 0 0 4px #ffd700" : "none"}
    >
      <Flex justify="space-between" mb={2}>
        <Text fontWeight="bold">🎧 Audio Summary</Text>
        <Flex align="center" gap={2}>
          {fileName && (
            <Text fontSize="sm" color="gray.600" noOfLines={1} maxW="200px">
              {fileName}
            </Text>
          )}
          <Badge colorScheme={isPlaying ? "green" : isPaused ? "yellow" : "gray"}>
            {isLoading ? "Loading..." : isPlaying ? "Playing" : isPaused ? "Paused" : "Ready"}
          </Badge>
        </Flex>
      </Flex>

      <Progress 
        value={progress} 
        size="sm" 
        colorScheme="green" 
        mb={4} 
        borderRadius="md"
        bg="gray.200"
      />

      <Flex wrap="wrap" align="center" gap={3}>
        <Tooltip label={isBrowserTTSActive ? "Rewind not supported in browser TTS" : "Rewind 5s"}>
          <IconButton 
            icon={<FaBackward />} 
            onClick={handleRewind} 
            isDisabled={!canControlAudio || isRewinding}
            size="sm" 
            variant={isRewinding ? "solid" : "outline"}
          />
        </Tooltip>
        
        <Tooltip label={isLoading ? "Generating audio..." : "Play"}>
          <IconButton 
            icon={<FaPlay />} 
            onClick={handlePlay} 
            isLoading={isLoading} 
            isDisabled={isLoading || !hasRequiredData || isPlaying}
            colorScheme="green"
            size="sm"
          />
        </Tooltip>
        
        <Tooltip label="Pause">
          <IconButton 
            icon={<FaPause />} 
            onClick={handlePause} 
            isDisabled={!isPlaying}
            size="sm"
          />
        </Tooltip>
        
        <Tooltip label="Stop">
          <IconButton 
            icon={<FaStop />} 
            onClick={handleStop} 
            isDisabled={!isPlaying && !isPaused}
            colorScheme="red"
            size="sm"
          />
        </Tooltip>
        
        <Tooltip label={isBrowserTTSActive ? "Skip not supported in browser TTS" : "Skip 5s"}>
          <IconButton 
            icon={<FaForward />} 
            onClick={handleSkip} 
            isDisabled={!canControlAudio || isSkipping}
            size="sm"
            variant={isSkipping ? "solid" : "outline"}
          />
        </Tooltip>

        <Menu>
          <MenuButton as={Button} size="sm" isDisabled={!hasRequiredData}>
            {playbackSpeed}x
          </MenuButton>
          <MenuList>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
              <MenuItem key={s} onClick={() => handleSpeedChange(s)}>
                {s}x Speed
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Flex align="center" gap={2} minW="120px">
          <Text fontSize="sm">Vol</Text>
          <Slider 
            value={volume} 
            onChange={setVolume} 
            min={0} 
            max={1} 
            step={0.1} 
            w="80px"
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
        </Flex>

        <Tooltip label="Language selection will clear current audio">
          <Select 
            value={language} 
            onChange={handleLanguageChange} 
            maxW="150px"
            size="sm"
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="es-ES">Español</option>
            <option value="hi-IN">हिन्दी</option>
            <option value="ja-JP">日本語</option>
            <option value="zh-CN">中文</option>
          </Select>
        </Tooltip>

        <Tooltip label="Preferred voice for browser TTS">
          <Select 
            value={selectedVoice?.name || ""} 
            onChange={(e) => {
              const voice = availableVoices.find(v => v.name === e.target.value);
              setSelectedVoice(voice || null);
            }}
            placeholder="Select voice"
            maxW="200px"
            size="sm"
            isDisabled={!availableVoices.length}
          >
            {availableVoices.map((v, i) => (
              <option key={i} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </Select>
        </Tooltip>

        <Tooltip label="Export summary to IPFS">
          <Button 
            leftIcon={<FaSave />} 
            onClick={exportAnalysis} 
            isLoading={isExporting}
            isDisabled={!hasRequiredData || isExporting}
            size="sm"
          >
            Save
          </Button>
        </Tooltip>

        <Tooltip label={isBrowserTTSActive ? "Download only available for server-generated audio" : "Download MP3"}>
          <Button 
            leftIcon={<FaDownload />} 
            onClick={downloadMp3} 
            isLoading={isDownloading}
            isDisabled={!audioFilename || isDownloading || !hasRequiredData || isBrowserTTSActive}
            size="sm"
            colorScheme="blue"
          >
            Download
          </Button>
        </Tooltip>
      </Flex>

      {isBrowserTTSActive && (
        <Text fontSize="xs" color="gray.500" mt={2}>
          ⚠️ Using browser fallback. Skip, rewind, and download are unavailable in this mode.
        </Text>
      )}

      {!hasRequiredData && (
        <Text fontSize="sm" color="red.500" mt={2}>
          ⚠️ {!fileId ? "File ID required" : !account ? "Wallet connection required" : !text ? "Text content required" : "Missing required data"} for audio generation
        </Text>
      )}
    </Box>
  </Box>
);
}
