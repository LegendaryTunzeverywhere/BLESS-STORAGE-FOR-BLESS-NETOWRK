import {
  Box, Heading, Text, useToast, Button, VStack, HStack, Switch,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter,
  ModalBody, ModalCloseButton, useDisclosure, Textarea, Spinner,
  Alert, AlertIcon, AlertTitle, Progress,
  Badge, Flex, IconButton, Tooltip
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useOutletContext } from "react-router-dom";
import {
  listFiles, listDeletedFiles, uploadFile, emptyRecycleBin
} from "./storageService.js";
import FileCard from "./FileCard.js";

const ACCEPTED_FILE_TYPES = {
  'text/*': ['.txt', '.md', '.json', '.csv'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileExplorer({ tutorialStep: propTutorialStep = 0, highlightRefs: propHighlightRefs = {} }) {
  // Use context from MainLayout
  const { account, signer, isWalletReady, tutorialStep, highlightRefs, connectWallet, tutorialDismissed } = useOutletContext();

  // State management
  const [files, setFiles] = useState([]);
  const [isRecycleView, setIsRecycleView] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasLoadedFilesInitially, setHasLoadedFilesInitially] = useState(false); // New state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emptying, setEmptying] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analyzeResult, setAnalyzeResult] = useState("");

  const toast = useToast();
  const uploadRef = useRef(null);

  // Modal controls
  const {
    isOpen: isConfirmOpen,
    onOpen: openConfirm,
    onClose: closeConfirm
  } = useDisclosure();

  const {
    isOpen: isAnalyzeOpen,
    onOpen: openAnalyze,
    onClose: closeAnalyze
  } = useDisclosure();

  const {
    isOpen: isEmptyBinOpen,
    onOpen: openEmptyBin,
    onClose: closeEmptyBin
  } = useDisclosure();

  // Tutorial highlighting effect
  useEffect(() => {
    if (tutorialStep === 2 && highlightRefs.upload) {
      highlightRefs.upload.current = uploadRef.current;
    }
  }, [tutorialStep, highlightRefs]);

  // Enhanced file refresh with error handling
  const refresh = useCallback(async () => {
    console.log("FileExplorer: Refresh called. Account:", account, "Signer:", signer, "isWalletReady:", isWalletReady);
    if (!account || !signer || !isWalletReady) {
      console.log("FileExplorer: Refresh skipped: Account, Signer, or Wallet not ready.");
      return;
    }

    setLoading(true);
    try {
      console.log("FileExplorer: Attempting to list files with account and signer:", account, signer);
      console.log(`FileExplorer: Calling ${isRecycleView ? 'listDeletedFiles' : 'listFiles'}...`);
      const result = isRecycleView
        ? await listDeletedFiles(account, signer)
        : await listFiles(account, signer);

      const fileList = Array.isArray(result) ? result : Object.values(result || {});
      console.log("Refresh result:", result);
      console.log("Processed fileList:", fileList);
      setFiles(fileList);
      console.log("Files state updated.");
      
      localStorage.setItem('lastRefresh', Date.now().toString());
      if (!hasLoadedFilesInitially) { // Set to true after first successful load
        setHasLoadedFilesInitially(true);
      }
    } catch (err) {
      console.error("Refresh error:", err);
      toast({ 
        title: "Failed to Load Files", 
        description: err.message || "Unable to fetch files from storage",
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setLoading(false);
    }
  }, [account, signer, isRecycleView, toast, isWalletReady, hasLoadedFilesInitially]);

  const handleFileDeleted = useCallback((deletedFileId) => {
    setFiles(prevFiles => prevFiles.filter(f => f.id !== deletedFileId));

      if (isRecycleView) {
    refresh();
  }
}, [isRecycleView, refresh]);


  useEffect(() => {
    console.log("useEffect for refresh triggered. Account:", account, "Signer:", signer, "isWalletReady:", isWalletReady, "isRecycleView:", isRecycleView);
    
    if (account && signer && isWalletReady) {
      refresh();
    }
  }, [account, signer, isWalletReady, isRecycleView, refresh]);


  const validateFiles = (files) => {
    const errors = [];
    const validFiles = [];

    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 10MB)`);
      } else {
        validFiles.push(file);
      }
    });

    return { validFiles, errors };
  };

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    console.log("onDrop triggered. Accepted:", acceptedFiles, "Rejected:", rejectedFiles);
    if (!account || !signer || !isWalletReady) {
      console.log("onDrop: Wallet Not Connected or Not Ready. Showing toast.");
      toast({
        title: "Wallet Not Connected or Not Ready",
        description: "Please connect your wallet and ensure it's ready to upload files.",
        status: "warning",
        duration: 3000
      });
      return;
    }

    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(({ file, errors }) => 
        `${file.name}: ${errors.map(e => e.message).join(', ')}`
      );
      
      toast({
        title: "Some Files Rejected",
        description: errors.join('\n'),
        status: "warning",
        duration: 5000,
        isClosable: true
      });
    }

    if (acceptedFiles.length === 0) {
      toast({
        title: "No Valid Files",
        description: "Please select supported file types under 10MB",
        status: "warning"
      });
      return;
    }

    const { validFiles, errors } = validateFiles(acceptedFiles);
    
    if (errors.length > 0) {
      toast({
        title: "File Validation Errors",
        description: errors.join('\n'),
        status: "warning",
        duration: 5000,
        isClosable: true
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      openConfirm();
    }
  }, [account, signer, openConfirm, toast, isWalletReady]);


  const confirmUpload = async () => {
    if (!account || !signer) {
      toast({
        title: "Wallet Required",
        description: "Connect your wallet before uploading.",
        status: "warning"
      });
      return;
    }

    closeConfirm();
    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    let failCount = 0;
    const totalFiles = selectedFiles.length;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const uploaded = await uploadFile(file, account, signer, "demo");
        successCount++;

        // Optimistically add uploaded file to UI
        if (!isRecycleView) {
          setFiles(prev => [...prev, uploaded.file || uploaded]);
        }
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        
        toast({ 
          title: `✅ ${file.name}`, 
          description: "Upload successful",
          status: "success",
          duration: 2000
        });
      } catch (err) {
        failCount++;
        console.error(`Upload failed for ${file.name}:`, err);
        toast({ 
          title: `❌ ${file.name}`, 
          description: err.message || "Upload failed", 
          status: "error",
          duration: 3000
        });
      }
    }


    toast({
      title: "Upload Complete",
      description: `${successCount} successful, ${failCount} failed`,
      status: successCount > failCount ? "success" : "warning",
      duration: 4000,
      isClosable: true
    });

    setUploading(false);
    setUploadProgress(0);
    setSelectedFiles([]);
    await new Promise(res => setTimeout(res, 1000)); // Add 1-second delay
    refresh();
  };


  const handleEmptyRecycleBin = async () => {
    if (!account || !signer) return;
    
    closeEmptyBin();
    setEmptying(true);

    try {
      await emptyRecycleBin(account, signer);

      setFiles([]); 
      toast({
        title: "Recycle Bin Emptied",
        description: "All deleted files have been permanently removed",
        status: "success"
      });
    } catch (err) {
      console.error("Empty recycle bin error:", err);
      toast({
        title: "Failed to Empty Recycle Bin",
        description: err.message,
        status: "error"
      });
    } finally {
      setEmptying(false);
    }
  };


  const dropzone = useDropzone({ 
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    noClick: true, 
    noKeyboard: true
  });

  const connectWalletContent = (
    <Box p={6} textAlign="center" maxW="md" mx="auto">
      <Heading mb={4}>Connect Your Wallet</Heading>
      <Text mb={6} color="gray.600">
        Connect your EVM wallet to access your decentralized file storage.
      </Text>
      
      <Button 
        onClick={connectWallet} 
        colorScheme="blue" 
        size="lg"
      >
        Connect Wallet
      </Button>
    </Box>
  );

  const fileExplorerContent = (
    <Box {...dropzone.getRootProps()} p={6} minH="100vh">
      <input {...dropzone.getInputProps()} />

      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" mb={6}>
        <VStack align="start" spacing={1}>
          <Heading size="lg">
            {isRecycleView ? "🗑️ Recycle Bin" : "📁 Your Files"}
          </Heading>
        </VStack>
        
        <HStack spacing={4}>
          {isRecycleView && files.length > 0 && (
            <Button
              colorScheme="red"
              variant="outline"
              size="sm"
              onClick={openEmptyBin}
              isLoading={emptying}
              isDisabled={!isWalletReady} 
            >
              Empty Bin
            </Button>
          )}
          
          <Button
            ref={uploadRef}
            onClick={dropzone.open}
            colorScheme="blue"
            size="sm"
            isDisabled={!account || !isWalletReady} // Disabled if wallet not ready
          >
            Upload File
          </Button>

          <HStack>
            <Text fontSize="sm">Recycle Bin</Text>
            <Switch 
              isChecked={isRecycleView} 
              onChange={(e) => setIsRecycleView(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          
          <Tooltip label="Refresh files">
            <IconButton
              aria-label="Refresh"
              icon={<RepeatIcon />} // Use RepeatIcon
              onClick={refresh}
              isLoading={loading}
              isDisabled={!isWalletReady} // Disabled if wallet not ready
              size="sm"
              variant="outline"
              colorScheme="blue"
            />
          </Tooltip>
        </HStack>
      </Flex>

      {/* Upload progress */}
      {uploading && (
        <Box mb={4}>
          <Text mb={2}>Uploading files... {uploadProgress}%</Text>
          <Progress value={uploadProgress} colorScheme="blue" />
        </Box>
      )}

      {/* Drag and drop indicator */}
      {dropzone.isDragActive && (
        <Alert status="info" mb={4}>
          <AlertIcon />
          <AlertTitle>Drop files here to upload!</AlertTitle>
        </Alert>
      )}

      {/* Files list */}
      {loading ? (
        <Flex justify="center" align="center" h="200px">
          <VStack>
            <Spinner size="xl" />
            <Text>Loading files...</Text>
          </VStack>
        </Flex>
      ) : (account && signer && isWalletReady && !hasLoadedFilesInitially && files.length === 0) ? (
        <Box textAlign="center" py={12}>
          <Text fontSize="lg" color="gray.500" mb={4}>
            Wallet connected. Click below to list your files.
          </Text>
          <Button 
            onClick={refresh} 
            colorScheme="blue" 
            size="lg"
            isLoading={loading}
            isDisabled={loading}
          >
            List My Files
          </Button>
        </Box>
      ) : files.length === 0 ? (
        <Box textAlign="center" py={12}>
          <Text fontSize="lg" color="gray.500" mb={4}>
            {isRecycleView ? "Recycle bin is empty" : "No files uploaded yet"}
          </Text>
          {!isRecycleView && (
            <Text color="gray.400">
              Drag and drop files here or use the upload button
            </Text>
          )}
        </Box>
      ) : (
        <VStack spacing={4} align="stretch">
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              account={account}
              signer={signer}
              onDelete={handleFileDeleted}
              onRestore={refresh}
              onAnalyze={(result) => {
                setAnalyzeResult(result);
                openAnalyze();
              }}
              isRecycleView={isRecycleView}
            />
          ))}
        </VStack>
      )}

      {/* Upload confirmation modal */}
      <Modal isOpen={isConfirmOpen} onClose={closeConfirm} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Upload</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb={4}>
              Upload {selectedFiles.length} file(s) to decentralized storage?
            </Text>
            <VStack align="start" spacing={1}>
              {selectedFiles.map((file, index) => (
                <HStack key={index}>
                  <Text fontSize="sm">{file.name}</Text>
                  <Badge colorScheme="blue">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                </HStack>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button 
              colorScheme="blue" 
              mr={3} 
              onClick={confirmUpload} 
              isLoading={uploading}
              loadingText="Uploading..."
            >
              Upload
            </Button>
            <Button onClick={closeConfirm}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Analysis result modal */}
      <Modal isOpen={isAnalyzeOpen} onClose={closeAnalyze} isCentered size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>📊 File Analysis</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Textarea 
              value={analyzeResult} 
              isReadOnly 
              rows={12} 
              fontFamily="monospace"
              fontSize="sm"
            />
          </ModalBody>
          <ModalFooter>
            <Button onClick={closeAnalyze}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Empty recycle bin confirmation */}
      <Modal isOpen={isEmptyBinOpen} onClose={closeEmptyBin} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>⚠️ Empty Recycle Bin</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              This will permanently delete all files in the recycle bin. 
              This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button 
              colorScheme="red" 
              mr={3} 
              onClick={handleEmptyRecycleBin}
              isLoading={emptying}
            >
              Empty Bin
            </Button>
            <Button onClick={closeEmptyBin}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );


  if (!tutorialDismissed) {
    return fileExplorerContent; 
  } else if (!account) {
    return connectWalletContent;
  } else {
    return fileExplorerContent;
  }
}
