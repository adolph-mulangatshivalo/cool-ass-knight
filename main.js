document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('sequenceCanvas');
  const ctx = canvas.getContext('2d');

  const rightContent = document.querySelector('.right-content');
  const headline = document.querySelector('.right-headline');
  const loadingScreen = document.getElementById('loadingScreen');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  // Change text dynamically based on device/window size
  function updateHeadlineText() {
    if (!headline) return;
    const isMobileSize = window.innerWidth <= 768;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isMobileSize || isTouch) {
      headline.innerText = 'Swipe left or right.';
    } else {
      headline.innerText = 'Move mouse to the left or right.';
    }
  }

  // Animation state
  let isLoaded = false;
  let currentFrameIndex = 0;
  let targetFrameIndex = 0;
  const frames = [];
  const FPS = 24;

  // Parallax text state
  let targetTextX = 0;
  let targetTextY = 0;
  let currentTextX = 0;
  let currentTextY = 0;
  const textMovementStrength = 15;

  // Easing factor (lower = smoother/slower, higher = snappier)
  const ease = 0.08;

  // Setup Video
  const video = document.createElement('video');
  video.src = 'background video scrub.mp4';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Handle Resize
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    updateHeadlineText();

    if (isLoaded) {
      renderFrame(Math.round(currentFrameIndex));
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Draw blended frames from memory to canvas
  function renderFrame(index) {
    const frameA = Math.floor(index);
    const frameB = Math.min(frames.length - 1, frameA + 1);
    const fraction = index - frameA;

    if (!frames[frameA]) return;

    const imgA = frames[frameA];
    const scale = Math.max(window.innerWidth / imgA.width, window.innerHeight / imgA.height);
    const w = imgA.width * scale;
    const h = imgA.height * scale;
    const x = (window.innerWidth - w) / 2;
    const y = (window.innerHeight - h) / 2;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    // Draw base frame
    ctx.globalAlpha = 1.0;
    ctx.drawImage(imgA, x, y, w, h);

    // Draw next frame on top with opacity based on how close we are to it
    if (fraction > 0 && frames[frameB] && frameA !== frameB) {
      ctx.globalAlpha = fraction;
      ctx.drawImage(frames[frameB], x, y, w, h);
      ctx.globalAlpha = 1.0; // reset
    }
  }

  // Extract Frames from Video to Memory
  let hasLoaded = false;

  video.addEventListener('loadeddata', async () => {
    if (video.readyState >= 2 && !hasLoaded) {
      hasLoaded = true;

      const numFrames = Math.floor(video.duration * FPS);

      for (let i = 0; i <= numFrames; i++) {
        video.currentTime = i / FPS;

        // Wait for the video to seek to this specific frame
        await new Promise(r => {
          video.addEventListener('seeked', r, { once: true });
        });

        // Extract the raw pixels into memory so we never have to decode it again
        let frameData;
        if (window.createImageBitmap) {
          frameData = await createImageBitmap(video);
        } else {
          const offscreen = document.createElement('canvas');
          offscreen.width = video.videoWidth;
          offscreen.height = video.videoHeight;
          offscreen.getContext('2d').drawImage(video, 0, 0);
          frameData = offscreen;
        }
        frames.push(frameData);

        // Update progress bar
        const progress = (i / numFrames) * 100;
        progressBar.style.width = `${progress}%`;
        progressText.innerText = `Loading in a bit... ${Math.round(progress)}%`;
      }

      // All frames extracted!
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        document.body.classList.add('content-loaded');
        isLoaded = true;
        renderFrame(0);
        requestAnimationFrame(update);
      }, 500);
    }
  });

  video.load();

  // --- CONFIGURATION ---
  const knightFacesCameraTime = 0.8;
  const knightFacesCameraFrame = Math.round(knightFacesCameraTime * FPS);

  let stopTimer;

  // Helper for input
  function handleInput(x, y) {
    if (!isLoaded || frames.length === 0) return;

    const xRatio = x / window.innerWidth;

    // Map the center of the screen (0.5) to the `knightFacesCameraFrame`
    if (xRatio < 0.5) {
      targetFrameIndex = (xRatio / 0.5) * knightFacesCameraFrame;
    } else {
      targetFrameIndex = knightFacesCameraFrame + ((xRatio - 0.5) / 0.5) * ((frames.length - 1) - knightFacesCameraFrame);
    }

    targetFrameIndex = Math.max(0, Math.min(targetFrameIndex, frames.length - 1));

    // Parallax targets
    const xAxis = (window.innerWidth / 2 - x) / (window.innerWidth / 2);
    const yAxis = (window.innerHeight / 2 - y) / (window.innerHeight / 2);

    targetTextX = -(xAxis * textMovementStrength);
    targetTextY = -(yAxis * textMovementStrength);

    // When the mouse stops moving, snap to the nearest perfect frame to remove the blur
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      targetFrameIndex = Math.round(targetFrameIndex);
    }, 150);
  }

  // Mouse Input
  document.addEventListener('mousemove', (e) => {
    handleInput(e.pageX, e.pageY);
  });

  let lastTouchX = null;
  const swipeSensitivity = 1.5; // Adjust this to make swiping faster or slower

  // Touch Input (Relative Swiping)
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      lastTouchX = e.touches[0].pageX;
      // We purposefully DO NOT call handleInput here so the video doesn't jump on tap
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    // Prevent the browser from dragging the webpage around while swiping!
    e.preventDefault(); 
    
    if (e.touches.length > 0 && lastTouchX !== null && isLoaded && frames.length > 0) {
      const currentX = e.touches[0].pageX;
      const deltaX = currentX - lastTouchX;
      
      // Increment the frame index relative to how far the user swiped
      const frameDelta = (deltaX / window.innerWidth) * (frames.length - 1) * swipeSensitivity;
      targetFrameIndex += frameDelta;
      
      // Clamp to ensure it doesn't scroll past the video bounds
      targetFrameIndex = Math.max(0, Math.min(targetFrameIndex, frames.length - 1));
      
      // Update parallax based on absolute finger position
      const xAxis = (window.innerWidth / 2 - currentX) / (window.innerWidth / 2);
      const yAxis = (window.innerHeight / 2 - e.touches[0].pageY) / (window.innerHeight / 2);
      targetTextX = -(xAxis * textMovementStrength);
      targetTextY = -(yAxis * textMovementStrength);
      
      lastTouchX = currentX;

      // When the finger stops swiping, snap to the nearest perfect frame to remove the blur
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        targetFrameIndex = Math.round(targetFrameIndex);
      }, 150);
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    lastTouchX = null; // Reset swipe tracking
  });

  // Render Loop
  function update() {
    // Lerp memory frame index
    const diff = targetFrameIndex - currentFrameIndex;

    if (Math.abs(diff) > 0.001) {
      currentFrameIndex += diff * ease;
      const clampedIndex = Math.max(0, Math.min(frames.length - 1, currentFrameIndex));
      renderFrame(clampedIndex); // Pass the exact decimal index for blending!
    }

    // Lerp text parallax
    currentTextX += (targetTextX - currentTextX) * ease;
    currentTextY += (targetTextY - currentTextY) * ease;

    if (rightContent) {
      const isMobile = window.innerWidth <= 768;
      const baseX = isMobile ? '50%' : '0px';
      const baseY = isMobile ? '0px' : '-50%';
      rightContent.style.transform = `translate(calc(${baseX} + ${currentTextX}px), calc(${baseY} + ${currentTextY}px))`;
    }

    requestAnimationFrame(update);
  }
});
