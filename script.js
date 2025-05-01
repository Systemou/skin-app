document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const preview = document.getElementById('preview');
    const captureBtn = document.getElementById('captureBtn');
    const result = document.getElementById('result');
    const loader = document.getElementById('loader');
    const faceStatus = document.getElementById('face-status');
    const guidanceText = document.querySelector('.guidance-text');
    const cameraPermissionBtn = document.createElement('button');
    
    // Setup camera permission button
    cameraPermissionBtn.id = 'cameraPermissionBtn';
    cameraPermissionBtn.className = 'btn btn-primary animate__animated animate__pulse';
    cameraPermissionBtn.innerHTML = '<i class="fas fa-camera"></i> Allow Camera Access';
    
    // Canvas context
    const ctx = canvas.getContext('2d');
    
    // Face detection variables
    let faceDetected = false;
    let faceDetector = null;
    let detectionCanvas = document.createElement('canvas');
    let detectionCtx = detectionCanvas.getContext('2d');
    let processingFrame = false;
    
    // Add iOS-specific playsinline attribute to video element
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    
    // Video stream setup
    async function setupCamera() {
        try {
            const constraints = { 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            // iOS-specific: need to play the video after setting srcObject
            video.play().catch(err => {
                console.warn('Auto-play was prevented. Need user interaction:', err);
            });
            
            // Wait for video to be ready
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    // Update canvas dimensions to match video
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    
                    // Setup detection canvas
                    detectionCanvas.width = 320;  // Smaller for performance
                    detectionCanvas.height = 240;
                    
                    resolve();
                };
            });
        } catch (err) {
            console.error('Error accessing camera:', err);
            
            // Handle permission denied specifically
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                // Show camera permission button
                const cameraContainer = video.parentElement;
                cameraContainer.innerHTML = '';
                cameraContainer.appendChild(cameraPermissionBtn);
                
                result.innerText = 'Camera access denied. Please tap the button below to allow camera access.';
                result.style.color = '#e74c3c';
                captureBtn.disabled = true;
            } else {
                result.innerText = `Camera error: ${err.message}. This may be due to iOS restrictions.`;
                result.style.color = '#e74c3c';
                captureBtn.disabled = true;
            }
            
            throw err;
        }
    }
    
    // Camera permission button handler
    cameraPermissionBtn.addEventListener('click', () => {
        // Replace camera button with video element again
        const cameraContainer = cameraPermissionBtn.parentElement;
        cameraContainer.innerHTML = '';
        cameraContainer.appendChild(video);
        
        // Try to setup camera again
        initializeApp();
    });
    
    // Initialize app with camera setup
    function initializeApp() {
        // Initially disable the capture button until face is detected
        captureBtn.disabled = true;
        
        setupCamera()
            .then(() => {
                // Start face detection after camera is set up
                initFaceDetection();
            })
            .catch(err => {
                console.error('Setup camera error:', err);
            });
    }
    
    // Initialize face detection
    async function initFaceDetection() {
        try {
            // Check if FaceDetector is available in the browser
            if ('FaceDetector' in window) {
                faceDetector = new FaceDetector();
                console.log('Face detection API supported');
                startFaceDetection();
            } else {
                // Fallback to manual face detection using basic color analysis
                console.log('Face detection API not supported, using fallback method');
                startFallbackFaceDetection();
            }
        } catch (error) {
            console.error('Face detection initialization error:', error);
            startFallbackFaceDetection();
        }
    }
    
    // Face detection with the FaceDetector API
    async function startFaceDetection() {
        if (processingFrame || !video.srcObject) return;
        
        processingFrame = true;
        
        try {
            // Draw current frame to detection canvas (smaller size for performance)
            detectionCtx.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);
            
            // Detect faces
            const faces = await faceDetector.detect(detectionCanvas);
            
            // Check if a face is detected and in the right position
            if (faces.length > 0) {
                // Get face coordinates relative to the canvas
                const face = faces[0];
                const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
                const faceCenterY = face.boundingBox.y + face.boundingBox.height / 2;
                
                // Calculate center of the canvas
                const canvasCenterX = detectionCanvas.width / 2;
                const canvasCenterY = detectionCanvas.height / 2;
                
                // Check if face is centered enough
                const distanceFromCenter = Math.sqrt(
                    Math.pow(faceCenterX - canvasCenterX, 2) + 
                    Math.pow(faceCenterY - canvasCenterY, 2)
                );
                
                // Calculate max allowed distance (30% of canvas width)
                const maxDistance = detectionCanvas.width * 0.3;
                
                // Check if face is centered and big enough
                if (distanceFromCenter < maxDistance && face.boundingBox.width > detectionCanvas.width * 0.3) {
                    if (!faceDetected) {
                        faceDetected = true;
                        updateFaceStatus(true);
                    }
                } else {
                    if (faceDetected) {
                        faceDetected = false;
                        updateFaceStatus(false);
                    }
                    
                    // Give guidance
                    if (distanceFromCenter >= maxDistance) {
                        guidanceText.textContent = "Move closer to the center";
                    } else {
                        guidanceText.textContent = "Move closer to the camera";
                    }
                }
            } else {
                if (faceDetected) {
                    faceDetected = false;
                    updateFaceStatus(false);
                }
                guidanceText.textContent = "No face detected";
            }
        } catch (error) {
            console.error('Face detection error:', error);
        }
        
        processingFrame = false;
        
        // Continue detection
        requestAnimationFrame(startFaceDetection);
    }
    
    // Fallback face detection using basic image analysis
    function startFallbackFaceDetection() {
        if (processingFrame || !video.srcObject) return;
        
        processingFrame = true;
        
        try {
            // Draw current frame to detection canvas
            detectionCtx.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);
            
            // Get image data for analysis
            const imageData = detectionCtx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
            const data = imageData.data;
            
            // Simple face detection using skin color detection in center area
            const centerRegionData = getCenterRegionData(data, detectionCanvas.width, detectionCanvas.height);
            const skinPixelsPercentage = detectSkinPixels(centerRegionData);
            
            // If more than 20% of pixels in center region are skin-colored, likely a face
            if (skinPixelsPercentage > 20) {
                if (!faceDetected) {
                    faceDetected = true;
                    updateFaceStatus(true);
                }
            } else {
                if (faceDetected) {
                    faceDetected = false;
                    updateFaceStatus(false);
                }
                guidanceText.textContent = "Position your face in the oval";
            }
        } catch (error) {
            console.error('Fallback face detection error:', error);
        }
        
        processingFrame = false;
        
        // Continue detection
        requestAnimationFrame(startFallbackFaceDetection);
    }
    
    // Get data for center region of the image
    function getCenterRegionData(data, width, height) {
        const centerRegionData = [];
        const centerX = Math.floor(width / 2);
        const centerY = Math.floor(height / 2);
        const regionSize = Math.floor(width * 0.4); // 40% of width
        
        // Collect pixel data from a circular region at center
        for (let y = centerY - regionSize; y < centerY + regionSize; y++) {
            if (y < 0 || y >= height) continue;
            
            for (let x = centerX - regionSize; x < centerX + regionSize; x++) {
                if (x < 0 || x >= width) continue;
                
                // Check if the pixel is within the oval
                const dx = (x - centerX) / regionSize;
                const dy = (y - centerY) / regionSize;
                if (dx*dx + dy*dy <= 1) {
                    const index = (y * width + x) * 4;
                    centerRegionData.push({
                        r: data[index],
                        g: data[index + 1],
                        b: data[index + 2]
                    });
                }
            }
        }
        
        return centerRegionData;
    }
    
    // Detect skin pixels in given data
    function detectSkinPixels(pixelData) {
        let skinPixelsCount = 0;
        
        for (const pixel of pixelData) {
            // Basic skin detection algorithm
            const { r, g, b } = pixel;
            
            // Rule-based skin detection
            if (
                r > 95 && g > 40 && b > 20 &&
                Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
                Math.abs(r - g) > 15 && 
                r > g && r > b
            ) {
                skinPixelsCount++;
            }
        }
        
        return (skinPixelsCount / pixelData.length) * 100;
    }
    
    // Update face detection status UI
    function updateFaceStatus(detected) {
        if (detected) {
            faceStatus.innerHTML = '<i class="fas fa-check-circle"></i> Face detected';
            faceStatus.className = 'face-status detected';
            guidanceText.textContent = "Perfect! Ready to capture";
            captureBtn.disabled = false;
        } else {
            faceStatus.innerHTML = '<i class="fas fa-times-circle"></i> Face not detected';
            faceStatus.className = 'face-status not-detected';
            captureBtn.disabled = true;
        }
    }
    
    // Start app initialization
    initializeApp();
    
    // Capture and analyze
    captureBtn.addEventListener('click', async () => {
        // Visual feedback for button press
        captureBtn.classList.add('animate__animated', 'animate__pulse');
        setTimeout(() => {
            captureBtn.classList.remove('animate__animated', 'animate__pulse');
        }, 500);
        
        // Draw video to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to data URL
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Display preview
        preview.src = imageData;
        preview.classList.remove('hidden');
        
        // Add captured effect
        preview.classList.add('animate__animated', 'animate__fadeIn');
        setTimeout(() => {
            preview.classList.remove('animate__animated', 'animate__fadeIn');
        }, 1000);
        
        // Show loading spinner
        loader.classList.remove('hidden');
        result.classList.add('hidden');
        
        try {
            // Send to server for analysis
            const response = await fetch('http://127.0.0.1:5000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }
            
            const data = await response.json();
            
            // Hide loader
            loader.classList.add('hidden');
            result.classList.remove('hidden');
            
            // Display result with animation
            result.classList.add('animate__animated', 'animate__fadeIn');
            result.innerHTML = formatResults(data.result);
            
            setTimeout(() => {
                result.classList.remove('animate__animated', 'animate__fadeIn');
            }, 1000);
            
        } catch (error) {
            console.error('Analysis error:', error);
            loader.classList.add('hidden');
            result.classList.remove('hidden');
            result.innerHTML = `<span style="color:#e74c3c">Analysis failed: ${error.message}</span>
                               <p>Please check your server connection and try again.</p>`;
        }
    });
    
    // Format the analysis results with icons and better formatting
    function formatResults(resultText) {
        // If the result is a simple string, return it
        if (!resultText.includes(':')) {
            return resultText;
        }
        
        // Try to parse structured data if available
        try {
            // Handle common format patterns
            const formattedHTML = resultText
                .split('\n')
                .map(line => {
                    if (line.trim() === '') return '';
                    
                    // Check if line has key-value format
                    if (line.includes(':')) {
                        const [key, value] = line.split(':').map(part => part.trim());
                        let icon = '';
                        
                        // Assign appropriate icons based on keywords
                        if (key.toLowerCase().includes('skin type')) {
                            icon = '<i class="fas fa-tint" style="color: var(--primary-color)"></i>';
                        } else if (key.toLowerCase().includes('hydration')) {
                            icon = '<i class="fas fa-water" style="color: var(--primary-color)"></i>';
                        } else if (key.toLowerCase().includes('wrinkle') || key.toLowerCase().includes('age')) {
                            icon = '<i class="fas fa-stopwatch" style="color: var(--primary-color)"></i>';
                        } else if (key.toLowerCase().includes('condition') || key.toLowerCase().includes('issue')) {
                            icon = '<i class="fas fa-exclamation-circle" style="color: var(--primary-color)"></i>';
                        } else if (key.toLowerCase().includes('recommendation')) {
                            icon = '<i class="fas fa-lightbulb" style="color: var(--accent-color)"></i>';
                        } else {
                            icon = '<i class="fas fa-check-circle" style="color: var(--primary-color)"></i>';
                        }
                        
                        return `<div class="result-item">
                                  <p>${icon} <strong>${key}:</strong> ${value}</p>
                                </div>`;
                    }
                    
                    // For lines without key-value format
                    return `<p>${line}</p>`;
                })
                .join('');
                
            return formattedHTML || resultText;
        } catch (e) {
            // Fallback to original text if parsing fails
            return resultText;
        }
    }
    
    // Add pulse animation to scan line
    const scanLine = document.querySelector('.scan-line');
    if (scanLine) {
        setInterval(() => {
            scanLine.style.opacity = '0.9';
            setTimeout(() => {
                scanLine.style.opacity = '0.4';
            }, 1500);
        }, 3000);
    }
});