// playtones.js - Generate and play count-in tones for music practice

// Generate a single tone with silence padding
function generateTone(frequency, toneDuration, sampleRate = 44100) {
    const numToneSamples = Math.floor(sampleRate * toneDuration);
    const samples = [];
    const volume = 0.3;
    
    for (let i = 0; i < numToneSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 20); // Decay envelope
        const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * volume;
        const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
        samples.push(intSample);
    }
    
    return samples;
}

// Generate complete count-in WAV file with all beeps pre-timed
function generateCountInWav(bpm, strokesPerBeat, sampleRate = 44100) {
    const initialDelay = 0.2; // 200ms initial silence
    const strokeDuration = 60 / bpm; // Duration of one stroke in seconds
    const toneDuration = 0.08; // 80ms tone
    const totalStrokes = strokesPerBeat * 2; // 2 beats (or measures)
    
    // Calculate total samples needed
    const numInitialSilence = Math.floor(sampleRate * initialDelay);
    const samplesPerStroke = Math.floor(sampleRate * strokeDuration);
    const totalSamples = numInitialSilence + (samplesPerStroke * totalStrokes);
    
    // Create array to hold all samples
    const allSamples = new Int16Array(totalSamples);
    
    // Initial silence (already zeros)
    
    // Generate each stroke at exact position
    for (let stroke = 0; stroke < totalStrokes; stroke++) {
        const isAccent = (stroke % strokesPerBeat === 0);
        const frequency = isAccent ? 1200 : 800;
        
        // Generate tone samples
        const toneSamples = generateTone(frequency, toneDuration, sampleRate);
        
        // Calculate exact position for this stroke
        const strokePosition = numInitialSilence + (stroke * samplesPerStroke);
        
        // Copy tone samples into the main array
        for (let i = 0; i < toneSamples.length && (strokePosition + i) < totalSamples; i++) {
            allSamples[strokePosition + i] = toneSamples[i];
        }
    }
    
    // Create WAV file with all the samples
    const numChannels = 1;
    const bitsPerSample = 16;
    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);
    
    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * 2, true);
    writeString(view, 8, 'WAVE');
    
    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    
    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalSamples * 2, true);
    
    // Write all samples
    for (let i = 0; i < totalSamples; i++) {
        view.setInt16(44 + i * 2, allSamples[i], true);
    }
    
    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Play a count-in with specified BPM and time signature
 * All beeps are pre-generated in a single WAV file with precise timing
 * @param {number} bpm - Beats per minute (tempo)
 * @param {number} strokesPerBeat - Number of strokes (ticks) per beat (e.g., 4 for quarter notes, 3 for triplets, 6 for eighth notes)
 * @param {Function} onComplete - Optional callback when count-in completes
 * @param {Function} onTick - Optional callback for each tick with (tickNumber, isAccent)
 */
function playCountInTones(bpm, strokesPerBeat = 4, onComplete = null, onTick = null) {
    // Validate inputs
    if (!bpm || bpm < 40 || bpm > 240) {
        console.error('Invalid BPM:', bpm);
        return false;
    }
    
    if (!strokesPerBeat || strokesPerBeat < 2 || strokesPerBeat > 12) {
        console.error('Invalid strokes per beat:', strokesPerBeat);
        return false;
    }

    try {
        console.log(`Playing count-in: ${bpm} BPM, ${strokesPerBeat} strokes per beat`);
        
        // Generate complete WAV file with all beeps at exact positions
        const wavBuffer = generateCountInWav(bpm, strokesPerBeat);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        const wavUrl = URL.createObjectURL(wavBlob);
        
        // Play the entire count-in as one audio file
        const audio = new Audio(wavUrl);
        audio.volume = 1.0;
        
        // Calculate total duration for completion callback
        const strokeDuration = (60 / bpm) * 1000;
        const totalDuration = (strokesPerBeat * 2 * strokeDuration) + 200; // +200ms for initial delay
        
        // Optional: Schedule onTick callbacks at the right times
        if (onTick) {
            const totalStrokes = strokesPerBeat * 2;
            for (let i = 0; i < totalStrokes; i++) {
                const tickTime = 200 + (i * strokeDuration); // +200ms for initial delay
                const isAccent = (i % strokesPerBeat === 0);
                setTimeout(() => {
                    onTick(i + 1, isAccent);
                }, tickTime);
            }
        }
        
        // Call onComplete when audio actually finishes playing
        audio.addEventListener('ended', () => {
            URL.revokeObjectURL(wavUrl);
            console.log('Count-in audio ended');
            if (onComplete) {
                onComplete();
            }
        });
        
        // Play and cleanup
        audio.play().then(() => {
            console.log('Count-in started');
        }).catch((error) => {
            console.error('Error playing count-in:', error);
            if (onComplete) onComplete();
        });
        
        return true;
    } catch (error) {
        console.error('Error in playCountInTones:', error);
        return false;
    }
}
