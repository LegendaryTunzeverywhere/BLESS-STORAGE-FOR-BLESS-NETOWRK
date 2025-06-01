import React, { useState, useRef, useEffect } from "react";
import axios from "axios"; // Re-add axios import
import {
  Box, Text, Button, Badge, HStack, VStack, useToast, Input,
} from "@chakra-ui/react";
import TextToSpeechPlayer from "./TextToSpeechPlayer.js";
import { 
  generateAuthHeaders, 
  getSecureDownloadUrl, 
  analyzeFile,
  deleteFile,
  restoreFile
} from "./storageService.js";

export default function FileCard({
  file,
  isRecycleView, // Changed from isDeleted to isRecycleView
  onDelete,
  onRestore,
  tutorialStep,
  highlightRefs = {},
  account, // Receive account from props
  signer,  // Receive signer from props
}) {
  const [showSummary, setShowSummary] = useState(false);
  const [analysis, setAnalysis] = useState(file.analysis || "");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(analysis);
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Remove local account and signer states
  const isWalletConnected = !!account && !!signer; // Use props directly
  const toast = useToast();
  const analyzeRef = useRef();
  const summaryTextRef = useRef();

  const isAnalyzable = /\.(txt|md|json|csv|js|py|html|css|ts|toml)$/i.test(file.filename);

  useEffect(() => {
    if (tutorialStep === 3 && highlightRefs?.analyze) {
      highlightRefs.analyze.current = analyzeRef.current;
    }
    if (tutorialStep === 4 && highlightRefs?.summaryText) {
      highlightRefs.summaryText.current = summaryTextRef.current;
    }
  }, [tutorialStep, highlightRefs]);

  // Remove initWallet function

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    
    try {
      // Use props directly instead of initWallet
      if (!account || !signer) {
        toast({ 
          title: "Wallet Not Connected", 
          description: "Please connect your wallet to download files.", 
          status: "warning" 
        });
        setIsDownloading(false); // Ensure loading state is reset
        return;
      }

      // Get secure download info (returns an object with streamUrl and headers)
      const downloadInfo = await getSecureDownloadUrl(file.id, account, signer);
      
      // Create a proper download using fetch with headers
      const response = await fetch(downloadInfo.streamUrl, {
        headers: downloadInfo.headers
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadInfo.filename || file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({ title: "✅ Download completed", status: "success" });
    } catch (err) {
      console.error("Download error:", err);
      toast({ 
        title: "❌ Download failed", 
        description: err.message, 
        status: "error" 
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAnalyze = async () => {
    if (loading) return;
    setLoading(true);
    
    try {
      // Use props directly instead of initWallet
      if (!account || !signer) {
        toast({ 
          title: "Wallet Not Connected", 
          description: "Please connect your wallet to analyze files.", 
          status: "warning" 
        });
        setLoading(false); // Ensure loading state is reset
        return;
      }

      const result = await analyzeFile(file.id, account, signer);
      
      const summary = result?.summary || result?.analysis || "Analysis completed";
      setAnalysis(summary);
      setEditText(summary);
      setShowSummary(true);
      toast({ title: "✅ Analysis complete!", status: "success" });
    } catch (err) {
      console.error("Analysis error:", err);
      toast({ 
        title: "❌ Analysis failed", 
        description: err.message, 
        status: "error" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Use props directly instead of initWallet
      if (!account || !signer) {
        toast({ 
          title: "Wallet Not Connected", 
          description: "Please connect your wallet to delete files.", 
          status: "warning" 
        });
        setIsProcessing(false); // Ensure loading state is reset
        return;
      }

      await deleteFile(file.id, account, signer);
      toast({ title: "✅ File deleted successfully", status: "success" });
      
      // Call the parent callback to refresh the file list
      if (onDelete) {
        onDelete(file.id); // Pass the ID of the deleted file for optimistic update
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast({ 
        title: "❌ Delete failed", 
        description: err.message, 
        status: "error" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Use props directly instead of initWallet
      if (!account || !signer) {
        toast({ 
          title: "Wallet Not Connected", 
          description: "Please connect your wallet to restore files.", 
          status: "warning" 
        });
        setIsProcessing(false); // Ensure loading state is reset
        return;
      }

      await restoreFile(file.id, account, signer);
      toast({ title: "✅ File restored successfully", status: "success" });
      
      // Call the parent callback to refresh the file list
      if (onRestore) {
        onRestore(); // Call without arguments, FileExplorer will trigger refresh
      }
    } catch (err) {
      console.error("Restore error:", err);
      toast({ 
        title: "❌ Restore failed", 
        description: err.message, 
        status: "error" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveEditedSummary = async () => {
    if (isSaving) return;
    setIsSaving(true);
    
    try {
      // Use props directly instead of initWallet
      if (!account || !signer) {
        toast({ 
          title: "Wallet Not Connected", 
          description: "Please connect your wallet to save summary.", 
          status: "warning" 
        });
        setIsSaving(false); // Ensure loading state is reset
        return;
      }

      // Use the service's auth header generator
      const headers = await generateAuthHeaders(account, signer, "upload_analysis");
      
      const blob = new Blob([editText], { type: "text/plain" });
      const formData = new FormData();
      formData.append("file", blob, `analysis_${file.id}.txt`);
      
      // Note: FormData requests should not set Content-Type header manually
      const requestHeaders = { ...headers };
      delete requestHeaders["Content-Type"];
      
      const API = process.env.API_BASE || 'https://server-bless.onrender.com';
      await axios.post(`${API}/Upload`, formData, { 
        headers: requestHeaders 
      });
      
      toast({ title: "💾 Summary saved to IPFS", status: "success" });
      setAnalysis(editText);
      setEditing(false);
    } catch (err) {
      console.error("Save error:", err);
      toast({ 
        title: "❌ Save failed", 
        description: err.message, 
        status: "error" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box
      border="1px solid"
      borderColor="gray.300"
      borderRadius="md"
      p={4}
      mb={3}
      position="relative"
      boxShadow={tutorialStep === 3 ? "0 0 0 3px #ffd700" : "none"}
      zIndex={tutorialStep === 3 ? 2 : 1}
    >
      <VStack align="start" spacing={2}>
        <HStack justify="space-between" w="100%">
          <Text fontWeight="bold" noOfLines={1}>{file.filename}</Text>
          <Badge colorScheme={isRecycleView ? "red" : "green"}>
            {isRecycleView ? "Deleted" : "Active"}
          </Badge>
        </HStack>

        <Text fontSize="sm">Size: {(file.size / 1024).toFixed(1)} KB</Text>
        <Text fontSize="sm">
          Uploaded: {file.created_at ? new Date(file.created_at).toLocaleString() : "N/A"}
        </Text>

        <HStack spacing={3} pt={2} flexWrap="wrap">
          {!isRecycleView ? ( // Use isRecycleView here
            <>
              <Button 
                size="xs" 
                onClick={handleDownload} 
                isDisabled={!isWalletConnected || isDownloading}
                isLoading={isDownloading}
                loadingText="Downloading"
              >
                ⬇️ Download
              </Button>
              <Button
                size="xs"
                onClick={handleAnalyze}
                isLoading={loading}
                loadingText="Analyzing"
                ref={analyzeRef}
                isDisabled={!isAnalyzable}
                title={!isAnalyzable ? "File type not supported for analysis" : ""}
              >
                🧠 Analyze
              </Button>
              <Button 
                size="xs" 
                onClick={() => setShowSummary(!showSummary)}
                isDisabled={!analysis}
              >
                {showSummary ? "Hide Summary" : "View Summary"}
              </Button>
              <Button
                size="xs"
                onClick={handleDelete}
                isDisabled={!isWalletConnected}
                isLoading={isProcessing}
                loadingText="Deleting"
                colorScheme="red"
              >
                🗑 Delete
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              onClick={handleRestore}
              isDisabled={!isWalletConnected}
              isLoading={isProcessing}
              loadingText="Restoring"
              colorScheme="blue"
            >
              ♻️ Restore
            </Button>
          )}
        </HStack>

        {showSummary && analysis && (
          <Box
            mt={2}
            w="100%"
            p={4}
            border="1px solid #ccc"
            borderRadius="md"
          >
            <Text fontWeight="bold">Summary:</Text>
            {editing ? (
              <>
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  mb={2}
                  placeholder="Enter analysis summary..."
                />
                <HStack spacing={2}>
                  <Button 
                    size="xs" 
                    onClick={saveEditedSummary} 
                    isLoading={isSaving}
                    loadingText="Saving"
                    colorScheme="blue"
                  >
                    💾 Save
                  </Button>
                  <Button 
                    size="xs" 
                    onClick={() => {
                      setEditing(false);
                      setEditText(analysis);
                    }}
                  >
                    Cancel
                  </Button>
                </HStack>
              </>
            ) : (
              <>
                <Text 
                  fontSize="sm" 
                  mt={1}
                  ref={summaryTextRef}
                  transition="box-shadow 0.4s ease, background-color 0.4s ease"
                  boxShadow={isAudioPlaying ? "0 0 0 2px #ffd700" : "none"}
                  backgroundColor={isAudioPlaying ? "rgba(255, 215, 0, 0.1)" : "transparent"}
                  borderRadius="md"
                  p={isAudioPlaying ? 2 : 0}
                  whiteSpace="pre-wrap"
                >
                  {analysis}
                </Text>
                
                <TextToSpeechPlayer
                  text={analysis}
                  fileId={file.id}
                  fileName={file.filename}
                  account={account}
                  signer={signer}
                  tutorialStep={tutorialStep}
                  highlightRefs={highlightRefs}
                  isAudioPlaying={isAudioPlaying}
                  onAudioPlayingChange={setIsAudioPlaying}
                />

                <Button 
                  mt={2} 
                  size="xs" 
                  onClick={() => setEditing(true)}
                  colorScheme="gray"
                >
                  ✏️ Edit
                </Button>
              </>
            )}
          </Box>
        )}
      </VStack>
    </Box>
  );
}
