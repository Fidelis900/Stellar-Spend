import { logger } from '@/lib/logger';
('use client');

import { useState, useRef, useEffect } from 'react';
import { QRCodeData } from '@/types/qrcode';
import { qrCodeService } from '@/lib/services/qrcode-service';
import { BrowserQRCodeReader } from '@zxing/browser';

interface QRScannerProps {
  onScan: (data: QRCodeData) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [flashlightAvailable, setFlashlightAvailable] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [scanHistory, setScanHistory] = useState<Array<{ data: QRCodeData; timestamp: number }>>(
    [],
  );
  const [mode, setMode] = useState<'camera' | 'upload'>('upload');
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);

  // Request camera permissions
  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // If we get here, permission granted
      setPermissionStatus('granted');
      // Stop the stream as we just wanted to check permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      setPermissionStatus('denied');
      const errorMsg = err instanceof Error ? err.message : 'Camera access denied';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }
  };

  // Start scanning with camera
  const startCameraScan = async () => {
    setError('');
    if (permissionStatus !== 'granted') {
      const granted = await requestCameraPermission();
      if (!granted) return;
    }

    try {
      const constraints: MediaTrackConstraints = {
        width: { ideal: 400 },
        height: { ideal: 400 },
        facingMode: 'environment', // Prefer rear camera for scanning
      };

      if (selectedCameraId) {
        constraints.deviceId = { exact: selectedCameraId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
      videoRef.current!.srcObject = stream;
      videoRef.current!.play();

      // Initialize QR code reader
      readerRef.current = new BrowserQRCodeReader({
        // Optional: customize decoder
        // @ts-ignore
        tryHarder: true,
      });

      setIsScanning(true);
      setCameraEnabled(true);

      // Check if flashlight is available
      try {
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          const capabilities = tracks[0].getCapabilities();
          setFlashlightAvailable(!!capabilities.torch);
        }
      } catch (e) {
        logger.warn('Could not check flashlight availability', e);
      }

      // Start decoding
      // @ts-ignore
      readerRef.current.decodeFromInputVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          const resultText = result.getText();
          const data = qrCodeService.parseQRData(resultText);
          if (data) {
            // Prevent duplicate scans
            const alreadyScanned = scanHistory.some(
              (item) =>
                item.data.transactionId === data.transactionId &&
                Date.now() - item.timestamp < 5000, // 5 second debounce
            );
            if (!alreadyScanned) {
              onScan(data);
              setScanHistory((prev) => [...prev, { data, timestamp: Date.now() }]);
            }
          } else {
            const errMsg = 'Invalid QR code format';
            setError(errMsg);
            onError?.(errMsg);
          }
        } else if (err) {
          // Ignore errors that are not permanent
          if (!(err instanceof NotFoundException)) {
            logger.warn('QR scan error', err);
          }
        }
        // Continue scanning
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start camera';
      setError(errorMsg);
      setError(errorMsg);
      onError?.(errorMsg);
      setIsScanning(false);
      setCameraEnabled(false);
    }
  };

  // Stop scanning
  const stopCameraScan = () => {
    setIsScanning(false);
    setCameraEnabled(false);
    if (videoRef.current) {
      const stream = videoRef.current.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      videoRef.current.srcObject = null;
    }
    if (readerRef.current) {
      // @ts-ignore
      readerRef.current.reset();
      readerRef.current = null;
    }
  };

  // Toggle flashlight
  const toggleFlashlight = async () => {
    if (!flashlightAvailable || !videoRef.current) return;

    try {
      const track = videoRef.current.srcObject?.getVideoTracks()[0];
      if (!track) return;

      const capabilities = track.getCapabilities();
      if (!capabilities.torch) return;

      const settings = track.getSettings();
      const newState = !flashlightOn;
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setFlashlightOn(newState);
    } catch (err) {
      logger.error('Failed to toggle flashlight', {}, err);
    }
  };

  // Handle file upload (existing functionality)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError('');
      const reader = new FileReader();

      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const data = qrCodeService.parseQRData(content);

        if (data) {
          onScan(data);
          setScanHistory((prev) => [...prev, { data, timestamp: Date.now() }]);
        } else {
          const err = 'Invalid QR code format';
          setError(err);
          onError?.(err);
        }
      };

      reader.readAsText(file);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to scan QR code';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Handle paste (existing functionality)
  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    try {
      const text = event.clipboardData.getData('text');
      const data = qrCodeService.parseQRData(text);

      if (data) {
        onScan(data);
        setScanHistory((prev) => [...prev, { data, timestamp: Date.now() }]);
      } else {
        const err = 'Invalid QR code data in clipboard';
        setError(err);
        onError?.(err);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to parse clipboard data';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Get available cameras
  useEffect(() => {
    const enumerateCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        // We could store and let user select, but for simplicity we'll just use the first rear camera
        // For now, we don't implement camera selection UI, but we can add later
      } catch (err) {
        logger.error('Error enumerating cameras', {}, err);
      }
    };

    enumerateCameras();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCameraScan();
    };
  }, []);

  return (
    <div className="space-y-4 p-4 border-2 border-dashed rounded-lg bg-gray-50">
      <div>
        <h3 className="text-lg font-semibold mb-2">Scan QR Code</h3>
        <p className="text-sm text-gray-600">Scan QR codes using camera or upload an image</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('camera')}
          className={`flex-1 px-4 py-2 ${mode === 'camera' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'} rounded-lg hover:${mode === 'camera' ? 'bg-blue-700' : 'bg-gray-300'}`}
        >
          Camera Scan
        </button>
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 px-4 py-2 ${mode === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'} rounded-lg hover:${mode === 'upload' ? 'bg-blue-700' : 'bg-gray-300'}`}
        >
          Upload/Paste
        </button>
      </div>

      {/* Camera mode */}
      {mode === 'camera' && (
        <>
          {/* Camera permission handling */}
          {permissionStatus === null && (
            <button
              onClick={requestCameraPermission}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Enable Camera
            </button>
          )}
          {permissionStatus === 'denied' && (
            <div className="text-red-600 text-sm text-center">
              Camera access is required for scanning. Please enable camera permissions in your
              browser settings.
            </div>
          )}
          {permissionStatus === 'granted' && (
            <div className="relative">
              {/* Video element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-[300px] bg-gray-200 rounded-lg object-contain"
              />
              {/* Scan guidelines overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 m-8 border-2 border-dashed border-green-500">
                  {/* Corner markers for alignment */}
                  <div className="absolute -mx-2 -my-2 w-4 h-4 bg-green-500"></div>
                  <div className="absolute top-0 right-0 -mx-2 -my-2 w-4 h-4 bg-green-500"></div>
                  <div className="absolute bottom-0 left-0 -mx-2 -my-2 w-4 h-4 bg-green-500"></div>
                  <div className="absolute bottom-0 right-0 -mx-2 -my-2 w-4 h-4 bg-green-500"></div>
                </div>
                {/* Instructions */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
                  Align QR code within the box
                </div>
              </div>
            </div>
          )}
          {/* Camera controls */}
          {permissionStatus === 'granted' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={isScanning ? stopCameraScan : startCameraScan}
                disabled={!cameraEnabled && isScanning}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {isScanning ? 'Stop Scanning' : 'Start Scanning'}
              </button>
              {flashlightAvailable && (
                <button
                  onClick={toggleFlashlight}
                  className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                  title={flashlightOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                >
                  {flashlightOn ? 'Flashlight On' : 'Flashlight Off'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Upload/Paste mode */}
      {mode === 'upload' && (
        <>
          <div>
            <h3 className="text-lg font-semibold mb-2">Scan QR Code</h3>
            <p className="text-sm text-gray-600">
              Upload a QR code image or paste QR data from clipboard
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => document.getElementById('file-input')?.click()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upload QR Image
            </button>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="text-center text-sm text-gray-600 mt-2">
            or paste QR data here (Ctrl+V / Cmd+V)
          </div>

          <div
            onPaste={handlePaste}
            className="mt-2 p-3 border border-dashed rounded-lg bg-white min-h-[100px] flex items-center justify-center text-gray-400"
            contentEditable
          >
            Click to paste or drop image
          </div>
        </>
      )}

      {/* Error message */}
      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* Scan history */}
      {scanHistory.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Scan History</h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded p-2 bg-gray-50">
            {scanHistory.map((item, index) => (
              <div key={index} className="text-sm bg-white p-2 rounded border">
                <div className="font-medium">{item.data.transactionId}</div>
                <div className="text-xs text-gray-500">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supported formats info (only in upload mode) */}
      {mode === 'upload' && (
        <div className="text-xs text-gray-500 bg-white p-3 rounded border mt-4">
          <p className="font-semibold mb-1">Supported formats:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>QR code images (PNG, JPG, SVG)</li>
            <li>Base64 encoded QR data</li>
            <li>Transaction QR codes from Stellar-Spend</li>
          </ul>
        </div>
      )}
    </div>
  );
}
